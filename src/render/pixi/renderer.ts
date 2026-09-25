import { writeFieldRaster } from "../fieldRaster";
import { writeDensityRaster } from "../densityRaster";
import { parseOrganismPresentationIdentity, type OrganismPresentationIdentity } from "../organismPresentationIdentity";
import { Application, Container, Graphics, Sprite, Texture } from "pixi.js";
import { petraVisualColor } from "../../design/visualTokens";
import { extractFieldContourSegments } from "../fieldContours";
import { sampleRepresentativeGlyphs } from "../lod";
import { resolveLineageAppearance } from "../lineageAppearance";
import {
  resolveSharedLineageDensityMaximum,
} from "../lineageDensityPresentation";
import { extractLineageDensityContourSegments } from "../lineageDensityContours";
import {
  resolveOverlayPresentation,
} from "../overlayPresentation";
import { resolveLineagePattern, type LineagePatternToken } from "../lineagePatterns";
import {
  semanticZoomLevel,
  type CameraView,
  type DishSelectionHighlight,
  type SemanticZoomLevel,
  type DishRenderSnapshot,
  type RenderField,
  type RenderLineage,
} from "../model";
import {
  isScreenPointInsideDishAperture,
  panCamera,
  resolveDishViewportGeometry,
  screenToDish,
  zoomAroundDishPoint,
  type ScreenPoint,
} from "./camera";
import {
  applyDirectCamera as applyDirectCameraState,
  beginRebasedCameraTransition,
  completeCameraTransitionAtRendered,
  retargetWheelZoomFromRendered,
  wheelZoomWouldChangePendingTarget,
  type CameraTransitionState,
} from "./cameraInteraction";
import {
  applyKeyboardCameraKey,
  keyboardCameraModifiersAllowInput,
} from "./keyboardCamera";
import {
  beginPointerGestureInDishAperture,
  createPointerGestureState,
  endPointerGesture,
  movePointerGesture,
} from "./pointerGesture";
import { createResizeRedrawScheduler } from "./resizeScheduler";
import {
  rendererResolutionForDevicePixelRatio,
  watchRendererResolution,
} from "./rendererResolution";
import {
  cameraTransitionComplete,
  copyCameraMotionSpec,
  interpolateCameraTransition,
  type CameraMotionSpec,
} from "./cameraMotion";
import { updateCameraMotionRuntime } from "./cameraMotionLifecycle";
import { resolveSnapshotOverlayUpdate } from "./snapshotOverlay";
import { createSemanticZoomLevelObserver } from "../semanticZoomObserver";
import { wheelZoomFactor } from "./wheelZoom";
import {
  advanceDishVisualTransition,
  copyDishVisualMotionSpec,
  planDishVisualTransition,
  type DishDrawableState,
  type DishVisualMotionSpec,
  type DishVisualState,
  type DishVisualTransition,
} from "../visualInterpolation";
import {
  onePointerPanOwnedAtGestureStart,
  rendererOwnsGestureIntent,
  rendererTouchActionForNextGesture,
} from "./touchOwnership";
import { resolveDishActivationPoint } from "./dishActivation";

export type RendererMotionMode = "full" | "reduced" | "off";

export interface PixiDishOptions {
  readonly motion?: RendererMotionMode;
  readonly cameraMotion: CameraMotionSpec;
  readonly visualMotion: DishVisualMotionSpec;
  readonly overlayId?: string | null;
  readonly maxRepresentativeGlyphs?: number;
  readonly onSemanticZoomLevelChange?: (level: SemanticZoomLevel) => void;
  /** Presentation-only normalized dish activation for inspector/query adapters. */
  readonly onDishPointActivate?: (point: ScreenPoint) => boolean;
}

export interface PixiDishRenderer {
  update(snapshot: DishRenderSnapshot): void;
  updatePresentation(
    snapshot: DishRenderSnapshot,
    overlayId: string | null,
    organismPresentation?: OrganismPresentationIdentity | null,
  ): void;
  setSelection(selection: DishSelectionHighlight | null): void;
  setOverlay(overlayId: string | null): void;
  setCameraMotion(spec: CameraMotionSpec): void;
  setVisualMotion(spec: DishVisualMotionSpec): void;
  setMotionMode(mode: RendererMotionMode): void;
  setCamera(camera: CameraView): void;
  focusDishPoint(point: ScreenPoint, zoom?: number): void;
  resetCamera(): void;
  destroy(): void;
}

