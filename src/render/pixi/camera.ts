import type { CameraView } from "../model";

export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

export interface DishViewportGeometry {
  readonly centerX: number;
  readonly centerY: number;
  readonly diameter: number;
  readonly radius: number;
}

export interface CameraLimits {
  readonly minimumZoom: number;
  readonly maximumZoom: number;
}

/**
 * Presentation aperture used by both Pixi drawing and pointer/camera transforms.
 * Changing this value must move every consumer together.
 */
export const DISH_VIEWPORT_DIAMETER_FRACTION = 0.93;

export const DEFAULT_CAMERA_LIMITS: CameraLimits = Object.freeze({
  minimumZoom: 1,
  maximumZoom: 9,
});

export function resolveDishViewportGeometry(
  viewport: ViewportSize,
): DishViewportGeometry {
  assertViewport(viewport);
  const diameter = Math.max(
    1,
    Math.min(viewport.width, viewport.height) *
      DISH_VIEWPORT_DIAMETER_FRACTION,
  );

  return {
    centerX: viewport.width / 2,
    centerY: viewport.height / 2,
    diameter,
    radius: diameter / 2,
  };
}

export function clampCamera(
  camera: CameraView,
  limits: CameraLimits = DEFAULT_CAMERA_LIMITS,
): CameraView {
  assertLimits(limits);
  const zoom = clamp(camera.zoom, limits.minimumZoom, limits.maximumZoom);
  const halfSpan = 0.5 / zoom;

  return {
    centerX: clamp(camera.centerX, halfSpan, 1 - halfSpan),
    centerY: clamp(camera.centerY, halfSpan, 1 - halfSpan),
    zoom,
  };
}

export function screenToDish(
  point: ScreenPoint,
  viewport: ViewportSize,
  camera: CameraView,
): ScreenPoint {
  const geometry = resolveDishViewportGeometry(viewport);
  const safeCamera = clampCamera(camera);

  return {
    x:
      safeCamera.centerX +
      (point.x - geometry.centerX) / (geometry.diameter * safeCamera.zoom),
    y:
      safeCamera.centerY +
      (point.y - geometry.centerY) / (geometry.diameter * safeCamera.zoom),
  };
}

export function dishToScreen(
  point: ScreenPoint,
  camera: CameraView,
  geometry: DishViewportGeometry,
): ScreenPoint {
  return {
    x:
      geometry.centerX +
      (point.x - camera.centerX) * geometry.diameter * camera.zoom,
    y:
      geometry.centerY +
      (point.y - camera.centerY) * geometry.diameter * camera.zoom,
  };
}

export function zoomAroundDishPoint(
  camera: CameraView,
  anchor: ScreenPoint,
  factor: number,
  limits: CameraLimits = DEFAULT_CAMERA_LIMITS,
): CameraView {
  if (!Number.isFinite(factor) || factor <= 0) {
    throw new RangeError("zoom factor must be finite and > 0");
  }

  const nextZoom = clamp(
    camera.zoom * factor,
    limits.minimumZoom,
    limits.maximumZoom,
  );
  const ratio = camera.zoom / nextZoom;

  return clampCamera(
    {
      zoom: nextZoom,
      centerX: anchor.x - (anchor.x - camera.centerX) * ratio,
      centerY: anchor.y - (anchor.y - camera.centerY) * ratio,
    },
    limits,
  );
}

export function panCamera(
  camera: CameraView,
  deltaScreen: ScreenPoint,
  viewport: ViewportSize,
  limits: CameraLimits = DEFAULT_CAMERA_LIMITS,
): CameraView {
  const geometry = resolveDishViewportGeometry(viewport);
  const scale = 1 / (geometry.diameter * camera.zoom);

  return clampCamera(
    {
      ...camera,
      centerX: camera.centerX - deltaScreen.x * scale,
      centerY: camera.centerY - deltaScreen.y * scale,
    },
    limits,
  );
}

function assertViewport(viewport: ViewportSize): void {
  if (
    !Number.isFinite(viewport.width) ||
    !Number.isFinite(viewport.height) ||
    viewport.width <= 0 ||
    viewport.height <= 0
  ) {
    throw new RangeError("viewport dimensions must be finite and > 0");
  }
}

function assertLimits(limits: CameraLimits): void {
  if (
    !Number.isFinite(limits.minimumZoom) ||
    !Number.isFinite(limits.maximumZoom) ||
    limits.minimumZoom <= 0 ||
    limits.maximumZoom < limits.minimumZoom
  ) {
    throw new RangeError("camera zoom limits are invalid");
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
