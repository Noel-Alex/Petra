import { Application, Container, Graphics } from "pixi.js";
import {
  panCamera,
  zoomCameraAroundPoint,
  type ViewportPoint,
} from "./camera";
import { sampleRepresentativeGlyphs } from "./lod";
import {
  semanticZoomLevel,
  validateRenderSnapshot,
  type CameraView,
  type DishRenderSnapshot,
  type RenderField,
  type RenderLineage,
  type SemanticZoomLevel,
} from "./model";

const WORLD_SIZE = 1000;
const DISH_INSET = 52;
const DISH_RADIUS = WORLD_SIZE / 2 - DISH_INSET;

export type RendererMotionMode = "full" | "reduced" | "off";

export interface PixiDishSceneOptions {
  readonly host: HTMLElement;
  readonly snapshot: DishRenderSnapshot;
  readonly motionMode: RendererMotionMode;
  readonly onSemanticZoomChange?: (level: SemanticZoomLevel) => void;
}

export interface PixiDishSceneController {
  readonly canvas: HTMLCanvasElement;
  setSnapshot(snapshot: DishRenderSnapshot): void;
  setMotionMode(mode: RendererMotionMode): void;
  resetCamera(): void;
  destroy(): void;
}

export async function mountPixiDishScene(
  options: PixiDishSceneOptions,
): Promise<PixiDishSceneController> {
  validateRenderSnapshot(options.snapshot);

  const app = new Application();
  await app.init({
    antialias: true,
    autoDensity: true,
    backgroundAlpha: 0,
    preference: "webgl",
    resolution: Math.min(globalThis.devicePixelRatio ?? 1, 2),
    resizeTo: options.host,
  });

  options.host.replaceChildren(app.canvas);
  app.canvas.className = "pixi-dish-canvas";

  const world = new Container();
  const glass = new Graphics();
  const dishContent = new Container();
  const fieldLayer = new Graphics();
  const biomassLayer = new Graphics();
  const lineageLayer = new Graphics();
  const glassHighlight = new Graphics();

  const mask = new Graphics()
    .circle(WORLD_SIZE / 2, WORLD_SIZE / 2, DISH_RADIUS)
    .fill(0xffffff);

  dishContent.mask = mask;
  dishContent.addChild(fieldLayer, biomassLayer, lineageLayer, mask);
  world.addChild(glass, dishContent, glassHighlight);
  app.stage.addChild(world);

  let snapshot = options.snapshot;
  let motionMode = options.motionMode;
  let camera: CameraView = { centerX: 0.5, centerY: 0.5, zoom: 1 };
  let semanticLevel = semanticZoomLevel(camera.zoom);
  let dragOrigin: ViewportPoint | null = null;
  let phase = 0;

  drawGlass(glass, glassHighlight);
  redrawSnapshot();
  applyCamera();

  const reportLevel = () => {
    const nextLevel = semanticZoomLevel(camera.zoom);
    if (nextLevel !== semanticLevel) {
      semanticLevel = nextLevel;
      options.onSemanticZoomChange?.(semanticLevel);
      redrawSnapshot();
    }
  };

  const pointerPosition = (event: PointerEvent): ViewportPoint => {
    const bounds = app.canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * app.screen.width,
      y: ((event.clientY - bounds.top) / bounds.height) * app.screen.height,
    };
  };

  const onPointerDown = (event: PointerEvent) => {
    dragOrigin = pointerPosition(event);
    app.canvas.setPointerCapture(event.pointerId);
    app.canvas.classList.add("is-dragging");
  };

  const onPointerMove = (event: PointerEvent) => {
    if (dragOrigin === null || camera.zoom <= 1) return;
    const next = pointerPosition(event);
    camera = panCamera(
      camera,
      { x: next.x - dragOrigin.x, y: next.y - dragOrigin.y },
      Math.min(app.screen.width, app.screen.height),
    );
    dragOrigin = next;
    applyCamera();
  };

  const stopDragging = (event: PointerEvent) => {
    dragOrigin = null;
    app.canvas.classList.remove("is-dragging");
    if (app.canvas.hasPointerCapture(event.pointerId)) {
      app.canvas.releasePointerCapture(event.pointerId);
    }
  };

  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    const bounds = app.canvas.getBoundingClientRect();
    const pointer = {
      x: ((event.clientX - bounds.left) / bounds.width) * app.screen.width,
      y: ((event.clientY - bounds.top) / bounds.height) * app.screen.height,
    };
    camera = zoomCameraAroundPoint(
      camera,
      pointer,
      { x: app.screen.width, y: app.screen.height },
      Math.exp(-event.deltaY * 0.0012),
    );
    applyCamera();
    reportLevel();
  };

  app.canvas.addEventListener("pointerdown", onPointerDown);
  app.canvas.addEventListener("pointermove", onPointerMove);
  app.canvas.addEventListener("pointerup", stopDragging);
  app.canvas.addEventListener("pointercancel", stopDragging);
  app.canvas.addEventListener("wheel", onWheel, { passive: false });

  const tick = (ticker: { deltaMS: number }) => {
    if (motionMode !== "full") {
      glassHighlight.alpha = motionMode === "off" ? 0.42 : 0.52;
      return;
    }

    phase += ticker.deltaMS * 0.001;
    glassHighlight.alpha = 0.54 + Math.sin(phase * 0.8) * 0.07;
  };

  app.ticker.add(tick);

  function applyCamera(): void {
    const size = Math.min(app.screen.width, app.screen.height);
    const scale = (size / WORLD_SIZE) * camera.zoom;
    world.scale.set(scale);
    world.position.set(
      app.screen.width / 2 - camera.centerX * WORLD_SIZE * scale,
      app.screen.height / 2 - camera.centerY * WORLD_SIZE * scale,
    );
  }

  function redrawSnapshot(): void {
    validateRenderSnapshot(snapshot);
    fieldLayer.clear();
    biomassLayer.clear();
    lineageLayer.clear();

    const overlay =
      snapshot.fields.find((field) => field.kind === "antibiotic") ??
      snapshot.fields[0];

    if (overlay !== undefined) drawField(fieldLayer, overlay, snapshot);
    drawBiomass(biomassLayer, snapshot);

    if (semanticLevel !== "dish") {
      const glyphs = sampleRepresentativeGlyphs(
        snapshot,
        camera,
        semanticLevel,
        {
          maxGlyphs: semanticLevel === "representative-cell" ? 260 : 130,
          minimumDensity: 0.04,
        },
      );
      drawLineageGlyphs(lineageLayer, snapshot.lineages, glyphs);
    }
  }

  return {
    canvas: app.canvas,
    setSnapshot(nextSnapshot) {
      validateRenderSnapshot(nextSnapshot);
      snapshot = nextSnapshot;
      redrawSnapshot();
    },
    setMotionMode(nextMode) {
      motionMode = nextMode;
      if (motionMode !== "full") {
        glassHighlight.alpha = motionMode === "off" ? 0.42 : 0.52;
      }
    },
    resetCamera() {
      camera = { centerX: 0.5, centerY: 0.5, zoom: 1 };
      applyCamera();
      reportLevel();
    },
    destroy() {
      app.canvas.removeEventListener("pointerdown", onPointerDown);
      app.canvas.removeEventListener("pointermove", onPointerMove);
      app.canvas.removeEventListener("pointerup", stopDragging);
      app.canvas.removeEventListener("pointercancel", stopDragging);
      app.canvas.removeEventListener("wheel", onWheel);
      app.ticker.remove(tick);
      app.destroy(
        { removeView: true },
        { children: true, texture: true, textureSource: true },
      );
    },
  };

  function drawGlass(
    rim: Graphics,
    highlight: Graphics,
  ): void {
    rim
      .circle(WORLD_SIZE / 2, WORLD_SIZE / 2, DISH_RADIUS + 17)
      .fill({ color: 0x0b1a2d, alpha: 0.82 })
      .stroke({ color: 0xb9e8ff, width: 7, alpha: 0.5 })
      .circle(WORLD_SIZE / 2, WORLD_SIZE / 2, DISH_RADIUS)
      .fill({ color: 0x102d42, alpha: 0.74 })
      .stroke({ color: 0x7bcbea, width: 3, alpha: 0.24 });

    highlight
      .ellipse(390, 286, 150, 58)
      .stroke({ color: 0xffffff, width: 15, alpha: 0.16 });
  }
}

