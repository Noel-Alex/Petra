import { Application, Container, Graphics } from "pixi.js";
import { sampleRepresentativeGlyphs } from "../lod";
import {
  semanticZoomLevel,
  validateRenderSnapshot,
  type CameraView,
  type DishRenderSnapshot,
  type RenderField,
  type RenderLineage,
} from "../model";
import {
  clampCamera,
  panCamera,
  screenToDish,
  zoomAroundDishPoint,
  type ScreenPoint,
} from "./camera";
import { applyKeyboardCameraKey } from "./keyboardCamera";
import { createResizeRedrawScheduler } from "./resizeScheduler";
import {
  applyPinchCamera,
  pinchFrame,
  removeGesturePointer,
  upsertGesturePointer,
  type GesturePointer,
} from "./touchGesture";
import {
  cameraTransitionComplete,
  interpolateCameraTransition,
  type CameraMotionSpec,
} from "./cameraMotion";

export type RendererMotionMode = "full" | "reduced" | "off";

export interface PixiDishOptions {
  readonly motion?: RendererMotionMode;
  readonly cameraMotion: CameraMotionSpec;
  readonly overlayId?: string | null;
  readonly maxRepresentativeGlyphs?: number;
}

export interface PixiDishRenderer {
  update(snapshot: DishRenderSnapshot): void;
  setOverlay(overlayId: string | null): void;
  setMotionMode(mode: RendererMotionMode): void;
  setCamera(camera: CameraView): void;
  focusDishPoint(point: ScreenPoint, zoom?: number): void;
  resetCamera(): void;
  destroy(): void;
}

