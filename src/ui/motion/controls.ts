import { resolveMotion, type MotionPreference } from "./policy";
import { MOTION } from "./tokens";

export type ControlInteractionState =
  | "idle"
  | "hovered"
  | "pressed"
  | "selected"
  | "disabled";

export interface ControlMotionStyle {
  readonly durationMs: number;
  readonly translateYpx: number;
  readonly scale: number;
  readonly emphasized: boolean;
  readonly interactive: boolean;
}

/**
 * Resolves visual-only control feedback for React/CSS adapters.
 *
 * This policy never communicates scientific meaning by motion. Selected state
 * remains explicit through `emphasized`, even when transform motion is reduced
 * or disabled. Focus rings are intentionally owned by the app accessibility
 * layer rather than this resolver.
 */
export function resolveControlMotion(
  preference: MotionPreference,
  state: ControlInteractionState,
): ControlMotionStyle {
  const interactive = state !== "disabled";
  const emphasized = state === "selected" || state === "pressed";

  if (!interactive) {
    return {
      durationMs: 0,
      translateYpx: 0,
      scale: 1,
      emphasized: false,
      interactive: false,
    };
  }

  const resolved = resolveMotion(preference, {
    kind: "decorative",
    durationMs: MOTION.controlInteraction.durationMs,
  });

  if (resolved.treatment !== "animate") {
    return {
      durationMs: 0,
      translateYpx: 0,
      scale: 1,
      emphasized,
      interactive: true,
    };
  }

  if (state === "pressed") {
    return {
      durationMs: resolved.durationMs,
      translateYpx: 1,
      scale: 0.985,
      emphasized: true,
      interactive: true,
    };
  }

  if (state === "hovered") {
    return {
      durationMs: resolved.durationMs,
      translateYpx: -1,
      scale: 1.01,
      emphasized: false,
      interactive: true,
    };
  }

  return {
    durationMs: resolved.durationMs,
    translateYpx: 0,
    scale: 1,
    emphasized,
    interactive: true,
  };
}
