import type { CameraView } from "../model";
import {
  panCamera,
  screenToDish,
  zoomAroundDishPoint,
  type ScreenPoint,
  type ViewportSize,
} from "./camera";

export interface TouchPointerSample {
  readonly id: number;
  readonly point: ScreenPoint;
}

export function upsertTouchPointer(
  pointers: readonly TouchPointerSample[],
  id: number,
  point: ScreenPoint,
): readonly TouchPointerSample[] {
  if (!Number.isInteger(id)) {
    throw new RangeError("touch pointer id must be an integer");
  }
  assertPoint(point);

  const next = pointers.filter((pointer) => pointer.id !== id);
  next.push({ id, point });
  next.sort((left, right) => left.id - right.id);
  return next;
}

export function removeTouchPointer(
  pointers: readonly TouchPointerSample[],
  id: number,
): readonly TouchPointerSample[] {
  return pointers.filter((pointer) => pointer.id !== id);
}

/**
 * Applies the two common pointers shared by consecutive touch samples.
 *
 * Distance changes zoom around the previous gesture centroid. Centroid movement
 * then pans the zoomed camera so the content tracks the fingers. If a second
 * pointer was just added or removed there is no stable two-sample pinch yet, so
 * the camera is returned unchanged until the next move.
 */
export function applyPinchGesture(
  camera: CameraView,
  previous: readonly TouchPointerSample[],
  next: readonly TouchPointerSample[],
  viewport: ViewportSize,
): CameraView {
  const shared = previous
    .filter((pointer) => next.some((candidate) => candidate.id === pointer.id))
    .slice(0, 2);

  if (shared.length < 2) {
    return camera;
  }

  const previousPair = shared;
  const nextPair = previousPair.map((pointer) => {
    const match = next.find((candidate) => candidate.id === pointer.id);
    if (match === undefined) {
      throw new Error("shared touch pointer disappeared during pinch resolution");
    }
    return match;
  });

  const previousMetrics = gestureMetrics(previousPair);
  const nextMetrics = gestureMetrics(nextPair);

  if (previousMetrics.distance <= 1e-6 || nextMetrics.distance <= 1e-6) {
    return camera;
  }

  const anchor = screenToDish(previousMetrics.centroid, viewport, camera);
  const zoomed = zoomAroundDishPoint(
    camera,
    anchor,
    nextMetrics.distance / previousMetrics.distance,
  );

  return panCamera(
    zoomed,
    {
      x: nextMetrics.centroid.x - previousMetrics.centroid.x,
      y: nextMetrics.centroid.y - previousMetrics.centroid.y,
    },
    viewport,
  );
}

function gestureMetrics(
  pair: readonly [TouchPointerSample, TouchPointerSample] | readonly TouchPointerSample[],
): { readonly centroid: ScreenPoint; readonly distance: number } {
  const first = pair[0];
  const second = pair[1];
  if (first === undefined || second === undefined) {
    throw new RangeError("pinch gesture requires two touch pointers");
  }

  const dx = second.point.x - first.point.x;
  const dy = second.point.y - first.point.y;
  return {
    centroid: {
      x: (first.point.x + second.point.x) / 2,
      y: (first.point.y + second.point.y) / 2,
    },
    distance: Math.hypot(dx, dy),
  };
}

function assertPoint(point: ScreenPoint): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new RangeError("touch pointer coordinates must be finite");
  }
}
