import {
  validateRenderSnapshot,
  type DishRenderSnapshot,
} from "./model";
import {
  evaluateDishVisualTransitionAtProgress,
  planDishVisualTransition,
  type DishDrawableState,
} from "./visualInterpolation";

export type DishReplayMotion = "interpolate" | "snap-to-authority";

export type DishReplayPresentationMode =
  | "authoritative-keyframe"
  | "interpolated-presentation"
  | "previous-authority-snap";

export interface DishReplayPresentation {
  readonly mode: DishReplayPresentationMode;
  readonly state: DishDrawableState;
  readonly requestedSimulationTimeHours: number;
  readonly lowerSnapshotId: string;
  readonly upperSnapshotId: string;
  readonly lowerSimulationTimeHours: number;
  readonly upperSimulationTimeHours: number;
  readonly progress: number;
  readonly stateAuthority: "authoritative" | "presentation-only";
  readonly interpolationRefusalReason?: string;
}

/**
 * Linear easing is intentional for direct scrubbing: timeline position maps
 * monotonically to visual position instead of applying a wall-clock flourish.
 * The duration is unused by normalized-progress evaluation but remains a valid
 * shared motion spec for the transition planner.
 */
const REPLAY_SCRUB_MOTION = Object.freeze({
  durationMs: 1,
  easing: Object.freeze([0, 0, 1, 1] as const),
});

/**
 * Resolve a deterministic dish presentation for an authoritative snapshot
 * history and requested simulation-time position.
 *
 * Intermediate values are explicitly presentation-only. Exact scientific
 * readouts must continue to come from authoritative keyframes/events, never
 * from the returned interpolated frame.
 */
export function resolveDishReplayPresentation(args: {
  readonly snapshots: readonly DishRenderSnapshot[];
  readonly requestedSimulationTimeHours: number;
  readonly motion?: DishReplayMotion;
}): DishReplayPresentation | null {
  const requested = args.requestedSimulationTimeHours;
  if (!Number.isFinite(requested) || requested < 0) {
    throw new RangeError(
      "requested replay simulation time must be finite and non-negative",
    );
  }

  if (args.snapshots.length === 0) return null;
  validateReplayHistory(args.snapshots);

  const first = args.snapshots[0]!;
  const last = args.snapshots[args.snapshots.length - 1]!;

  if (requested <= first.simulationTimeHours) {
    return authoritativeKeyframe(first, requested);
  }
  if (requested >= last.simulationTimeHours) {
    return authoritativeKeyframe(last, requested);
  }

  const upperIndex = findUpperSnapshotIndex(args.snapshots, requested);
  const lower = args.snapshots[upperIndex - 1]!;
  const upper = args.snapshots[upperIndex]!;

  if (requested === upper.simulationTimeHours) {
    return authoritativeKeyframe(upper, requested);
  }

  const progress =
    (requested - lower.simulationTimeHours) /
    (upper.simulationTimeHours - lower.simulationTimeHours);

  if ((args.motion ?? "interpolate") === "snap-to-authority") {
    return previousAuthoritySnap(lower, upper, requested, progress);
  }

  const transition = planDishVisualTransition(
    lower,
    upper,
    REPLAY_SCRUB_MOTION,
  );
  if (transition.kind === "snap") {
    return {
      ...previousAuthoritySnap(lower, upper, requested, progress),
      interpolationRefusalReason: transition.reason,
    };
  }

  const evaluated = evaluateDishVisualTransitionAtProgress(
    transition.transition,
    progress,
  );

  return {
    mode:
      evaluated.state === upper
        ? "authoritative-keyframe"
        : "interpolated-presentation",
    state: evaluated.state,
    requestedSimulationTimeHours: requested,
    lowerSnapshotId: lower.snapshotId,
    upperSnapshotId: upper.snapshotId,
    lowerSimulationTimeHours: lower.simulationTimeHours,
    upperSimulationTimeHours: upper.simulationTimeHours,
    progress,
    stateAuthority:
      evaluated.state === upper ? "authoritative" : "presentation-only",
  };
}

function validateReplayHistory(
  snapshots: readonly DishRenderSnapshot[],
): void {
  const ids = new Set<string>();
  let previousTime = -Infinity;

  for (const snapshot of snapshots) {
    validateRenderSnapshot(snapshot);

    if (ids.has(snapshot.snapshotId)) {
      throw new RangeError(
        `duplicate replay snapshot id: ${snapshot.snapshotId}`,
      );
    }
    ids.add(snapshot.snapshotId);

    if (snapshot.simulationTimeHours <= previousTime) {
      throw new RangeError(
        "replay snapshot simulation times must be strictly increasing",
      );
    }
    previousTime = snapshot.simulationTimeHours;
  }
}

function findUpperSnapshotIndex(
  snapshots: readonly DishRenderSnapshot[],
  requested: number,
): number {
  let lower = 0;
  let upper = snapshots.length - 1;

  while (lower < upper) {
    const middle = Math.floor((lower + upper) / 2);
    if (snapshots[middle]!.simulationTimeHours <= requested) {
      lower = middle + 1;
    } else {
      upper = middle;
    }
  }

  return lower;
}

function authoritativeKeyframe(
  snapshot: DishRenderSnapshot,
  requested: number,
): DishReplayPresentation {
  return {
    mode: "authoritative-keyframe",
    state: snapshot,
    requestedSimulationTimeHours: requested,
    lowerSnapshotId: snapshot.snapshotId,
    upperSnapshotId: snapshot.snapshotId,
    lowerSimulationTimeHours: snapshot.simulationTimeHours,
    upperSimulationTimeHours: snapshot.simulationTimeHours,
    progress: 1,
    stateAuthority: "authoritative",
  };
}

function previousAuthoritySnap(
  lower: DishRenderSnapshot,
  upper: DishRenderSnapshot,
  requested: number,
  progress: number,
): DishReplayPresentation {
  return {
    mode: "previous-authority-snap",
    state: lower,
    requestedSimulationTimeHours: requested,
    lowerSnapshotId: lower.snapshotId,
    upperSnapshotId: upper.snapshotId,
    lowerSimulationTimeHours: lower.simulationTimeHours,
    upperSimulationTimeHours: upper.simulationTimeHours,
    progress,
    stateAuthority: "authoritative",
  };
}
