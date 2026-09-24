import {
  describeComparison,
  type ComparisonIdentity,
  type CounterfactualBranch,
} from "../counterfactual";
import {
  resolveMotion,
  type MotionPreference,
  type ResolvedMotion,
} from "../motion/policy";
import {
  planStoryMoment,
  type StoryMomentPlan,
} from "../motion/storyMoments";
import { MOTION } from "../motion/tokens";

export type CompareViewMode = "side-by-side" | "swipe";

export type CompareTone =
  | "matched"
  | "intervention"
  | "stochastic"
  | "mixed"
  | "warning";

export interface ComparePresentation {
  readonly mode: CompareViewMode;
  readonly identity: ComparisonIdentity;
  readonly tone: CompareTone;
  readonly headline: string;
  readonly detail: string;
  readonly canAttributeDifferenceToIntervention: boolean;
  readonly layoutMotion: ResolvedMotion;
  readonly divergenceMotion: ResolvedMotion;
  readonly easing: readonly [number, number, number, number];
  readonly storyMoment: StoryMomentPlan | null;
}

/**
 * Presentation-only interpretation of the counterfactual identity contract.
 *
 * This helper never infers biological causality from outcome data. It only
 * explains whether branch setup differs by intervention stream, stochastic
 * seed, both, neither, or incompatible fork origin.
 */
export function resolveComparePresentation(
  left: CounterfactualBranch,
  right: CounterfactualBranch,
  mode: CompareViewMode,
  motionPreference: MotionPreference,
): ComparePresentation {
  const identity = describeComparison(left, right);
  const copy = copyFor(identity);

  const layoutMotion = resolveMotion(motionPreference, {
    kind: "navigational",
    durationMs: MOTION.panel.durationMs,
  });

  const divergenceMotion = resolveMotion(motionPreference, {
    kind:
      identity.divergenceCause === "intervention" ||
      identity.divergenceCause === "seed-and-intervention"
        ? "causal"
        : "navigational",
    durationMs:
      identity.divergenceCause === "intervention" ||
      identity.divergenceCause === "seed-and-intervention"
        ? MOTION.interventionPulse.durationMs
        : MOTION.panel.durationMs,
  });

  return {
    mode,
    identity,
    tone: copy.tone,
    headline: copy.headline,
    detail: copy.detail,
    canAttributeDifferenceToIntervention:
      identity.hasSharedOrigin &&
      identity.divergenceCause === "intervention",
    layoutMotion,
    divergenceMotion,
    easing: MOTION.panel.easing,
    storyMoment: resolveForkDivergenceStoryMoment(
      left,
      right,
      identity,
      motionPreference,
    ),
  };
}

function resolveForkDivergenceStoryMoment(
  left: CounterfactualBranch,
  right: CounterfactualBranch,
  identity: ComparisonIdentity,
  motionPreference: MotionPreference,
): StoryMomentPlan | null {
  if (
    !identity.hasSharedOrigin ||
    identity.divergenceCause === "none" ||
    identity.divergenceCause === "incompatible-origin"
  ) {
    return null;
  }

  const result = planStoryMoment({
    kind: "fork-divergence",
    preference: motionPreference,
    evidence: {
      source: "authoritative-compare",
      storyKind: "fork-divergence",
      comparisonId: JSON.stringify([
        left.origin.sourceRunId,
        left.origin.checkpointTraceHash,
        left.origin.tick,
        left.origin.simulationTimeHours,
        left.origin.commandCount,
        left.branchId,
        right.branchId,
        left.seed,
        right.seed,
        left.interventionCommandIds,
        right.interventionCommandIds,
      ]),
    },
  });

  if (!result.eligible) {
    throw new Error(
      "shared-origin divergent comparison must produce an eligible fork-divergence story moment",
    );
  }

  return result;
}

export function normalizeSwipePercent(value: number): number {
  if (!Number.isFinite(value)) {
    throw new RangeError("swipe reveal must be finite");
  }

  return Math.min(100, Math.max(0, value));
}

function copyFor(identity: ComparisonIdentity): {
  readonly tone: CompareTone;
  readonly headline: string;
  readonly detail: string;
} {
  switch (identity.divergenceCause) {
    case "none":
      return {
        tone: "matched",
        headline: "Matched branch setup",
        detail:
          "These branches share the same fork origin, seed, and recorded post-fork intervention stream.",
      };
    case "intervention":
      return {
        tone: "intervention",
        headline: "Intervention divergence",
        detail:
          "The branches share an exact origin and seed, but their post-fork intervention streams differ.",
      };
    case "seed":
      return {
        tone: "stochastic",
        headline: "Stochastic-seed divergence",
        detail:
          "The branches share an exact fork origin, but use different stochastic seeds. Outcome differences are not an intervention-only comparison.",
      };
    case "seed-and-intervention":
      return {
        tone: "mixed",
        headline: "Seed + intervention divergence",
        detail:
          "Both stochastic seed and post-fork intervention stream differ, so outcome differences cannot be attributed to the intervention alone.",
      };
    case "incompatible-origin":
      return {
        tone: "warning",
        headline: "Different branch origins",
        detail:
          "These branches do not share the exact same fork checkpoint. Show them side by side, but do not present them as a controlled counterfactual pair.",
      };
  }
}
