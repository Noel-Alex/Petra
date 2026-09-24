import { Application, Container, Graphics } from "pixi.js";
import { gridCellCenter } from "../gridGeometry";
import { sampleRepresentativeGlyphs } from "../lod";
import { resolveLineageAppearance } from "../lineageAppearance";
import {
  projectComparableLineageDensity,
  resolveSharedLineageDensityMaximum,
} from "../lineageDensityPresentation";
import {
  overlayPatternMultiplier,
  projectOverlayScalar,
  resolveOverlayPresentation,
} from "../overlayPresentation";
import { resolveLineagePattern, type LineagePatternToken } from "../lineagePatterns";
import {
  semanticZoomLevel,
  type CameraView,
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

export type RendererMotionMode = "full" | "reduced" | "off";

export interface PixiDishOptions {
  readonly motion?: RendererMotionMode;
  readonly cameraMotion: CameraMotionSpec;
  readonly overlayId?: string | null;
  readonly maxRepresentativeGlyphs?: number;
  readonly onSemanticZoomLevelChange?: (level: SemanticZoomLevel) => void;
}

export interface PixiDishRenderer {
  update(snapshot: DishRenderSnapshot): void;
  updatePresentation(
    snapshot: DishRenderSnapshot,
    overlayId: string | null,
  ): void;
  setOverlay(overlayId: string | null): void;
  setCameraMotion(spec: CameraMotionSpec): void;
  setMotionMode(mode: RendererMotionMode): void;
  setCamera(camera: CameraView): void;
  focusDishPoint(point: ScreenPoint, zoom?: number): void;
  resetCamera(): void;
  destroy(): void;
}

const LINEAGE_PATTERN_COLOR = 0xf4f7fb;

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
  const glyphLayer = new Graphics();
  const accentLayer = new Graphics();

  dataLayer.addChild(fieldLayer, densityLayer, glyphLayer);
  dataLayer.mask = dishInteriorMask;
  root.addChild(plateLayer, dishInteriorMask, dataLayer, accentLayer);
  app.stage.addChild(root);

  let snapshot: DishRenderSnapshot | null = null;
  let overlayId = options.overlayId ?? null;
  let motion: RendererMotionMode = options.motion ?? "full";
  let cameraMotion = copyCameraMotionSpec(options.cameraMotion);
  let camera: CameraView = { centerX: 0.5, centerY: 0.5, zoom: 1 };
  let transitionStartCamera = camera;
  let targetCamera = camera;
  let cameraElapsedMs = cameraMotion.durationMs;
  let destroyed = false;
  let gestureState = createPointerGestureState();

  const maxRepresentativeGlyphs = options.maxRepresentativeGlyphs ?? 180;
  const semanticZoomObserver = createSemanticZoomLevelObserver((level) => {
    options.onSemanticZoomLevelChange?.(level);
  });

  const render = () => {
    if (snapshot === null || destroyed) return;
    semanticZoomObserver.update(semanticZoomLevel(camera.zoom));
    drawScene({
      app,
      snapshot,
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
  };

  const applySnapshotOverlayUpdate = (
    nextSnapshot: DishRenderSnapshot,
    requestedOverlayId: string | null,
  ) => {
    const next = resolveSnapshotOverlayUpdate(
      { snapshot, overlayId },
      nextSnapshot,
      requestedOverlayId,
    );
    snapshot = next.snapshot;
    overlayId = next.overlayId;
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
    if (destroyed || motion !== "full") return;
    if (
      cameraTransitionComplete({
        elapsedMs: cameraElapsedMs,
        durationMs: cameraMotion.durationMs,
      })
    ) {
      return;
    }

    cameraElapsedMs += app.ticker.deltaMS;
    camera = interpolateCameraTransition({
      from: transitionStartCamera,
      to: targetCamera,
      elapsedMs: cameraElapsedMs,
      motion: cameraMotion,
    });
    render();
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
    const started = beginPointerGestureInDishAperture(
      gestureState,
      event.pointerId,
      screen,
      viewport,
    );
    gestureState = started.state;
    if (!started.accepted) return;
    writeCameraTransitionState(
      completeCameraTransitionAtRendered(
        readCameraTransitionState(),
        cameraMotion.durationMs,
      ),
    );
    app.canvas.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent) => {
    const moved = movePointerGesture(
      gestureState,
      event.pointerId,
      localPointer(event),
    );
    gestureState = moved.state;
    if (!moved.accepted || moved.intent.kind === "none") return;

    event.preventDefault();
    const viewport = { width: app.screen.width, height: app.screen.height };

    if (moved.intent.kind === "pan") {
      if (camera.zoom <= 1) return;
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

  const finishPointer = (event: PointerEvent) => {
    gestureState = endPointerGesture(gestureState, event.pointerId);
    if (app.canvas.hasPointerCapture(event.pointerId)) {
      app.canvas.releasePointerCapture(event.pointerId);
    }
  };

  const onWheel = (event: WheelEvent) => {
    const screen = localPointer(event);
    const viewport = { width: app.screen.width, height: app.screen.height };
    if (!isScreenPointInsideDishAperture(screen, viewport)) return;

    event.preventDefault();
    const factor = wheelZoomFactor({
      deltaY: event.deltaY,
      deltaMode: event.deltaMode,
      viewportHeight: app.screen.height,
    });
    writeCameraTransitionState(
      retargetWheelZoomFromRendered({
        state: readCameraTransitionState(),
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
  app.canvas.addEventListener("pointerup", finishPointer);
  app.canvas.addEventListener("pointercancel", finishPointer);
  app.canvas.addEventListener("wheel", onWheel, { passive: false });
  app.canvas.addEventListener("dblclick", onDoubleClick);
  host.addEventListener("keydown", onKeyDown);

  return {
    update(nextSnapshot) {
      applySnapshotOverlayUpdate(nextSnapshot, overlayId);
    },

    updatePresentation(nextSnapshot, nextOverlayId) {
      applySnapshotOverlayUpdate(nextSnapshot, nextOverlayId);
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

    setMotionMode(nextMode) {
      motion = nextMode;
      if (motion !== "full") {
        camera = targetCamera;
        transitionStartCamera = targetCamera;
        cameraElapsedMs = cameraMotion.durationMs;
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
      app.canvas.removeEventListener("pointerup", finishPointer);
      app.canvas.removeEventListener("pointercancel", finishPointer);
      app.canvas.removeEventListener("wheel", onWheel);
      app.canvas.removeEventListener("dblclick", onDoubleClick);
      host.removeEventListener("keydown", onKeyDown);
      app.ticker.remove(ticker);
      app.destroy({ removeView: true }, { children: true });
    },
  };
}

function drawScene(args: {
  readonly app: Application;
  readonly snapshot: DishRenderSnapshot;
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
    snapshot,
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
    .fill({ color: 0x0b1f33, alpha: 0.98 })
    .stroke({ color: 0xbcecff, alpha: 0.62, width: Math.max(1.5, dishSize * 0.006) });
  plateLayer
    .circle(centerX - radius * 0.12, centerY - radius * 0.14, radius * 0.91)
    .stroke({ color: 0xffffff, alpha: 0.055, width: Math.max(1, dishSize * 0.012) });
  plateLayer
    .circle(centerX - radius * 0.2, centerY - radius * 0.23, radius * 0.72)
    .stroke({ color: 0xffffff, alpha: 0.035, width: Math.max(1, dishSize * 0.02) });

  const overlay =
    overlayId === null
      ? snapshot.fields.find((field) => field.kind === "antibiotic") ?? null
      : snapshot.fields.find((field) => field.id === overlayId) ?? null;

  if (overlay !== null) {
    drawField(fieldLayer, overlay, snapshot, camera, centerX, centerY, dishSize);
  }

  const lineageDensityMaximum =
    resolveSharedLineageDensityMaximum(snapshot);

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
      level,
      lineageDensityMaximum,
    );
  });

  if (level !== "dish") {
    const glyphs = sampleRepresentativeGlyphs(snapshot, camera, level, {
      maxGlyphs: maxRepresentativeGlyphs,
      minimumDensity: 0.03,
    });
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
      const glyphRadius = Math.max(2.2, 3.2 * Math.min(camera.zoom, 4));
      glyphLayer
        .circle(point.x, point.y, glyphRadius)
        .fill({ color, alpha: 0.88 })
        .stroke({ color: 0x07111f, alpha: 0.75, width: 1.2 });

      drawLineagePatternRings(
        glyphLayer,
        point,
        glyphRadius + 1.8,
        lineage.patternToken,
        0.72,
        1.1,
      );
    }
  }

  const accentAlpha = motion === "off" ? 0.12 : 0.16;
  accentLayer
    .circle(centerX, centerY, radius * 0.985)
    .stroke({ color: 0x8fdcff, alpha: accentAlpha, width: Math.max(1, dishSize * 0.003) });
}

function drawField(
  graphics: Graphics,
  field: RenderField,
  snapshot: DishRenderSnapshot,
  camera: CameraView,
  centerX: number,
  centerY: number,
  dishSize: number,
): void {
  const cellWidth = dishSize * camera.zoom / snapshot.gridWidth;
  const cellHeight = dishSize * camera.zoom / snapshot.gridHeight;
  const presentation = resolveOverlayPresentation(field.kind);

  for (let index = 0; index < field.values.length; index += 1) {
    if (snapshot.dishMask[index] !== 1) continue;
    const value = field.values[index] ?? field.minimum;
    const projected = projectOverlayScalar(
      presentation,
      value,
      field.minimum,
      field.maximum,
    );
    if (!projected.visible) continue;

    const row = Math.floor(index / snapshot.gridWidth);
    const column = index % snapshot.gridWidth;
    const center = gridCellCenter(
      index,
      snapshot.gridWidth,
      snapshot.gridHeight,
    );
    const point = dishToScreen(
      center.x,
      center.y,
      camera,
      centerX,
      centerY,
      dishSize,
    );

    if (!insideViewport(point, centerX, centerY, dishSize)) continue;
    const textureAlpha = overlayPatternMultiplier(
      projected.patternToken,
      row,
      column,
    );
    graphics
      .rect(
        point.x - cellWidth / 2,
        point.y - cellHeight / 2,
        cellWidth + 0.5,
        cellHeight + 0.5,
      )
      .fill({
        color: projected.color,
        alpha: projected.alpha * textureAlpha,
      });
  }
}

function drawLineageDensity(
  graphics: Graphics,
  lineage: RenderLineage,
  snapshot: DishRenderSnapshot,
  camera: CameraView,
  centerX: number,
  centerY: number,
  dishSize: number,
  color: number,
  level: ReturnType<typeof semanticZoomLevel>,
  sharedMaximum: number,
): void {
  if (sharedMaximum <= 0) return;

  const cellWidth = dishSize * camera.zoom / snapshot.gridWidth;
  const cellHeight = dishSize * camera.zoom / snapshot.gridHeight;
  const radius = Math.max(1.1, Math.min(cellWidth, cellHeight) * (level === "dish" ? 0.62 : 0.44));

  for (let index = 0; index < lineage.density.length; index += 1) {
    if (snapshot.dishMask[index] !== 1) continue;
    const weight = lineage.density[index] ?? 0;
    const presentation = projectComparableLineageDensity(
      weight,
      sharedMaximum,
    );
    if (!presentation.visible) continue;
    const center = gridCellCenter(
      index,
      snapshot.gridWidth,
      snapshot.gridHeight,
    );
    const point = dishToScreen(
      center.x,
      center.y,
      camera,
      centerX,
      centerY,
      dishSize,
    );
    if (!insideViewport(point, centerX, centerY, dishSize)) continue;

    const normalized = presentation.normalized;
    // normalized=1 preserves the previous peak radius/alpha exactly. Lower
    // source densities remain visible without being promoted to lineage-local
    // maxima.
    const markRadius = radius * (0.45 + normalized);
    graphics
      .circle(point.x, point.y, markRadius)
      .fill({ color, alpha: 0.02 + normalized * 0.56 });

    drawLineagePatternRings(
      graphics,
      point,
      markRadius,
      lineage.patternToken,
      0.04 + normalized * 0.32,
      Math.max(0.65, Math.min(1.15, markRadius * 0.14)),
    );
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

function insideViewport(
  point: ScreenPoint,
  centerX: number,
  centerY: number,
  dishSize: number,
): boolean {
  const dx = point.x - centerX;
  const dy = point.y - centerY;
  const radius = dishSize * 0.5;
  return dx * dx + dy * dy <= radius * radius;
}
