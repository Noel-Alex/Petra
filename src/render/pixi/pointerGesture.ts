import {
  isScreenPointInsideDishAperture,
  type ScreenPoint,
  type ViewportSize,
} from "./camera";

export interface GesturePointer {
  readonly id: number;
  readonly point: ScreenPoint;
}

export interface PointerGestureState {
  readonly active: readonly GesturePointer[];
}

export type PointerGestureIntent =
  | { readonly kind: "none" }
  | { readonly kind: "pan"; readonly deltaScreen: ScreenPoint }
  | {
      readonly kind: "pinch";
      readonly anchorScreen: ScreenPoint;
      readonly centroidDelta: ScreenPoint;
      readonly zoomFactor: number;
    };

export interface PointerGestureUpdate {
  readonly state: PointerGestureState;
  readonly accepted: boolean;
  readonly intent: PointerGestureIntent;
}

const NO_INTENT: PointerGestureIntent = Object.freeze({ kind: "none" });
const MIN_PINCH_DISTANCE_PX = 4;

export function createPointerGestureState(): PointerGestureState {
  return { active: [] };
}

export function beginPointerGestureInDishAperture(
  state: PointerGestureState,
  id: number,
  point: ScreenPoint,
  viewport: ViewportSize,
): PointerGestureUpdate {
  if (!isScreenPointInsideDishAperture(point, viewport)) {
    return { state, accepted: false, intent: NO_INTENT };
  }
  return beginPointerGesture(state, id, point);
}

export function beginPointerGesture(
  state: PointerGestureState,
  id: number,
  point: ScreenPoint,
): PointerGestureUpdate {
  assertPointer(id, point);

  const existing = state.active.findIndex((pointer) => pointer.id === id);
  if (existing >= 0) {
    const active = state.active.map((pointer, index) =>
      index === existing ? { id, point } : pointer,
    );
    return { state: { active }, accepted: true, intent: NO_INTENT };
  }

  if (state.active.length >= 2) {
    return { state, accepted: false, intent: NO_INTENT };
  }

  return {
    state: { active: [...state.active, { id, point }] },
    accepted: true,
    intent: NO_INTENT,
  };
}

export function movePointerGesture(
  state: PointerGestureState,
  id: number,
  point: ScreenPoint,
): PointerGestureUpdate {
  assertPointer(id, point);

  const index = state.active.findIndex((pointer) => pointer.id === id);
  if (index < 0) {
    return { state, accepted: false, intent: NO_INTENT };
  }

  const previous = state.active;
  const nextActive = previous.map((pointer, pointerIndex) =>
    pointerIndex === index ? { id, point } : pointer,
  );
  const nextState: PointerGestureState = { active: nextActive };

  if (previous.length === 1) {
    const prior = previous[0]?.point;
    if (prior === undefined) {
      return { state: nextState, accepted: true, intent: NO_INTENT };
    }
    return {
      state: nextState,
      accepted: true,
      intent: {
        kind: "pan",
        deltaScreen: { x: point.x - prior.x, y: point.y - prior.y },
      },
    };
  }

  if (previous.length === 2) {
    const before = pinchGeometry(previous);
    const after = pinchGeometry(nextActive);
    if (
      before.distance < MIN_PINCH_DISTANCE_PX ||
      after.distance < MIN_PINCH_DISTANCE_PX
    ) {
      return { state: nextState, accepted: true, intent: NO_INTENT };
    }

    return {
      state: nextState,
      accepted: true,
      intent: {
        kind: "pinch",
        anchorScreen: before.centroid,
        centroidDelta: {
          x: after.centroid.x - before.centroid.x,
          y: after.centroid.y - before.centroid.y,
        },
        zoomFactor: after.distance / before.distance,
      },
    };
  }

  return { state: nextState, accepted: true, intent: NO_INTENT };
}

export function endPointerGesture(
  state: PointerGestureState,
  id: number,
): PointerGestureState {
  if (!Number.isFinite(id)) {
    throw new RangeError("pointer id must be finite");
  }
  return { active: state.active.filter((pointer) => pointer.id !== id) };
}

function pinchGeometry(active: readonly GesturePointer[]): {
  readonly centroid: ScreenPoint;
  readonly distance: number;
} {
  const first = active[0];
  const second = active[1];
  if (first === undefined || second === undefined) {
    return { centroid: { x: 0, y: 0 }, distance: 0 };
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

function assertPointer(id: number, point: ScreenPoint): void {
  if (!Number.isFinite(id)) {
    throw new RangeError("pointer id must be finite");
  }
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new RangeError("pointer coordinates must be finite");
  }
}
