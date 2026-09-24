import type { CameraView } from "../model";
import {
  panCamera,
  screenToDish,
  zoomAroundDishPoint,
  type ScreenPoint,
  type ViewportSize,
} from "./camera";

export interface GesturePointer {
  readonly pointerId: number;
  readonly pointerType: string;
  readonly point: ScreenPoint;
}

export interface PinchFrame {
  readonly pointerIds: readonly [number, number];
  readonly centroid: ScreenPoint;
  readonly distance: number;
}

export function upsertGesturePointer(
  pointers: readonly GesturePointer[],
  next: GesturePointer,
): readonly GesturePointer[] {
  validatePointer(next);
  const result = pointers.filter((pointer) => pointer.pointerId !== next.pointerId);
  result.push(next);
  result.sort((left, right) => left.pointerId - right.pointerId);
  return result;
}

export function removeGesturePointer(
  pointers: readonly GesturePointer[],
  pointerId: number,
): readonly GesturePointer[] {
  if (!Number.isSafeInteger(pointerId) || pointerId < 0) {
    throw new RangeError("pointerId must be a non-negative safe integer");
  }
  return pointers.filter((pointer) => pointer.pointerId !== pointerId);
}

/**
 * Returns a deterministic two-touch pinch frame. Mouse/pen contacts never
 * become pinch partners; they retain their existing one-pointer camera path.
 */
export function pinchFrame(
  pointers: readonly GesturePointer[],
): PinchFrame | null {
  const touches = pointers
    .filter((pointer) => pointer.pointerType === "touch")
    .sort((left, right) => left.pointerId - right.pointerId);

  const first = touches[0];
  const second = touches[1];
  if (first === undefined || second === undefined) return null;

  const dx = second.point.x - first.point.x;
  const dy = second.point.y - first.point.y;
  const distance = Math.hypot(dx, dy);
  if (!Number.isFinite(distance) || distance <= 0) return null;

  return {
    pointerIds: [first.pointerId, second.pointerId],
    centroid: {
      x: (first.point.x + second.point.x) / 2,
      y: (first.point.y + second.point.y) / 2,
    },
    distance,
  };
}

/**
 * Applies a pinch as presentation-only camera intent.
 *
 * Zoom is anchored at the prior gesture centroid, then centroid translation is
 * treated like the existing drag path. This keeps the touched dish feature
 * under the user's fingers while reusing Petra's bounded camera helpers.
 */
export function applyPinchCamera(
  camera: CameraView,
  previous: PinchFrame,
  current: PinchFrame,
  viewport: ViewportSize,
): CameraView {
  if (
    previous.pointerIds[0] !== current.pointerIds[0] ||
    previous.pointerIds[1] !== current.pointerIds[1]
  ) {
    throw new TypeError("pinch frames must describe the same pointer pair");
  }
  if (
    !Number.isFinite(previous.distance) ||
    previous.distance <= 0 ||
    !Number.isFinite(current.distance) ||
    current.distance <= 0
  ) {
    throw new RangeError("pinch distances must be finite and > 0");
  }

  const anchor = screenToDish(previous.centroid, viewport, camera);
  const zoomed = zoomAroundDishPoint(
    camera,
    anchor,
    current.distance / previous.distance,
  );

  return panCamera(
    zoomed,
    {
      x: current.centroid.x - previous.centroid.x,
      y: current.centroid.y - previous.centroid.y,
    },
    viewport,
  );
}

function validatePointer(pointer: GesturePointer): void {
  if (!Number.isSafeInteger(pointer.pointerId) || pointer.pointerId < 0) {
    throw new RangeError("pointerId must be a non-negative safe integer");
  }
  if (pointer.pointerType.trim().length === 0) {
    throw new TypeError("pointerType must be non-empty");
  }
  if (!Number.isFinite(pointer.point.x) || !Number.isFinite(pointer.point.y)) {
    throw new RangeError("pointer coordinates must be finite");
  }
}