const LINEAGE_PATTERN_COLOR = petraVisualColor("cream");
const DISH_PLATE_COLOR = petraVisualColor("inkSoft");
const DISH_RIM_COLOR = petraVisualColor("creamMuted");
const DISH_HIGHLIGHT_COLOR = petraVisualColor("cream");
const DISH_GLYPH_EDGE_COLOR = petraVisualColor("inkDeep");
const DISH_ACCENT_COLOR = petraVisualColor("teal");

type ClientCoordinateEvent = Pick<MouseEvent, "clientX" | "clientY">;

export async function createPixiDishRenderer(
  host: HTMLElement,
  options: PixiDishOptions,
): Promise<PixiDishRenderer> {
  const app = new Application();
  await app.init({
    resizeTo: host,
    backgroundAlpha: 0,
    antialias: true,
    autoDensity: true,
    resolution: rendererResolutionForDevicePixelRatio(
      globalThis.devicePixelRatio,
    ),
  });

  app.canvas.className = "petra-pixi-canvas";
  app.canvas.setAttribute("aria-hidden", "true");
  host.appendChild(app.canvas);

  const root = new Container();
  const plateLayer = new Graphics();
  const dishInteriorMask = new Graphics();
  const dataLayer = new Container();
  const fieldLayer = new Graphics();
  const densityLayer = new Graphics();
  const fieldCanvas = document.createElement("canvas");
  const fieldContext = fieldCanvas.getContext("2d")!;
  const fieldTexture = Texture.from(fieldCanvas);
  const fieldSprite = new Sprite(fieldTexture);
  let fieldImage: ImageData | null = null;
  const densityCanvas = document.createElement("canvas");
  const densityContext = densityCanvas.getContext("2d")!;
  const densityTexture = Texture.from(densityCanvas);
  const densitySprite = new Sprite(densityTexture);
  let densityImage: ImageData | null = null;
  const glyphLayer = new Graphics();
  const accentLayer = new Graphics();

  dataLayer.addChild(fieldSprite, fieldLayer, densitySprite, densityLayer, glyphLayer);
  dataLayer.mask = dishInteriorMask;
  root.addChild(plateLayer, dishInteriorMask, dataLayer, accentLayer);
  app.stage.addChild(root);

  let selection: DishSelectionHighlight | null = null;
  let organismPresentation: OrganismPresentationIdentity | null = null;
  let snapshot: DishRenderSnapshot | null = null;
  let drawableState: DishDrawableState | null = null;
  let visualTransition: DishVisualTransition | null = null;
  let visualElapsedMs = 0;
  let overlayId = options.overlayId ?? null;
  let motion: RendererMotionMode = options.motion ?? "full";
  let cameraMotion = copyCameraMotionSpec(options.cameraMotion);
  let visualMotion = copyDishVisualMotionSpec(options.visualMotion);
  let camera: CameraView = { centerX: 0.5, centerY: 0.5, zoom: 1 };
  let transitionStartCamera = camera;
  let targetCamera = camera;
  let cameraElapsedMs = cameraMotion.durationMs;
  let destroyed = false;
  let gestureState = createPointerGestureState();
  let onePointerPanOwned = false;
  let activationCandidate:
    | { readonly pointerId: number; readonly start: ScreenPoint }
    | null = null;
  const previousHostTouchAction = host.style.touchAction;

  const syncHostTouchAction = () => {
    const nextTouchAction = rendererTouchActionForNextGesture(camera);
    if (host.style.touchAction !== nextTouchAction) {
      host.style.touchAction = nextTouchAction;
    }
  };
  syncHostTouchAction();

  const maxRepresentativeGlyphs = options.maxRepresentativeGlyphs ?? 180;
  const semanticZoomObserver = createSemanticZoomLevelObserver((level) => {
    options.onSemanticZoomLevelChange?.(level);
  });

  // Development-only, bounded local profiling. These timings have no simulation authority.
  const drawTimes: number[] = [];
  const frameGaps: number[] = [];
  let lastFrameAt = performance.now();
  let lastReportAt = lastFrameAt;
  const render = () => {
    const drawStartedAt = import.meta.env.DEV ? performance.now() : 0;
    if (destroyed) return;
    syncHostTouchAction();
    if (drawableState === null) return;
    semanticZoomObserver.update(semanticZoomLevel(camera.zoom));
    drawScene({
      app,
      snapshot: drawableState,
      densitySprite,
      fieldSprite,
      updateFieldTexture(field) {
        if (fieldImage === null || fieldImage.width !== drawableState!.gridWidth || fieldImage.height !== drawableState!.gridHeight) {
          fieldCanvas.width = drawableState!.gridWidth;
          fieldCanvas.height = drawableState!.gridHeight;
          fieldTexture.source.resize(fieldCanvas.width, fieldCanvas.height);
          fieldImage = fieldContext.createImageData(fieldCanvas.width, fieldCanvas.height);
        }
        writeFieldRaster(drawableState!, field, fieldImage.data);
        fieldContext.putImageData(fieldImage, 0, 0);
        fieldTexture.source.update();
      },
      updateDensityTexture(maximum) {
        if (densityImage === null || densityImage.width !== drawableState!.gridWidth || densityImage.height !== drawableState!.gridHeight) {
          densityCanvas.width = drawableState!.gridWidth;
          densityCanvas.height = drawableState!.gridHeight;
          densityTexture.source.resize(densityCanvas.width, densityCanvas.height);
          densityImage = densityContext.createImageData(densityCanvas.width, densityCanvas.height);
        }
        writeDensityRaster(drawableState!, maximum, densityImage.data);
        densityContext.putImageData(densityImage, 0, 0);
        densityTexture.source.update();
      },
      organismPresentation,
      selection,
      camera,
      overlayId,
      motion,
      maxRepresentativeGlyphs,
      plateLayer,
      dishInteriorMask,
      fieldLayer,
      densityLayer,
      glyphLayer,
      accentLayer,
    });
    if (import.meta.env.DEV) {
      drawTimes.push(performance.now() - drawStartedAt);
      if (drawTimes.length > 600) drawTimes.shift();
    }
  };

  const applySnapshotOverlayUpdate = (
    nextSnapshot: DishRenderSnapshot,
    requestedOverlayId: string | null,
  ) => {
    const previousSnapshotId = snapshot?.snapshotId ?? null;
    const previousSamplingIdentity = snapshot?.samplingIdentity ?? null;
    const next = resolveSnapshotOverlayUpdate(
      { snapshot, overlayId },
      nextSnapshot,
      requestedOverlayId,
    );
    snapshot = next.snapshot;
    overlayId = next.overlayId;

    if (
      previousSnapshotId === next.snapshot.snapshotId &&
      previousSamplingIdentity === next.snapshot.samplingIdentity
    ) {
      render();
      return;
    }

    const from = drawableState;
    if (motion === "full" && from !== null) {
      const plan = planDishVisualTransition(
        from,
        next.snapshot,
        visualMotion,
      );
      if (plan.kind === "interpolate") {
        const initial = advanceDishVisualTransition(plan.transition, 0);
        drawableState = initial.state;
        visualTransition = initial.complete ? null : plan.transition;
        visualElapsedMs = 0;
        render();
        return;
      }
    }

    visualTransition = null;
    visualElapsedMs = 0;
    drawableState = next.snapshot;
    render();
  };

  const resizeScheduler = createResizeRedrawScheduler(
    () => app.resize(),
    render,
  );
  const resolutionEnvironment = {
    readDevicePixelRatio: () => globalThis.devicePixelRatio,
    ...(typeof globalThis.matchMedia === "function"
      ? {
          matchMedia: (query: string) => globalThis.matchMedia(query),
        }
      : {}),
  };
  const resolutionWatcher = watchRendererResolution(
    resolutionEnvironment,
    app.renderer.resolution,
    (resolution) => {
      app.renderer.resolution = resolution;
      resizeScheduler.schedule();
    },
  );
  const resizeObserver = new ResizeObserver(() => {
    resizeScheduler.schedule();
  });
  resizeObserver.observe(host);

  const readCameraTransitionState = (): CameraTransitionState => ({
    camera,
    transitionStartCamera,
    targetCamera,
    elapsedMs: cameraElapsedMs,
  });

  const writeCameraTransitionState = (state: CameraTransitionState) => {
    camera = state.camera;
    transitionStartCamera = state.transitionStartCamera;
    targetCamera = state.targetCamera;
    cameraElapsedMs = state.elapsedMs;
  };

  const beginCameraTransition = (nextTarget: CameraView) => {
    writeCameraTransitionState(
      beginRebasedCameraTransition(
        readCameraTransitionState(),
        nextTarget,
        {
          animate: motion === "full",
          durationMs: cameraMotion.durationMs,
        },
      ),
    );
  };

  const applyDirectCamera = (nextTarget: CameraView) => {
    writeCameraTransitionState(
      applyDirectCameraState(
        readCameraTransitionState(),
        nextTarget,
        cameraMotion.durationMs,
      ),
    );
  };

  const ticker = () => {
    if (import.meta.env.DEV) {
      const now = performance.now();
      frameGaps.push(now - lastFrameAt);
      lastFrameAt = now;
      if (frameGaps.length > 600) frameGaps.shift();
      if (now - lastReportAt >= 1000) {
        const percentile = (values: number[], p: number) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))] ?? 0;
        host.dataset.renderProfile = JSON.stringify({ sampleFrames: frameGaps.length,
          frameGapP50Ms: percentile(frameGaps, .5), frameGapP95Ms: percentile(frameGaps, .95),
          drawP50Ms: percentile(drawTimes, .5), drawP95Ms: percentile(drawTimes, .95) });
        lastReportAt = now;
      }
    }
    if (destroyed || motion !== "full") return;

    let changed = false;
    if (
      !cameraTransitionComplete({
        elapsedMs: cameraElapsedMs,
        durationMs: cameraMotion.durationMs,
      })
    ) {
      cameraElapsedMs += app.ticker.deltaMS;
      camera = interpolateCameraTransition({
        from: transitionStartCamera,
        to: targetCamera,
        elapsedMs: cameraElapsedMs,
        motion: cameraMotion,
      });
      changed = true;
    }

    if (visualTransition !== null) {
      visualElapsedMs += app.ticker.deltaMS;
      const step = advanceDishVisualTransition(
        visualTransition,
        visualElapsedMs,
      );
      drawableState = step.state;
      if (step.complete) {
        visualTransition = null;
        visualElapsedMs = 0;
      }
      changed = true;
    }

    if (changed) render();
  };
  app.ticker.add(ticker);

  const localPointer = (event: ClientCoordinateEvent): ScreenPoint => {
    const rect = app.canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / Math.max(rect.width, 1)) * app.screen.width,
      y: ((event.clientY - rect.top) / Math.max(rect.height, 1)) * app.screen.height,
    };
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const screen = localPointer(event);
    const viewport = { width: app.screen.width, height: app.screen.height };
    const startingNewGesture = gestureState.active.length === 0;
    const started = beginPointerGestureInDishAperture(
      gestureState,
      event.pointerId,
      screen,
      viewport,
    );
    gestureState = started.state;
    if (!started.accepted) return;

    if (startingNewGesture) {
      onePointerPanOwned = onePointerPanOwnedAtGestureStart(camera);
      activationCandidate =
        options.onDishPointActivate === undefined
          ? null
          : { pointerId: event.pointerId, start: screen };
    } else {
      // Multi-touch is camera gesture input, never a region activation.
      activationCandidate = null;
    }

    app.canvas.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent) => {
    const screen = localPointer(event);
    if (
      activationCandidate?.pointerId === event.pointerId &&
      resolveDishActivationPoint({
        start: activationCandidate.start,
        end: screen,
        viewport: { width: app.screen.width, height: app.screen.height },
        camera,
      }) === null
    ) {
      activationCandidate = null;
    }

    const moved = movePointerGesture(
      gestureState,
      event.pointerId,
      screen,
    );
    gestureState = moved.state;
    if (!moved.accepted || moved.intent.kind === "none") return;

    // Keep click/tap slop exclusive: while the first pointer is still a valid
    // activation candidate, sub-threshold motion must not also pan the camera.
    // Crossing the activation threshold clears the candidate above, after
    // which normal camera gesture ownership resumes.
    if (
      activationCandidate?.pointerId === event.pointerId &&
      moved.intent.kind === "pan"
    ) {
      return;
    }

    if (
      !rendererOwnsGestureIntent(
        moved.intent.kind,
        onePointerPanOwned,
      )
    ) {
      return;
    }

    writeCameraTransitionState(
      completeCameraTransitionAtRendered(
        readCameraTransitionState(),
        cameraMotion.durationMs,
      ),
    );
    event.preventDefault();
    const viewport = { width: app.screen.width, height: app.screen.height };

    if (moved.intent.kind === "pan") {
      applyDirectCamera(
        panCamera(camera, moved.intent.deltaScreen, viewport),
      );
      render();
      return;
    }

    const anchor = screenToDish(
      moved.intent.anchorScreen,
      viewport,
      camera,
    );
    const zoomed = zoomAroundDishPoint(
      camera,
      anchor,
      moved.intent.zoomFactor,
    );
    applyDirectCamera(
      panCamera(zoomed, moved.intent.centroidDelta, viewport),
    );
    render();
  };

  const finishPointer = (
    event: PointerEvent,
    allowActivation: boolean,
  ) => {
    const candidate = activationCandidate;
    const endingSinglePointer =
      gestureState.active.length === 1 &&
      gestureState.active[0]?.id === event.pointerId;
    const activated =
      allowActivation &&
      endingSinglePointer &&
      candidate?.pointerId === event.pointerId
        ? resolveDishActivationPoint({
            start: candidate.start,
            end: localPointer(event),
            viewport: { width: app.screen.width, height: app.screen.height },
            camera,
          })
        : null;

    gestureState = endPointerGesture(gestureState, event.pointerId);
    if (
      candidate?.pointerId === event.pointerId ||
      gestureState.active.length === 0
    ) {
      activationCandidate = null;
    }
    if (gestureState.active.length === 0) {
      onePointerPanOwned = false;
    }
    if (app.canvas.hasPointerCapture(event.pointerId)) {
      app.canvas.releasePointerCapture(event.pointerId);
    }
    if (activated !== null) {
      options.onDishPointActivate?.(activated);
    }
  };

  const onWheel = (event: WheelEvent) => {
    const screen = localPointer(event);
    const viewport = { width: app.screen.width, height: app.screen.height };
    if (!isScreenPointInsideDishAperture(screen, viewport)) return;

    const factor = wheelZoomFactor({
      deltaY: event.deltaY,
      deltaMode: event.deltaMode,
      viewportHeight: app.screen.height,
    });
    const state = readCameraTransitionState();
    if (!wheelZoomWouldChangePendingTarget(state, factor)) return;

    event.preventDefault();
    writeCameraTransitionState(
      retargetWheelZoomFromRendered({
        state,
        screen,
        viewport,
        factor,
        policy: {
          animate: motion === "full",
          durationMs: cameraMotion.durationMs,
        },
      }),
    );
    render();
  };

  const onDoubleClick = (event: MouseEvent) => {
    const screen = localPointer(event);
    const viewport = { width: app.screen.width, height: app.screen.height };
    if (!isScreenPointInsideDishAperture(screen, viewport)) return;

    const anchor = screenToDish(
      screen,
      viewport,
      camera,
    );
    beginCameraTransition({ centerX: anchor.x, centerY: anchor.y, zoom: 3.2 });
    render();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (!keyboardCameraModifiersAllowInput(event)) return;

    if (event.key === "Enter" && options.onDishPointActivate !== undefined) {
      const handled = options.onDishPointActivate({
        x: camera.centerX,
        y: camera.centerY,
      });
      if (handled) {
        event.preventDefault();
        return;
      }
    }

    const result = applyKeyboardCameraKey(
      targetCamera,
      event.key,
      { width: app.screen.width, height: app.screen.height },
    );
    if (!result.handled) return;

    event.preventDefault();
    beginCameraTransition(result.camera);
    render();
  };

  app.canvas.addEventListener("pointerdown", onPointerDown);
  app.canvas.addEventListener("pointermove", onPointerMove);
  const onPointerUp = (event: PointerEvent) => finishPointer(event, true);
  const onPointerCancel = (event: PointerEvent) => finishPointer(event, false);
  app.canvas.addEventListener("pointerup", onPointerUp);
  app.canvas.addEventListener("pointercancel", onPointerCancel);
  app.canvas.addEventListener("wheel", onWheel, { passive: false });
  app.canvas.addEventListener("dblclick", onDoubleClick);
  host.addEventListener("keydown", onKeyDown);

  return {
    update(nextSnapshot) {
      applySnapshotOverlayUpdate(nextSnapshot, overlayId);
    },

    updatePresentation(nextSnapshot, nextOverlayId, presentation = null) {
      organismPresentation = presentation === null ? null : parseOrganismPresentationIdentity(presentation);
      applySnapshotOverlayUpdate(nextSnapshot, nextOverlayId);
    },

    setSelection(nextSelection) {
      selection = nextSelection;
      render();
    },

    setOverlay(nextOverlayId) {
      if (
        nextOverlayId !== null &&
        snapshot !== null &&
        !snapshot.fields.some((field) => field.id === nextOverlayId)
      ) {
        throw new RangeError(`unknown render overlay: ${nextOverlayId}`);
      }
      overlayId = nextOverlayId;
      render();
    },

    setCameraMotion(nextSpec) {
      const update = updateCameraMotionRuntime(
        {
          transition: readCameraTransitionState(),
          spec: cameraMotion,
        },
        nextSpec,
        motion === "full",
      );
      if (!update.changed) return;

      cameraMotion = update.state.spec;
      writeCameraTransitionState(update.state.transition);
      render();
    },

    setVisualMotion(nextSpec) {
      visualMotion = copyDishVisualMotionSpec(nextSpec);
    },

    setMotionMode(nextMode) {
      motion = nextMode;
      if (motion !== "full") {
        camera = targetCamera;
        transitionStartCamera = targetCamera;
        cameraElapsedMs = cameraMotion.durationMs;
        visualTransition = null;
        visualElapsedMs = 0;
        drawableState = snapshot;
      }
      render();
    },

    setCamera(nextCamera) {
      beginCameraTransition(nextCamera);
      render();
    },

    focusDishPoint(point, zoom = 3.2) {
      beginCameraTransition({ centerX: point.x, centerY: point.y, zoom });
      render();
    },

    resetCamera() {
      beginCameraTransition({ centerX: 0.5, centerY: 0.5, zoom: 1 });
      render();
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      resizeObserver.disconnect();
      resolutionWatcher.dispose();
      semanticZoomObserver.dispose();
      resizeScheduler.cancel();
      app.canvas.removeEventListener("pointerdown", onPointerDown);
      app.canvas.removeEventListener("pointermove", onPointerMove);
      app.canvas.removeEventListener("pointerup", onPointerUp);
      app.canvas.removeEventListener("pointercancel", onPointerCancel);
      app.canvas.removeEventListener("wheel", onWheel);
      app.canvas.removeEventListener("dblclick", onDoubleClick);
      host.removeEventListener("keydown", onKeyDown);
      app.ticker.remove(ticker);
      host.style.touchAction = previousHostTouchAction;
      densityTexture.destroy(true);
      fieldTexture.destroy(true);
      app.destroy({ removeView: true }, { children: true });
    },
  };
}

