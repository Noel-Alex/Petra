import type { CameraView } from "./model";

export interface ViewportPoint {
  readonly x: number;
  readonly y: number;
}

export const MIN_CAMERA_ZOOM = 1;
export const MAX_CAMERA_ZOOM = 8;

export function clampCamera(camera: CameraView): CameraView {
  return {
    centerX: clamp(camera.centerX, 0, 1),
    centerY: clamp(camera.centerY, 0, 1),
    zoom: clamp(camera.zoom, MIN_CAMERA_ZOOM, MAX_CAMERA_ZOOM),
  };
}

export function panCamera(
  camera: CameraView,
  deltaPixels: ViewportPoint,
  viewportSize: number,
): CameraView {
  assertViewport(viewportSize);
  return clampCamera({
    centerX: camera.centerX - deltaPixels.x / (viewportSize * camera.zoom),
    centerY: camera.centerY - deltaPixels.y / (viewportSize * camera.zoom),
    zoom: camera.zoom,
  });
}

export function zoomCameraAroundPoint(
  camera: CameraView,
  pointer: ViewportPoint,
  viewport: ViewportPoint,
  zoomFactor: number,
): CameraView {
  assertViewport(viewport.x);
  assertViewport(viewport.y);
  if (!Number.isFinite(zoomFactor) || zoomFactor <= 0) {
    throw new RangeError("zoomFactor must be finite and > 0");
  }

  const nextZoom = clamp(
    camera.zoom * zoomFactor,
    MIN_CAMERA_ZOOM,
    MAX_CAMERA_ZOOM,
  );

  const beforeX =
    camera.centerX + (pointer.x - viewport.x / 2) / (viewport.x * camera.zoom);
  const beforeY =
    camera.centerY + (pointer.y - viewport.y / 2) / (viewport.y * camera.zoom);

  return clampCamera({
    centerX:
      beforeX - (pointer.x - viewport.x / 2) / (viewport.x * nextZoom),
    centerY:
      beforeY - (pointer.y - viewport.y / 2) / (viewport.y * nextZoom),
    zoom: nextZoom,
  });
}

function assertViewport(value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError("viewport dimensions must be finite and > 0");
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
