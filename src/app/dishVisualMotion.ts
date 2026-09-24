import type { DishVisualMotionSpec } from "../render/visualInterpolation";
import {
  resolveMotion,
  type MotionPreference,
  type MotionTreatment,
} from "../ui/motion/policy";
import { MOTION } from "../ui/motion/tokens";

export interface DishVisualMotionPlan {
  readonly mode: MotionPreference;
  readonly treatment: MotionTreatment;
  readonly visualMotion: DishVisualMotionSpec;
}

/**
 * Projects Petra's shared presentation policy into the renderer's generic
 * snapshot-continuity contract.
 *
 * Generic snapshot continuity does not know whether a visual delta means
 * growth, death, diffusion, migration, or an LOD change. It therefore must not
 * claim a semantic dish-motion phase. Full motion uses the shared field-shift
 * token as calm continuity timing; Reduced/Off settle at exact authority
 * immediately, preserving the renderer's existing accessibility behavior.
 */
export function resolveDishVisualMotion(
  mode: MotionPreference,
): DishVisualMotionPlan {
  const resolved = resolveMotion(mode, {
    kind: "spatial",
    durationMs: MOTION.fieldShift.durationMs,
  });

  return {
    mode,
    treatment: resolved.treatment,
    visualMotion: {
      durationMs: resolved.treatment === "animate" ? resolved.durationMs : 0,
      easing: MOTION.fieldShift.easing,
    },
  };
}