function drawScene(args: {
  readonly app: Application;
  readonly densitySprite: Sprite;
  readonly fieldSprite: Sprite;
  readonly updateFieldTexture: (field: RenderField | null) => void;
  readonly updateDensityTexture: (maximum: number) => void;
  readonly snapshot: DishDrawableState;
  readonly organismPresentation: OrganismPresentationIdentity | null;
  readonly selection: DishSelectionHighlight | null;
  readonly camera: CameraView;
  readonly overlayId: string | null;
  readonly motion: RendererMotionMode;
  readonly maxRepresentativeGlyphs: number;
  readonly plateLayer: Graphics;
  readonly dishInteriorMask: Graphics;
  readonly fieldLayer: Graphics;
  readonly densityLayer: Graphics;
  readonly glyphLayer: Graphics;
  readonly accentLayer: Graphics;
}): void {
  const {
    app,
    densitySprite,
    fieldSprite,
    updateFieldTexture,
    updateDensityTexture,
    snapshot,
    camera,
    overlayId,
    motion,
    maxRepresentativeGlyphs,
    organismPresentation,
    selection,
    plateLayer,
    dishInteriorMask,
    fieldLayer,
    densityLayer,
    glyphLayer,
    accentLayer,
  } = args;

  const geometry = resolveDishViewportGeometry({
    width: app.screen.width,
    height: app.screen.height,
  });
  const dishSize = geometry.diameter;
  const centerX = geometry.centerX;
  const centerY = geometry.centerY;
  const radius = geometry.radius;
  const level = semanticZoomLevel(camera.zoom);

  for (const layer of [
    plateLayer,
    dishInteriorMask,
    fieldLayer,
    densityLayer,
    glyphLayer,
    accentLayer,
  ]) {
    layer.clear();
  }

  dishInteriorMask
    .circle(geometry.centerX, geometry.centerY, geometry.radius)
    .fill({ color: 0xffffff });

  plateLayer
    .circle(centerX, centerY, radius)
    .fill({ color: DISH_PLATE_COLOR, alpha: 0.98 })
    .stroke({ color: DISH_RIM_COLOR, alpha: 0.62, width: Math.max(1.5, dishSize * 0.006) });
  plateLayer.circle(centerX, centerY, radius * .985)
    .fill({ color: petraVisualColor("teal"), alpha: .14 })
    .stroke({ color: petraVisualColor("mint"), alpha: .23, width: dishSize * .018 });
  plateLayer.circle(centerX, centerY, radius * .96)
    .stroke({ color: DISH_HIGHLIGHT_COLOR, alpha: .16, width: dishSize * .006 });

  const overlay =
    overlayId === null
      ? snapshot.fields.find((field) => field.kind === "antibiotic") ?? null
      : snapshot.fields.find((field) => field.id === overlayId) ?? null;

  updateFieldTexture(overlay);
  fieldSprite.position.set(centerX - camera.centerX * dishSize * camera.zoom, centerY - camera.centerY * dishSize * camera.zoom);
  fieldSprite.width = dishSize * camera.zoom;
  fieldSprite.height = dishSize * camera.zoom;
  if (overlay !== null) {
    drawField(fieldLayer, overlay, snapshot, camera, centerX, centerY, dishSize);
  }

  const lineageDensityMaximum =
    resolveSharedLineageDensityMaximum(snapshot);

  updateDensityTexture(lineageDensityMaximum);
  densitySprite.position.set(centerX - camera.centerX * dishSize * camera.zoom, centerY - camera.centerY * dishSize * camera.zoom);
  densitySprite.width = dishSize * camera.zoom;
  densitySprite.height = dishSize * camera.zoom;
  snapshot.lineages.forEach((lineage) => {
    drawLineageDensity(
      densityLayer,
      lineage,
      snapshot,
      camera,
      centerX,
      centerY,
      dishSize,
      resolveLineageAppearance(lineage.appearanceToken).color,
      lineageDensityMaximum,
    );
  });

  if (organismPresentation !== null || level !== "dish") {
    const glyphs = sampleRepresentativeGlyphs(snapshot, camera, level === "dish" ? "colony" : level, {
      maxGlyphs: Math.min(maxRepresentativeGlyphs, level === "dish" ? 140 : 260),
      minimumDensity: lineageDensityMaximum * 0.12,
    });
    const occupiedGlyphPositions: ScreenPoint[] = [];
    for (const glyph of glyphs) {
      const lineage = snapshot.lineages.find(
        (candidate) => candidate.id === glyph.lineageId,
      );
      if (lineage === undefined) continue;
      const color = resolveLineageAppearance(lineage.appearanceToken).color;
      const point = dishToScreen(
        glyph.x,
        glyph.y,
        camera,
        centerX,
        centerY,
        dishSize,
      );
      const spacing = level === "dish" ? 11 : 16;
      if (occupiedGlyphPositions.some(previous => (previous.x - point.x) ** 2 + (previous.y - point.y) ** 2 < spacing ** 2)) continue;
      occupiedGlyphPositions.push(point);
      const strength = Math.sqrt(glyph.weight / Math.max(lineageDensityMaximum, Number.EPSILON));
      const glyphRadius = Math.max(2.2, (level === "dish" ? 4.3 : 5.2) * Math.min(camera.zoom, 3)) * (0.55 + strength * 0.45);
      if (organismPresentation?.morphology === "rod") {
        // Stable illustration pose, NOT orientation, motility, cell size, or a cell count.
        const angle = (glyph.cellIndex * 2.399963 + glyph.lineageId.length) % Math.PI;
        const dx = Math.cos(angle) * glyphRadius;
        const dy = Math.sin(angle) * glyphRadius;
        glyphLayer.moveTo(point.x - dx, point.y - dy + 1.5).lineTo(point.x + dx, point.y + dy + 1.5)
          .stroke({ color: DISH_GLYPH_EDGE_COLOR, alpha: 0.3, width: glyphRadius * 1.5, cap: "round" });
        glyphLayer.moveTo(point.x - dx, point.y - dy).lineTo(point.x + dx, point.y + dy)
          .stroke({ color, alpha: 0.65 + strength * 0.3, width: glyphRadius * 1.4, cap: "round" });
        glyphLayer.moveTo(point.x - dx * 0.65 - .6, point.y - dy * .65 - .8).lineTo(point.x + dx * .3 - .6, point.y + dy * .3 - .8)
          .stroke({ color: DISH_HIGHLIGHT_COLOR, alpha: .35, width: Math.max(.8, glyphRadius * .3), cap: "round" });
        if (lineage.patternToken === "double-ring") {
          glyphLayer.circle(point.x, point.y, glyphRadius * .45).stroke({ color: LINEAGE_PATTERN_COLOR, alpha: .8, width: 1 });
        }
      } else {
        glyphLayer.circle(point.x, point.y, glyphRadius).fill({ color, alpha: .88 });
        drawLineagePatternRings(glyphLayer, point, glyphRadius + 1.8, lineage.patternToken, .72, 1.1);
      }
    }
  }

  if (selection !== null) {
    const selected = dishToScreen(selection.centerX, selection.centerY, camera, centerX, centerY, dishSize);
    glyphLayer.circle(selected.x, selected.y, selection.radius * dishSize * camera.zoom)
      .stroke({ color: petraVisualColor("mint"), width: 2, alpha: .95 });
    glyphLayer.circle(selected.x, selected.y, 3).fill({ color: petraVisualColor("mint") });
  }
  const accentAlpha = motion === "off" ? 0.12 : 0.16;
  accentLayer
    .circle(centerX, centerY, radius * 0.985)
    .stroke({ color: DISH_ACCENT_COLOR, alpha: accentAlpha, width: Math.max(1, dishSize * 0.003) });
}

