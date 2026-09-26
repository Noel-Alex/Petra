import type { CameraView } from "../model";
import {
  clampCamera,
  dishToScreen,
  resolveDishViewportGeometry,
  type ScreenPoint,
  type ViewportSize,
} from "./camera";

export interface PreparedCameraLayerTransform {
  readonly scale: number;
  readonly x: number;
  readonly y: number;
}

/**
 * Affine transform that maps screen-space geometry baked for one camera into
 * the exact screen-space coordinates of another camera under Petra's shared
 * dish aperture.
 *
 * Prepared Pixi field/density/contour geometry is already expressed in stage
 * screen coordinates. Applying this uniform scale + translation to its parent
 * container therefore avoids replaying every prepared vector segment while
 * the camera moves.
 */
export function resolvePreparedCameraLayerTransform(
  bakedCamera: CameraView,
  currentCamera: CameraView,
  viewport: ViewportSize,
): PreparedCameraLayerTransform {
  const baked = clampCamera(bakedCamera);
  const current = clampCamera(currentCamera);
  const geometry = resolveDishViewportGeometry(viewport);
  const scale = current.zoom / baked.zoom;

  return Object.freeze({
    scale,
    x:
      geometry.centerX * (1 - scale) +
      (baked.centerX - current.centerX) *
        geometry.diameter *
        current.zoom,
    y:
      geometry.centerY * (1 - scale) +
      (baked.centerY - current.centerY) *
        geometry.diameter *
        current.zoom,
  });
}

export function transformPreparedScreenPoint(
  point: ScreenPoint,
  transform: PreparedCameraLayerTransform,
): ScreenPoint {
  return {
    x: point.x * transform.scale + transform.x,
    y: point.y * transform.scale + transform.y,
  };
}

/**
 * Regression helper: applying the prepared-layer transform must be equivalent
 * to mapping the normalized dish point directly through the current camera.
 */
export function preparedCameraTransformMatchesDishPoint(args: {
  readonly point: ScreenPoint;
  readonly bakedCamera: CameraView;
  readonly currentCamera: CameraView;
  readonly viewport: ViewportSize;
  readonly tolerance?: number;
}): boolean {
  const geometry = resolveDishViewportGeometry(args.viewport);
  const bakedPoint = dishToScreen(
    args.point,
    clampCamera(args.bakedCamera),
    geometry,
  );
  const expected = dishToScreen(
    args.point,
    clampCamera(args.currentCamera),
    geometry,
  );
  const actual = transformPreparedScreenPoint(
    bakedPoint,
    resolvePreparedCameraLayerTransform(
      args.bakedCamera,
      args.currentCamera,
      args.viewport,
    ),
  );
  const tolerance = args.tolerance ?? 1e-9;
  return (
    Math.abs(actual.x - expected.x) <= tolerance &&
    Math.abs(actual.y - expected.y) <= tolerance
  );
}
