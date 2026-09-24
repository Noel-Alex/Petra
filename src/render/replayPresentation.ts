import {
  validateRenderSnapshot,
  type DishRenderSnapshot,
} from "./model";
import {
  validateDishReplayOrder,
  type AuthoritativeDishReplayKeyframe,
} from "./replayIdentity";
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
  readonly runBranchIdentity: string;
  /**
   * Presentation cursor on the authoritative accepted-command axis.
   * It is deliberately separate from biological time.
   */
  readonly requestedOrderPosition: number;
  readonly lowerSnapshotId: string;
  readonly upperSnapshotId: string;
  readonly lowerAcceptedCommandCount: number;
  readonly upperAcceptedCommandCount: number;
  readonly lowerSimulationTimeHours: number;
  readonly upperSimulationTimeHours: number;
  readonly progress: number;
  readonly stateAuthority: "authoritative" | "presentation-only";
  readonly interpolationRefusalReason?: DishVisualTransitionRefusalReason;
}

export interface DishReplayPresenter {
  /**
   * Evaluate one position on the authoritative replay-order axis.
   *
   * Exact integer positions that correspond to recorded keyframes return the
   * exact authoritative DishRenderSnapshot. Fractional positions may produce a
   * presentation-only morph between adjacent recorded keyframes.
   *
   * Intermediate presentation frames are reusable scratch state owned by this
   * presenter. Callers that need to retain an old visual frame must copy it;
   * scientific history must always retain the authoritative keyframes instead.
   */
  evaluate(
    requestedOrderPosition: number,
    motion?: DishReplayMotion,
  ): DishReplayPresentation | null;
}

/**
 * Linear easing is intentional for direct scrubbing: replay-order position maps
 * monotonically to visual position instead of applying a wall-clock flourish.
 * The duration is unused by normalized-progress evaluation but remains a valid
 * shared motion spec for the transition planner.
 */
const REPLAY_SCRUB_MOTION = Object.freeze({
  durationMs: 1,
  easing: Object.freeze([0, 0, 1, 1] as const),
});

/**
 * Create a replay presenter for one immutable authoritative keyframe history.
 *
 * History validation happens once. Ordering comes only from the versioned
 * runtime-owned replay identity; supplied array position and biological time
 * are never used as substitute sequence authority. The active adjacent-keyframe
 * transition is cached so repeated scrub updates within the same interval reuse
 * the preallocated Float32 presentation buffers from visualInterpolation.ts.
 */
