import { resolveMotion, type MotionPreference } from "./policy";
import { MOTION } from "./tokens";

export interface DishAmbientPresentation {
  readonly motion: ReturnType<typeof resolveMotion>;
  readonly easing: readonly [number, number, number, number];
}

/**
 * Presentation-only ambience around the dish hero.
 *
 * The loop is deliberately decorative: it cannot represent growth, diffusion,
 * biological pulse rate, simulation speed, or any other scientific quantity.
 */
export function resolveDishAmbient(
  preference: MotionPreference,
): DishAmbientPresentation {
  return {
    motion: resolveMotion(preference, {
      kind: "decorative",
      durationMs: MOTION.dishAmbient.durationMs,
      loops: true,
    }),
    easing: MOTION.dishAmbient.easing,
  };
}