function drawField(
  graphics: Graphics,
  field: RenderField,
  snapshot: DishRenderSnapshot,
): void {
  const cellWidth = (DISH_RADIUS * 2) / snapshot.gridWidth;
  const cellHeight = (DISH_RADIUS * 2) / snapshot.gridHeight;
  const range = Math.max(1e-9, field.maximum - field.minimum);
  const color = field.kind === "antibiotic" ? 0x8e72ff : 0xf2c85c;

  for (let index = 0; index < field.values.length; index += 1) {
    if (snapshot.dishMask[index] !== 1) continue;
    const value = field.values[index] ?? field.minimum;
    const normalized = Math.max(
      0,
      Math.min(1, (value - field.minimum) / range),
    );
    if (normalized <= 0.025) continue;

    const column = index % snapshot.gridWidth;
    const row = Math.floor(index / snapshot.gridWidth);
    graphics
      .rect(
        DISH_INSET + column * cellWidth,
        DISH_INSET + row * cellHeight,
        cellWidth + 0.5,
        cellHeight + 0.5,
      )
      .fill({ color, alpha: normalized * 0.26 });
  }
}

function drawBiomass(
  graphics: Graphics,
  snapshot: DishRenderSnapshot,
): void {
  const cellWidth = (DISH_RADIUS * 2) / snapshot.gridWidth;
  const cellHeight = (DISH_RADIUS * 2) / snapshot.gridHeight;
  const maxBiomass = Math.max(0.0001, ...snapshot.biomass);

  for (let index = 0; index < snapshot.biomass.length; index += 1) {
    if (snapshot.dishMask[index] !== 1) continue;
    const value = snapshot.biomass[index] ?? 0;
    if (value <= maxBiomass * 0.035) continue;

    const column = index % snapshot.gridWidth;
    const row = Math.floor(index / snapshot.gridWidth);
    const normalized = Math.sqrt(value / maxBiomass);
    const radius =
      Math.min(cellWidth, cellHeight) * (0.24 + normalized * 0.42);

    graphics
      .circle(
        DISH_INSET + (column + 0.5) * cellWidth,
        DISH_INSET + (row + 0.5) * cellHeight,
        radius,
      )
      .fill({ color: 0x51d6e8, alpha: 0.08 + normalized * 0.28 });
  }
}