function drawField(
  graphics: Graphics,
  field: RenderField,
  snapshot: DishVisualState,
  camera: CameraView,
  centerX: number,
  centerY: number,
  dishSize: number,
): void {
  const presentation = resolveOverlayPresentation(field.kind);
  const contours = extractFieldContourSegments({
    field,
    dishMask: snapshot.dishMask,
    gridWidth: snapshot.gridWidth,
    gridHeight: snapshot.gridHeight,
  });
  const contourWidth = Math.max(0.9, Math.min(1.8, dishSize * 0.0018));
  for (const level of new Set(contours.map(segment => segment.level))) {
    for (const segment of contours) {
      if (segment.level !== level) continue;
      const from = dishToScreen(segment.from.x, segment.from.y, camera, centerX, centerY, dishSize);
      const to = dishToScreen(segment.to.x, segment.to.y, camera, centerX, centerY, dishSize);
      graphics.moveTo(from.x, from.y).lineTo(to.x, to.y);
    }
    graphics.stroke({ color: presentation.positiveColor, alpha: .24 + level * .28, width: contourWidth });
  }
}

function drawLineageDensity(
  graphics: Graphics,
  lineage: RenderLineage,
  snapshot: DishVisualState,
  camera: CameraView,
  centerX: number,
  centerY: number,
  dishSize: number,
  color: number,
  sharedMaximum: number,
): void {
  if (sharedMaximum <= 0) return;

  const contourSegments = extractLineageDensityContourSegments({
    lineage,
    dishMask: snapshot.dishMask,
    gridWidth: snapshot.gridWidth,
    gridHeight: snapshot.gridHeight,
    sharedMaximum,
  });
  const contourBaseWidth = Math.max(
    0.8,
    Math.min(1.7, dishSize * 0.0016),
  );
  const contourPattern = resolveLineagePattern(lineage.patternToken);
  for (const contourLevel of new Set(contourSegments.map(segment => segment.level))) {
    const segments = contourSegments.filter(segment => segment.level === contourLevel);
    const path = () => {
      for (const segment of segments) {
        const from = dishToScreen(segment.from.x, segment.from.y, camera, centerX, centerY, dishSize);
        const to = dishToScreen(segment.to.x, segment.to.y, camera, centerX, centerY, dishSize);
        graphics.moveTo(from.x, from.y).lineTo(to.x, to.y);
      }
    };
    for (const scale of contourPattern.ringScales) {
      path();
      graphics.stroke({ color: LINEAGE_PATTERN_COLOR, alpha: .035 + contourLevel * .055,
        width: contourBaseWidth * (1.25 + scale * .7) });
    }
    path();
    graphics.stroke({ color, alpha: .15 + contourLevel * .32, width: contourBaseWidth });
  }
}

function drawLineagePatternRings(
  graphics: Graphics,
  point: ScreenPoint,
  radius: number,
  patternToken: LineagePatternToken,
  alpha: number,
  width: number,
): void {
  const pattern = resolveLineagePattern(patternToken);
  for (const scale of pattern.ringScales) {
    graphics
      .circle(point.x, point.y, Math.max(1, radius * scale))
      .stroke({ color: LINEAGE_PATTERN_COLOR, alpha, width });
  }
}

function dishToScreen(
  x: number,
  y: number,
  camera: CameraView,
  centerX: number,
  centerY: number,
  dishSize: number,
): ScreenPoint {
  return {
    x: centerX + (x - camera.centerX) * dishSize * camera.zoom,
    y: centerY + (y - camera.centerY) * dishSize * camera.zoom,
  };
}

