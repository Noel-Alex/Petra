import {
  resolveMotion,
  type MotionPreference,
  type MotionTreatment,
} from "./policy";
import { MOTION } from "./tokens";

export type DishFocusMode = "workspace" | "focus";

export interface DishFocusPresentation {
  readonly mode: DishFocusMode;
  readonly dishPriority: "balanced" | "primary";
  readonly sideChrome: "expanded" | "collapsed";
  readonly timelineDensity: "full" | "compact";
  readonly treatment: MotionTreatment;
  readonly durationMs: number;
  readonly easing: readonly [number, number, number, number];
  readonly ariaLabel: string;
  readonly presentationOnly: true;
}

/**
 * Resolve dish-first focus choreography without taking any simulation authority.
 *
 * Focus mode only changes layout density and visual priority. It never pauses,
 * advances, rewinds, or otherwise mutates the authoritative run.
 */
export function resolveDishFocusPresentation(
  mode: DishFocusMode,
  preference: MotionPreference,
): DishFocusPresentation {
  assertDishFocusMode(mode);

  const motion = resolveMotion(preference, {
    kind: "navigational",
    durationMs: MOTION.panel.durationMs,
    distancePx: 320,
  });

  return {
    mode,
    dishPriority: mode === "focus" ? "primary" : "balanced",
    sideChrome: mode === "focus" ? "collapsed" : "expanded",
    timelineDensity: mode === "focus" ? "compact" : "full",
    treatment: motion.treatment,
    durationMs: motion.durationMs,
    easing: MOTION.panel.easing,
    ariaLabel:
      mode === "focus"
        ? "Dish focus mode"
        : "Full experiment workspace",
    presentationOnly: true,
  };
}

function assertDishFocusMode(mode: DishFocusMode): void {
  if (mode !== "workspace" && mode !== "focus") {
    throw new RangeError(`unknown dish focus mode: ${String(mode)}`);
  }
}
