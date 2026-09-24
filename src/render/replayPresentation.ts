import {
  validateRenderSnapshot,
  type DishRenderSnapshot,
} from "./model";
import {
  evaluateDishVisualTransitionAtProgress,
  planDishVisualTransition,
  type DishDrawableState,
  type DishVisualTransition,
  type DishVisualTransitionRefusalReason,
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
  readonly interpolationRefusalReason?: DishVisualTransitionRefusalReason;
}

export interface DishReplayPresenter {
  /**
   * Evaluate one requested simulation-time position.
   *
   * Intermediate presentation frames are reusable scratch state owned by this
   * presenter. Callers that need to retain an old visual frame must copy it;
   * scientific history must always retain the authoritative snapshots instead.
   */
  evaluate(
    requestedSimulationTimeHours: number,
    motion?: DishReplayMotion,
  ): DishReplayPresentation | null;
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
 * Create a replay presenter for one immutable authoritative snapshot history.
 *
 * History validation happens once. The active adjacent-keyframe transition is
 * cached so repeated pointer/scrub updates within the same interval reuse the
 * preallocated Float32 presentation buffers from visualInterpolation.ts.
 */
export function createDishReplayPresenter(
  snapshots: readonly DishRenderSnapshot[],
): DishReplayPresenter {
  validateReplayHistory(snapshots);

  let cachedLowerIndex = -1;
  let cachedTransition: DishVisualTransition | null = null;
  let cachedRefusal: DishVisualTransitionRefusalReason | null = null;

  const evaluate = (
    requestedSimulationTimeHours: number,
    motion: DishReplayMotion = "interpolate",
  ): DishReplayPresentation | null => {
    const requested = requestedSimulationTimeHours;
    if (!Number.isFinite(requested) || requested < 0) {
      throw new RangeError(
        "requested replay simulation time must be finite and non-negative",
      );
    }

    if (snapshots.length === 0) return null;

    const first = snapshots[0]!;
    const last = snapshots[snapshots.length - 1]!;

    if (requested <= first.simulationTimeHours) {
      return authoritativeKeyframe(first, requested);
    }
    if (requested >= last.simulationTimeHours) {
      return authoritativeKeyframe(last, requested);
    }

    const upperIndex = findUpperSnapshotIndex(snapshots, requested);
    const lowerIndex = upperIndex - 1;
    const lower = snapshots[lowerIndex]!;
    const upper = snapshots[upperIndex]!;

    if (requested === upper.simulationTimeHours) {
      return authoritativeKeyframe(upper, requested);
    }

    const progress =
      (requested - lower.simulationTimeHours) /
      (upper.simulationTimeHours - lower.simulationTimeHours);

    if (motion === "snap-to-authority") {
      return previousAuthoritySnap(lower, upper, requested, progress);
    }

    if (cachedLowerIndex !== lowerIndex) {
      const plan = planDishVisualTransition(
        lower,
        upper,
        REPLAY_SCRUB_MOTION,
      );
      cachedLowerIndex = lowerIndex;
      cachedTransition =
        plan.kind === "interpolate" ? plan.transition : null;
      cachedRefusal = plan.kind === "snap" ? plan.reason : null;
    }

    if (cachedTransition === null) {
      return {
        ...previousAuthoritySnap(lower, upper, requested, progress),
        ...(cachedRefusal === null
          ? {}
          : { interpolationRefusalReason: cachedRefusal }),
      };
    }

    const evaluated = evaluateDishVisualTransitionAtProgress(
      cachedTransition,
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
  };

  return Object.freeze({ evaluate });
}

/**
 * One-shot convenience wrapper. Interactive scrub adapters should create one
 * DishReplayPresenter and reuse it for the lifetime of a snapshot history.
 */
export function resolveDishReplayPresentation(args: {
  readonly snapshots: readonly DishRenderSnapshot[];
  readonly requestedSimulationTimeHours: number;
  readonly motion?: DishReplayMotion;
}): DishReplayPresentation | null {
  const presenter = createDishReplayPresenter(args.snapshots);
  return presenter.evaluate(
    args.requestedSimulationTimeHours,
    args.motion ?? "interpolate",
  );
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
