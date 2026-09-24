import type { CameraView } from "../model";
import {
  isScreenPointInsideDishAperture,
  screenToDish,
  type ScreenPoint,
  type ViewportSize,
} from "./camera";

export const DISH_ACTIVATION_MAX_TRAVEL_PX = 6;

export interface DishActivationInput {
  readonly start: ScreenPoint;
  readonly end: ScreenPoint;
  readonly viewport: ViewportSize;
  readonly camera: CameraView;
  readonly maximumTravelPx?: number;
}

/**
 * Converts one tap/click gesture into normalized dish coordinates using the
 * exact renderer camera/aperture geometry. This is presentation/input geometry
 * only; the returned point has no biological meaning until an authority-layer
 * query consumes it.
 */
export function resolveDishActivationPoint(
  input: DishActivationInput,
): ScreenPoint | null {
  const maximumTravelPx =
    input.maximumTravelPx ?? DISH_ACTIVATION_MAX_TRAVEL_PX;
  if (!Number.isFinite(maximumTravelPx) || maximumTravelPx < 0) {
    throw new RangeError("dish activation maximumTravelPx must be finite and non-negative");
  }

  if (
    !isScreenPointInsideDishAperture(input.start, input.viewport) ||
    !isScreenPointInsideDishAperture(input.end, input.viewport)
  ) {
    return null;
  }

  if (
    Math.hypot(
      input.end.x - input.start.x,
      input.end.y - input.start.y,
    ) > maximumTravelPx
  ) {
    return null;
  }

  const point = screenToDish(input.end, input.viewport, input.camera);
  if (point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) {
    return null;
  }
  return point;
}
