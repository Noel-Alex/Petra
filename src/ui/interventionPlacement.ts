import type {
  InterventionTool,
  NormalizedDishPoint,
} from "./interventionPreview";

export type InterventionPlacementPhase = "idle" | "placing";

export interface InterventionPlacementState {
  readonly phase: InterventionPlacementPhase;
  readonly tool: InterventionTool | null;
  readonly point: NormalizedDishPoint;
}

export const DEFAULT_INTERVENTION_PLACEMENT_POINT: NormalizedDishPoint =
  Object.freeze({ x: 0.5, y: 0.5 });

/**
 * Presentation-only target radius. This is cursor affordance, not a modeled
 * intervention footprint and must never be sent to simulation authority.
 */
export const INTERVENTION_TARGET_RING_RADIUS_FRACTION = 0.075;

export function createInterventionPlacementState(): InterventionPlacementState {
  return {
    phase: "idle",
    tool: null,
    point: DEFAULT_INTERVENTION_PLACEMENT_POINT,
  };
}

export function beginInterventionPlacement(
  state: InterventionPlacementState,
  tool: InterventionTool,
): InterventionPlacementState {
  return {
    phase: "placing",
    tool,
    point: state.point,
  };
}

export function cancelInterventionPlacement(
  state: InterventionPlacementState,
): InterventionPlacementState {
  if (state.phase === "idle" && state.tool === null) return state;
  return {
    phase: "idle",
    tool: null,
    point: state.point,
  };
}

export function moveInterventionPlacement(
  state: InterventionPlacementState,
  point: NormalizedDishPoint,
): InterventionPlacementState {
  if (state.phase !== "placing" || state.tool === null) return state;
  const constrained = constrainPointToCircularDish(point);
  if (
    constrained.x === state.point.x &&
    constrained.y === state.point.y
  ) {
    return state;
  }
  return { ...state, point: constrained };
}

export function setInterventionPlacementAxis(
  state: InterventionPlacementState,
  axis: "x" | "y",
  value: number,
): InterventionPlacementState {
  if (!Number.isFinite(value)) {
    throw new RangeError("placement axis value must be finite");
  }

  return moveInterventionPlacement(state, {
    ...state.point,
    [axis]: value,
  });
}

export function constrainPointToCircularDish(
  point: NormalizedDishPoint,
): NormalizedDishPoint {
  assertFinitePoint(point);
  const dx = point.x - 0.5;
  const dy = point.y - 0.5;
  const distance = Math.hypot(dx, dy);

  if (distance <= 0.5) {
    return {
      x: normalizeSignedZero(point.x),
      y: normalizeSignedZero(point.y),
    };
  }

  const scale = 0.5 / distance;
  return {
    x: normalizeSignedZero(0.5 + dx * scale),
    y: normalizeSignedZero(0.5 + dy * scale),
  };
}

export function isPointInsideCircularDish(
  point: NormalizedDishPoint,
): boolean {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
  const dx = point.x - 0.5;
  const dy = point.y - 0.5;
  return dx * dx + dy * dy <= 0.25 + Number.EPSILON;
}

function assertFinitePoint(point: NormalizedDishPoint): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new RangeError("placement coordinates must be finite");
  }
}

function normalizeSignedZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}
