import type { DishVisualMotionSpec } from "../render/visualInterpolation";
import {
  type MotionPreference,
  type MotionTreatment,
} from "../ui/motion/policy";
import { planDishMotionPhase } from "../ui/motion/dishVocabulary";

export interface DishHyphalMotionPlan {
  readonly mode: MotionPreference;
  readonly treatment: MotionTreatment;
  readonly motion: DishVisualMotionSpec;
}

/**
 * Projects the evidence-gated fungal-branch vocabulary into a renderer-facing
 * path-length motion spec.
 *
 * The render channel itself supplies explicit fungus identity. Full motion may
 * reveal newly authoritative path length; Reduced/Off settle immediately on
 * exact authoritative geometry so spatial growth animation is never required
 * to understand state.
 */
export function resolveDishHyphalMotion(
  mode: MotionPreference,
): DishHyphalMotionPlan {
  const phase = planDishMotionPhase({
    phase: "fungal-branch",
    preference: mode,
    evidence: "authoritative-state",
  });

  if (!phase.eligible) {
    throw new Error("fungal-branch motion unexpectedly refused authoritative evidence");
  }

  return {
    mode,
    treatment: phase.treatment,
    motion: {
      durationMs: phase.treatment === "animate" ? phase.durationMs : 0,
      easing: phase.easing,
    },
  };
}
