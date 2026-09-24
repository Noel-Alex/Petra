import type { CameraView } from "../model";
import {
  clampCamera,
  DEFAULT_CAMERA_LIMITS,
} from "./camera";
import type { PointerGestureIntent } from "./pointerGesture";

export type RendererTouchAction = "pan-x pan-y" | "none";

/**
 * Decide one-pointer pan ownership once, when a new gesture begins.
 *
 * Pointer Events chooses browser touch ownership from the touch-action policy
 * active at gesture start. Petra therefore latches this decision instead of
 * recomputing it from a camera that may animate while the pointer is down.
 */
export function onePointerPanOwnedAtGestureStart(
  camera: CameraView,
): boolean {
  assertCameraZoom(camera.zoom);
  return (
    clampCamera(camera).zoom >
    DEFAULT_CAMERA_LIMITS.minimumZoom
  );
}

/**
 * Host touch-action for the next gesture.
 *
 * At whole-dish overview, normal page pan stays browser-owned while browser
 * pinch zoom remains disabled so Petra can retain its own two-pointer pinch.
 * Once zoomed, Petra owns direct manipulation for pan and pinch.
 */
export function rendererTouchActionForNextGesture(
  camera: CameraView,
): RendererTouchAction {
  return onePointerPanOwnedAtGestureStart(camera)
    ? "none"
    : "pan-x pan-y";
}

/**
 * Whether an accepted gesture intent represents work Petra owns.
 *
 * Pinch is always Petra-owned. One-pointer pan follows the ownership latched
 * at gesture start. "none" never claims browser behavior.
 */
export function rendererOwnsGestureIntent(
  kind: PointerGestureIntent["kind"],
  panOwnedAtGestureStart: boolean,
): boolean {
  if (kind === "pinch") return true;
  if (kind === "pan") return panOwnedAtGestureStart;
  return false;
}

function assertCameraZoom(zoom: number): void {
  if (!Number.isFinite(zoom) || zoom <= 0) {
    throw new RangeError("camera zoom must be finite and > 0");
  }
}
