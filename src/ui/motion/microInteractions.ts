import { resolveMotion, type MotionPreference } from "./policy";
import { MOTION } from "./tokens";

export type MicroInteractionState =
  | "idle"
  | "hover"
  | "focus"
  | "press"
  | "selected"
  | "disabled";

export interface MicroInteractionPresentation {
  readonly state: MicroInteractionState;
  readonly durationMs: number;
  readonly easing: readonly [number, number, number, number];
  readonly translateYRem: number;
  readonly scale: number;
  readonly emphasis: "rest" | "hover" | "focus" | "press" | "selected" | "disabled";
}

/**
 * Presentation-only micro-interaction contract for DOM controls/cards.
 * Spatial movement is decorative and therefore collapses under reduced/off motion.
 * Focus/selection meaning remains available through non-motion emphasis.
 */
export function resolveMicroInteraction(
  state: MicroInteractionState,
  preference: MotionPreference,
): MicroInteractionPresentation {
  if (state === "disabled") {
    return {
      state,
      durationMs: 0,
      easing: MOTION.toolPreview.easing,
      translateYRem: 0,
      scale: 1,
      emphasis: "disabled",
    };
  }

  const spatial = resolveMotion(preference, {
    kind: "decorative",
    durationMs: MOTION.toolPreview.durationMs,
  });

  const staticEmphasis = state === "idle" ? "rest" : state;

  if (preference !== "full") {
    return {
      state,
      durationMs: spatial.durationMs,
      easing: MOTION.toolPreview.easing,
      translateYRem: 0,
      scale: 1,
      emphasis: staticEmphasis,
    };
  }

  return {
    state,
    durationMs: spatial.durationMs,
    easing: MOTION.toolPreview.easing,
    translateYRem: state === "hover" || state === "focus" || state === "selected" ? -0.08 : 0,
    scale: state === "press" ? 0.975 : state === "selected" ? 1.015 : 1,
    emphasis: staticEmphasis,
    showFocusRing: state === "focus",
  };
}