const LINEAGE_COLORS = [0x55d7ef, 0xf079b7, 0xf2ca68, 0x75e3ae, 0xb39af5] as const;

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
    resolution: Math.min(globalThis.devicePixelRatio ?? 1, 2),
  });

  app.canvas.className = "petra-pixi-canvas";
  app.canvas.setAttribute("aria-hidden", "true");
  // Gesture suppression is scoped to the interactive dish surface only.
  // The rest of the page retains normal browser pan/zoom behavior.
  app.canvas.style.touchAction = "none";
  app.canvas.style.userSelect = "none";
  host.appendChild(app.canvas);

  const root = new Container();
  const plateLayer = new Graphics();
  const fieldLayer = new Graphics();
  const densityLayer = new Graphics();
  const glyphLayer = new Graphics();
  const accentLayer = new Graphics();
  root.addChild(plateLayer, fieldLayer, densityLayer, glyphLayer, accentLayer);
  app.stage.addChild(root);

  let snapshot: DishRenderSnapshot | null = null;
  let overlayId = options.overlayId ?? null;
  let motion: RendererMotionMode = options.motion ?? "full";
  let camera: CameraView = { centerX: 0.5, centerY: 0.5, zoom: 1 };
  let transitionStartCamera = camera;
  let targetCamera = camera;
  let cameraElapsedMs = options.cameraMotion.durationMs;
  let destroyed = false;
  let activePointers: readonly GesturePointer[] = [];

  const maxRepresentativeGlyphs = options.maxRepresentativeGlyphs ?? 180;

  const render = () => {
    if (snapshot === null || destroyed) return;
    drawScene({
      app,
      snapshot,
      camera,
      overlayId,
      motion,
      maxRepresentativeGlyphs,
      plateLayer,
      fieldLayer,
      densityLayer,
      glyphLayer,
      accentLayer,
    });
  };

  const resizeScheduler = createResizeRedrawScheduler(
    () => app.resize(),
    render,
  );
  const resizeObserver = new ResizeObserver(() => {
    resizeScheduler.schedule();
  });
  resizeObserver.observe(host);

  const beginCameraTransition = (nextTarget: CameraView) => {
    targetCamera = clampCamera(nextTarget);
    if (motion !== "full" || options.cameraMotion.durationMs === 0) {
      camera = targetCamera;
      transitionStartCamera = targetCamera;
      cameraElapsedMs = options.cameraMotion.durationMs;
      return;
    }

    transitionStartCamera = camera;
    cameraElapsedMs = 0;
  };

  const ticker = () => {
    if (destroyed || motion !== "full") return;
    if (
      cameraTransitionComplete({
        elapsedMs: cameraElapsedMs,
        durationMs: options.cameraMotion.durationMs,
      })
    ) {
      return;
    }

    cameraElapsedMs += app.ticker.deltaMS;
    camera = interpolateCameraTransition({
      from: transitionStartCamera,
      to: targetCamera,
      elapsedMs: cameraElapsedMs,
      motion: options.cameraMotion,
    });
    render();
  };
  app.ticker.add(ticker);

  const localPointer = (event: PointerEvent | WheelEvent): ScreenPoint => {
    const rect = app.canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / Math.max(rect.width, 1)) * app.screen.width,
      y: ((event.clientY - rect.top) / Math.max(rect.height, 1)) * app.screen.height,
    };
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    activePointers = upsertGesturePointer(activePointers, {
      pointerId: event.pointerId,
      pointerType: event.pointerType || "mouse",
      point: localPointer(event),
    });
    app.canvas.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent) => {
    const previousPointer = activePointers.find(
      (pointer) => pointer.pointerId === event.pointerId,
    );
    if (previousPointer === undefined) return;

    const previousPinch = pinchFrame(activePointers);
    const nextPoint = localPointer(event);
    activePointers = upsertGesturePointer(activePointers, {
      pointerId: event.pointerId,
      pointerType: event.pointerType || previousPointer.pointerType,
      point: nextPoint,
    });
    const nextPinch = pinchFrame(activePointers);
    const viewport = { width: app.screen.width, height: app.screen.height };

    if (previousPinch !== null && nextPinch !== null) {
      beginCameraTransition(
        applyPinchCamera(targetCamera, previousPinch, nextPinch, viewport),
      );
      render();
      return;
    }

    if (activePointers.length !== 1 || targetCamera.zoom <= 1) return;
    beginCameraTransition(
      panCamera(
        targetCamera,
        {
          x: nextPoint.x - previousPointer.point.x,
          y: nextPoint.y - previousPointer.point.y,
        },
        viewport,
      ),
    );
    render();
  };

  const finishPointer = (event: PointerEvent) => {
    activePointers = removeGesturePointer(activePointers, event.pointerId);
    if (app.canvas.hasPointerCapture(event.pointerId)) {
      app.canvas.releasePointerCapture(event.pointerId);
    }
  };

  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    const screen = localPointer(event);
    const anchor = screenToDish(
      screen,
      { width: app.screen.width, height: app.screen.height },
      targetCamera,
    );
    const factor = Math.exp(-event.deltaY * 0.0015);
    beginCameraTransition(zoomAroundDishPoint(targetCamera, anchor, factor));
    render();
  };

  const onDoubleClick = (event: MouseEvent) => {
    const screen = localPointer(event);
    const anchor = screenToDish(
      screen,
      { width: app.screen.width, height: app.screen.height },
      targetCamera,
    );
    beginCameraTransition({ centerX: anchor.x, centerY: anchor.y, zoom: 3.2 });
    render();
  };

  const onKeyDown = (event: KeyboardEvent) => {
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
      validateRenderSnapshot(nextSnapshot);
      snapshot = nextSnapshot;
      if (
        overlayId !== null &&
        !nextSnapshot.fields.some((field) => field.id === overlayId)
      ) {
        overlayId = null;
      }
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

    setMotionMode(nextMode) {
      motion = nextMode;
      if (motion !== "full") {
        camera = targetCamera;
        transitionStartCamera = targetCamera;
        cameraElapsedMs = options.cameraMotion.durationMs;
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
    fieldLayer,
    densityLayer,
    glyphLayer,
    accentLayer,
  } = args;

  const viewportWidth = app.screen.width;
  const viewportHeight = app.screen.height;
  const dishSize = Math.max(1, Math.min(viewportWidth, viewportHeight) * 0.93);
  const centerX = viewportWidth / 2;
  const centerY = viewportHeight / 2;
  const radius = dishSize / 2;
  const level = semanticZoomLevel(camera.zoom);

  for (const layer of [plateLayer, fieldLayer, densityLayer, glyphLayer, accentLayer]) {
    layer.clear();
  }

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

  snapshot.lineages.forEach((lineage, index) => {
    drawLineageDensity(
      densityLayer,
      lineage,
      snapshot,
      camera,
      centerX,
      centerY,
      dishSize,
      LINEAGE_COLORS[index % LINEAGE_COLORS.length] ?? LINEAGE_COLORS[0],
      level,
    );
  });

  if (level !== "dish") {
    const glyphs = sampleRepresentativeGlyphs(snapshot, camera, level, {
      maxGlyphs: maxRepresentativeGlyphs,
      minimumDensity: 0.03,
    });
    for (const glyph of glyphs) {
      const lineageIndex = snapshot.lineages.findIndex(
        (lineage) => lineage.id === glyph.lineageId,
      );
      const lineage = snapshot.lineages[lineageIndex];
      if (lineage === undefined) continue;
      const color = LINEAGE_COLORS[lineageIndex % LINEAGE_COLORS.length] ?? LINEAGE_COLORS[0];
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

      if (lineage.patternToken.includes("double")) {
        glyphLayer
          .circle(point.x, point.y, glyphRadius + 2.6)
          .stroke({ color, alpha: 0.72, width: 1.1 });
      }
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
  const range = Math.max(1e-9, field.maximum - field.minimum);
  const color = field.kind === "nutrient" ? 0xf0bd4e : 0x8b6cf6;

  for (let index = 0; index < field.values.length; index += 1) {
    if (snapshot.dishMask[index] !== 1) continue;
    const value = field.values[index] ?? field.minimum;
    const normalized = Math.max(0, Math.min(1, (value - field.minimum) / range));
    if (normalized < 0.025) continue;

    const column = index % snapshot.gridWidth;
    const row = Math.floor(index / snapshot.gridWidth);
    const point = dishToScreen(
      (column + 0.5) / snapshot.gridWidth,
      (row + 0.5) / snapshot.gridHeight,
      camera,
      centerX,
      centerY,
      dishSize,
    );

    if (!insideViewport(point, centerX, centerY, dishSize)) continue;
    graphics
      .rect(
        point.x - cellWidth / 2,
        point.y - cellHeight / 2,
        cellWidth + 0.5,
        cellHeight + 0.5,
      )
      .fill({ color, alpha: normalized * 0.18 });
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
): void {
  let maximum = 0;
  for (const value of lineage.density) maximum = Math.max(maximum, value);
  if (maximum <= 0) return;

  const cellWidth = dishSize * camera.zoom / snapshot.gridWidth;
  const cellHeight = dishSize * camera.zoom / snapshot.gridHeight;
  const radius = Math.max(1.1, Math.min(cellWidth, cellHeight) * (level === "dish" ? 0.62 : 0.44));

  for (let index = 0; index < lineage.density.length; index += 1) {
    if (snapshot.dishMask[index] !== 1) continue;
    const weight = lineage.density[index] ?? 0;
    if (weight <= maximum * 0.025) continue;
    const column = index % snapshot.gridWidth;
    const row = Math.floor(index / snapshot.gridWidth);
    const point = dishToScreen(
      (column + 0.5) / snapshot.gridWidth,
      (row + 0.5) / snapshot.gridHeight,
      camera,
      centerX,
      centerY,
      dishSize,
    );
    if (!insideViewport(point, centerX, centerY, dishSize)) continue;

    const normalized = Math.sqrt(weight / maximum);
    graphics
      .circle(point.x, point.y, radius * (0.65 + normalized * 0.8))
      .fill({ color, alpha: 0.08 + normalized * 0.5 });
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