function drawLineageGlyphs(
  graphics: Graphics,
  lineages: readonly RenderLineage[],
  glyphs: readonly {
    lineageId: string;
    x: number;
    y: number;
    weight: number;
  }[],
): void {
  const byId = new Map(lineages.map((lineage) => [lineage.id, lineage]));

  for (const glyph of glyphs) {
    const lineage = byId.get(glyph.lineageId);
    if (lineage === undefined) continue;

    const x = DISH_INSET + glyph.x * DISH_RADIUS * 2;
    const y = DISH_INSET + glyph.y * DISH_RADIUS * 2;
    const size = 5 + Math.min(9, Math.log1p(glyph.weight) * 6);
    const color = appearanceColor(lineage.appearanceToken);

    if (lineage.patternToken.includes("bar")) {
      graphics
        .roundRect(x - size * 0.75, y - size * 0.34, size * 1.5, size * 0.68, size * 0.3)
        .fill({ color, alpha: 0.9 })
        .stroke({ color: 0xf7fbff, alpha: 0.26, width: 1.2 });
    } else {
      graphics
        .circle(x, y, size * 0.55)
        .fill({ color, alpha: 0.9 })
        .stroke({ color: 0xf7fbff, alpha: 0.26, width: 1.2 });
    }
  }
}

function appearanceColor(token: string): number {
  const known: Record<string, number> = {
    cyan: 0x57d7ef,
    coral: 0xf27ba8,
    gold: 0xf2c85c,
    teal: 0x6fe0c0,
  };
  const direct = known[token];
  if (direct !== undefined) return direct;

  let hash = 2166136261;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return 0x5588aa + ((hash >>> 0) % 0x335544);
}
