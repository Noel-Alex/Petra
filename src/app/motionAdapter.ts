import type { MotionTreatment } from "../ui/motion/policy";

export interface SurfaceMotionCss {
  readonly duration: string;
  readonly easing: string;
  readonly treatment: MotionTreatment;
}

export interface MotionCssPlan {
  readonly durationMs: number;
  readonly easing: readonly [number, number, number, number];
  readonly treatment: MotionTreatment;
}

export function surfaceMotionCss(plan: MotionCssPlan): SurfaceMotionCss {
  return {
    duration: `${plan.durationMs}ms`,
    easing: cubicBezier(plan.easing),
    treatment: plan.treatment,
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
