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
  readonly translateYRem: number;
  readonly scale: number;
  readonly emphasis: "rest" | "hover" | "focus" | "press" | "selected" | "disabled";
  readonly showFocusRing: boolean;
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
      translateYRem: 0,
      scale: 1,
      emphasis: "disabled",
      showFocusRing: false,
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
      translateYRem: 0,
      scale: 1,
      emphasis: staticEmphasis,
      showFocusRing: state === "focus",
    };
  }

  return {
    state,
    durationMs: spatial.durationMs,
    translateYRem: state === "hover" || state === "focus" || state === "selected" ? -0.08 : 0,
    scale: state === "press" ? 0.975 : state === "selected" ? 1.015 : 1,
    emphasis: staticEmphasis,
    showFocusRing: state === "focus",
  };
}
