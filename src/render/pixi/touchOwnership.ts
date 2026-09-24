import type { CameraView } from "../model";
import { clampCamera, DEFAULT_CAMERA_LIMITS } from "./camera";
import type { PointerGestureIntent } from "./pointerGesture";

export type RendererTouchAction = "pan-x pan-y" | "none";

/**
 * Whether a newly-starting one-pointer gesture has meaningful camera pan work.
 *
 * This decision is presentation-only and must be latched at gesture start:
 * touch-action ownership cannot be transferred retroactively mid-gesture.
 */
export function onePointerPanOwnedAtGestureStart(
  camera: CameraView,
): boolean {
  if (!Number.isFinite(camera.zoom) || camera.zoom <= 0) {
    throw new RangeError("camera zoom must be finite and > 0");
  }

  return (
    clampCamera(camera).zoom >
    DEFAULT_CAMERA_LIMITS.minimumZoom
  );
}

/**
 * Touch-action for the next gesture. At overview Petra permits browser page
 * panning while withholding browser pinch zoom; when zoomed Petra owns pan +
 * its custom pinch gesture.
 */
export function rendererTouchActionForNextGesture(
  camera: CameraView,
): RendererTouchAction {
  return onePointerPanOwnedAtGestureStart(camera)
    ? "none"
    : "pan-x pan-y";
}

export function rendererOwnsGestureIntent(
  kind: PointerGestureIntent["kind"],
  panOwnedAtGestureStart: boolean,
): boolean {
  if (kind === "pinch") return true;
  if (kind === "pan") return panOwnedAtGestureStart;
  return false;
}
