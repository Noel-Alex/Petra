import {
  resolveMotion,
  type MotionPreference,
  type MotionTreatment,
} from "../ui/motion/policy";
import { MOTION } from "../ui/motion/tokens";
import type { SurfaceTransitionPlan } from "../ui/motion/semanticTransitions";

export interface SurfaceMotionCss {
  readonly duration: string;
  readonly easing: string;
  readonly treatment: MotionTreatment;
}

export function surfaceMotionCss(plan: SurfaceTransitionPlan): SurfaceMotionCss {
  return {
    duration: `${plan.durationMs}ms`,
    easing: cubicBezier(plan.easing),
    treatment: plan.treatment,
  };
}

export function semanticZoomGuideMotionCss(
  preference: MotionPreference,
): SurfaceMotionCss {
  const resolved = resolveMotion(preference, {
    kind: "decorative",
    durationMs: MOTION.toolPreview.durationMs,
  });

  return {
    duration: `${resolved.durationMs}ms`,
    easing: cubicBezier(MOTION.toolPreview.easing),
    treatment: resolved.treatment,
  };
}

export const SEMANTIC_ZOOM_GUIDE = Object.freeze([
  {
    id: "dish",
    label: "Whole dish",
    meaning: "authoritative aggregate state",
  },
  {
    id: "colony",
    label: "Colony",
    meaning: "representative visual proxies",
  },
  {
    id: "representative-cell",
    label: "Cell story",
    meaning: "illustrative explanation — not literal microscopy",
  },
] as const);

function cubicBezier(
  easing: readonly [number, number, number, number],
): string {
  return `cubic-bezier(${easing.join(", ")})`;
}
