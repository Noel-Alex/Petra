import type { CameraView } from "../model";

export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

export interface CameraLimits {
  readonly minimumZoom: number;
  readonly maximumZoom: number;
}

export const DEFAULT_CAMERA_LIMITS: CameraLimits = Object.freeze({
  minimumZoom: 1,
  maximumZoom: 9,
});

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
  assertViewport(viewport);
  const safeCamera = clampCamera(camera);
  const size = Math.min(viewport.width, viewport.height);
  const originX = (viewport.width - size) / 2;
  const originY = (viewport.height - size) / 2;
  const normalizedX = (point.x - originX) / size;
  const normalizedY = (point.y - originY) / size;

  return {
    x: safeCamera.centerX + (normalizedX - 0.5) / safeCamera.zoom,
    y: safeCamera.centerY + (normalizedY - 0.5) / safeCamera.zoom,
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

  const nextZoom = clamp(camera.zoom * factor, limits.minimumZoom, limits.maximumZoom);
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
  assertViewport(viewport);
  const size = Math.min(viewport.width, viewport.height);
  const scale = 1 / (size * camera.zoom);

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