export function createDishReplayPresenter(
  keyframes: readonly AuthoritativeDishReplayKeyframe[],
): DishReplayPresenter {
  validateReplayHistory(keyframes);

  let cachedLowerIndex = -1;
  let cachedTransition: DishVisualTransition | null = null;
  let cachedRefusal: DishVisualTransitionRefusalReason | null = null;

  const evaluate = (
    requestedOrderPosition: number,
    motion: DishReplayMotion = "interpolate",
  ): DishReplayPresentation | null => {
    const requested = requestedOrderPosition;
    if (!Number.isFinite(requested) || requested < 0) {
      throw new RangeError(
        "requested replay order position must be finite and non-negative",
      );
    }

    if (keyframes.length === 0) return null;

    const first = keyframes[0]!;
    const last = keyframes[keyframes.length - 1]!;

    if (requested <= first.order.acceptedCommandCount) {
      return authoritativeKeyframe(first, requested);
    }
    if (requested >= last.order.acceptedCommandCount) {
      return authoritativeKeyframe(last, requested);
    }

    const upperIndex = findUpperKeyframeIndex(keyframes, requested);
    const lowerIndex = upperIndex - 1;
    const lowerKeyframe = keyframes[lowerIndex]!;
    const upperKeyframe = keyframes[upperIndex]!;
    const lower = lowerKeyframe.snapshot;
    const upper = upperKeyframe.snapshot;

    if (requested === upperKeyframe.order.acceptedCommandCount) {
      return authoritativeKeyframe(upperKeyframe, requested);
    }

    const progress =
      (requested - lowerKeyframe.order.acceptedCommandCount) /
      (upperKeyframe.order.acceptedCommandCount -
        lowerKeyframe.order.acceptedCommandCount);

    if (motion === "snap-to-authority") {
      return previousAuthoritySnap(
        lowerKeyframe,
        upperKeyframe,
        requested,
        progress,
      );
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
        ...previousAuthoritySnap(
          lowerKeyframe,
          upperKeyframe,
          requested,
          progress,
        ),
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
      runBranchIdentity: lowerKeyframe.order.runBranchIdentity,
      requestedOrderPosition: requested,
      lowerSnapshotId: lower.snapshotId,
      upperSnapshotId: upper.snapshotId,
      lowerAcceptedCommandCount:
        lowerKeyframe.order.acceptedCommandCount,
      upperAcceptedCommandCount:
        upperKeyframe.order.acceptedCommandCount,
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
 * DishReplayPresenter and reuse it for the lifetime of a keyframe history.
 */
export function resolveDishReplayPresentation(args: {
  readonly keyframes: readonly AuthoritativeDishReplayKeyframe[];
  readonly requestedOrderPosition: number;
  readonly motion?: DishReplayMotion;
}): DishReplayPresentation | null {
  const presenter = createDishReplayPresenter(args.keyframes);
  return presenter.evaluate(
    args.requestedOrderPosition,
    args.motion ?? "interpolate",
  );
}

function validateReplayHistory(
  keyframes: readonly AuthoritativeDishReplayKeyframe[],
): void {
  const ids = new Set<string>();
  let runBranchIdentity: string | null = null;
  let previousOrder = -1;
  let previousTime = -Infinity;

  for (const keyframe of keyframes) {
    validateDishReplayOrder(keyframe.order);
    validateRenderSnapshot(keyframe.snapshot);

    if (runBranchIdentity === null) {
      runBranchIdentity = keyframe.order.runBranchIdentity;
    } else if (keyframe.order.runBranchIdentity !== runBranchIdentity) {
      throw new RangeError(
        "replay keyframes must belong to one runBranchIdentity",
      );
    }

    if (ids.has(keyframe.snapshot.snapshotId)) {
      throw new RangeError(
        `duplicate replay snapshot id: ${keyframe.snapshot.snapshotId}`,
      );
    }
    ids.add(keyframe.snapshot.snapshotId);

    if (keyframe.order.acceptedCommandCount <= previousOrder) {
      throw new RangeError(
        "replay accepted-command order must be strictly increasing",
      );
    }
    previousOrder = keyframe.order.acceptedCommandCount;

    if (keyframe.snapshot.simulationTimeHours < previousTime) {
      throw new RangeError(
        "replay biological time must be non-decreasing within one run branch",
      );
    }
    previousTime = keyframe.snapshot.simulationTimeHours;
  }
}

function findUpperKeyframeIndex(
  keyframes: readonly AuthoritativeDishReplayKeyframe[],
  requested: number,
): number {
  let lower = 0;
  let upper = keyframes.length - 1;

  while (lower < upper) {
    const middle = Math.floor((lower + upper) / 2);
    if (
      keyframes[middle]!.order.acceptedCommandCount <= requested
    ) {
      lower = middle + 1;
    } else {
      upper = middle;
    }
  }

  return lower;
}

function authoritativeKeyframe(
  keyframe: AuthoritativeDishReplayKeyframe,
  requested: number,
): DishReplayPresentation {
  const snapshot = keyframe.snapshot;
  return {
    mode: "authoritative-keyframe",
    state: snapshot,
    runBranchIdentity: keyframe.order.runBranchIdentity,
    requestedOrderPosition: requested,
    lowerSnapshotId: snapshot.snapshotId,
    upperSnapshotId: snapshot.snapshotId,
    lowerAcceptedCommandCount: keyframe.order.acceptedCommandCount,
    upperAcceptedCommandCount: keyframe.order.acceptedCommandCount,
    lowerSimulationTimeHours: snapshot.simulationTimeHours,
    upperSimulationTimeHours: snapshot.simulationTimeHours,
    progress: 1,
    stateAuthority: "authoritative",
  };
}

function previousAuthoritySnap(
  lowerKeyframe: AuthoritativeDishReplayKeyframe,
  upperKeyframe: AuthoritativeDishReplayKeyframe,
  requested: number,
  progress: number,
): DishReplayPresentation {
  const lower = lowerKeyframe.snapshot;
  const upper = upperKeyframe.snapshot;
  return {
    mode: "previous-authority-snap",
    state: lower,
    runBranchIdentity: lowerKeyframe.order.runBranchIdentity,
    requestedOrderPosition: requested,
    lowerSnapshotId: lower.snapshotId,
    upperSnapshotId: upper.snapshotId,
    lowerAcceptedCommandCount:
      lowerKeyframe.order.acceptedCommandCount,
    upperAcceptedCommandCount:
      upperKeyframe.order.acceptedCommandCount,
    lowerSimulationTimeHours: lower.simulationTimeHours,
    upperSimulationTimeHours: upper.simulationTimeHours,
    progress,
    stateAuthority: "authoritative",
  };
}
