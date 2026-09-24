import type { MotionPreference, MotionTreatment } from "./policy";
import {
  planSurfaceTransition,
  type SurfaceTransitionRequest,
} from "./semanticTransitions";

export interface SurfaceCssTransition {
  readonly treatment: MotionTreatment;
  readonly durationCss: string;
  readonly easingCss: string;
  readonly keepMountedDuringExit: boolean;
}

/**
 * Thin CSS-facing projection of the shared surface-transition authority.
 * It converts values to CSS syntax without choosing new motion policy.
 */
export function planSurfaceCssTransition(
  request: SurfaceTransitionRequest,
): SurfaceCssTransition {
  const plan = planSurfaceTransition(request);

  return {
    treatment: plan.treatment,
    durationCss: `${plan.durationMs}ms`,
    easingCss: `cubic-bezier(${plan.easing.join(", ")})`,
    keepMountedDuringExit: plan.keepMountedDuringExit,
  };
}

export function planPanelCssTransition(
  preference: MotionPreference,
  action: "show" | "hide" = "show",
): SurfaceCssTransition {
  return planSurfaceCssTransition({
    surface: "panel",
    action,
    preference,
  });
}
