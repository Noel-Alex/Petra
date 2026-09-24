import type { CalmVectorTone } from "./calmVector";

export type BiologyMotifVariant =
  | "dish"
  | "population"
  | "pressure"
  | "lineage"
  | "controls";

export interface BiologyMotifField {
  readonly id: string;
  readonly kind: "field";
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
  readonly tone: CalmVectorTone;
  readonly opacity: number;
}

export interface BiologyMotifRod {
  readonly id: string;
  readonly kind: "rod";
  readonly x: number;
  readonly y: number;
  readonly length: number;
  readonly thickness: number;
  readonly rotationDeg: number;
  readonly tone: CalmVectorTone;
  readonly opacity?: number;
}

export interface BiologyMotifBranch {
  readonly id: string;
  readonly kind: "branch";
  readonly points: readonly (readonly [number, number])[];
  readonly tone: CalmVectorTone;
  readonly width: number;
  readonly opacity?: number;
}

export type BiologyMotifPrimitive =
  | BiologyMotifField
  | BiologyMotifRod
  | BiologyMotifBranch;

export interface BiologyMotifPlan {
  readonly variant: BiologyMotifVariant;
  readonly primitives: readonly BiologyMotifPrimitive[];
}

/**
 * Deterministic, presentation-only biological geometry for calm educational
 * surfaces. It is deliberately simple enough to render with SVG/Canvas/Pixi
 * primitives and must never be sampled as simulation state.
 */
export function biologyMotifPlan(
  variant: BiologyMotifVariant,
): BiologyMotifPlan {
  return {
    variant,
    primitives: MOTIFS[variant],
  };
}

const MOTIFS: Readonly<Record<BiologyMotifVariant, readonly BiologyMotifPrimitive[]>> = {
  dish: [
    { id: "dish-field", kind: "field", cx: 80, cy: 60, rx: 57, ry: 42, tone: "teal", opacity: 0.13 },
    { id: "dish-resource", kind: "field", cx: 61, cy: 55, rx: 26, ry: 18, tone: "amber", opacity: 0.11 },
    { id: "dish-r1", kind: "rod", x: 56, y: 50, length: 25, thickness: 8, rotationDeg: -18, tone: "mint" },
    { id: "dish-r2", kind: "rod", x: 82, y: 68, length: 22, thickness: 7, rotationDeg: 22, tone: "teal" },
    { id: "dish-r3", kind: "rod", x: 97, y: 43, length: 19, thickness: 7, rotationDeg: 8, tone: "olive" },
  ],
  population: [
    { id: "population-field", kind: "field", cx: 80, cy: 62, rx: 52, ry: 35, tone: "mint", opacity: 0.1 },
    { id: "population-r1", kind: "rod", x: 44, y: 48, length: 24, thickness: 8, rotationDeg: -24, tone: "teal" },
    { id: "population-r2", kind: "rod", x: 66, y: 42, length: 27, thickness: 8, rotationDeg: 15, tone: "mint" },
    { id: "population-r3", kind: "rod", x: 91, y: 50, length: 23, thickness: 8, rotationDeg: -8, tone: "teal" },
    { id: "population-r4", kind: "rod", x: 53, y: 71, length: 21, thickness: 7, rotationDeg: 12, tone: "olive" },
    { id: "population-r5", kind: "rod", x: 78, y: 72, length: 26, thickness: 8, rotationDeg: -17, tone: "mint" },
    { id: "population-r6", kind: "rod", x: 105, y: 69, length: 20, thickness: 7, rotationDeg: 28, tone: "teal" },
  ],
  pressure: [
    { id: "pressure-field", kind: "field", cx: 104, cy: 60, rx: 44, ry: 40, tone: "coral", opacity: 0.18 },
    { id: "pressure-safe", kind: "field", cx: 49, cy: 61, rx: 25, ry: 30, tone: "teal", opacity: 0.1 },
    { id: "pressure-r1", kind: "rod", x: 43, y: 50, length: 24, thickness: 8, rotationDeg: -12, tone: "mint" },
    { id: "pressure-r2", kind: "rod", x: 58, y: 72, length: 20, thickness: 7, rotationDeg: 18, tone: "teal" },
    { id: "pressure-r3", kind: "rod", x: 95, y: 48, length: 23, thickness: 7, rotationDeg: 13, tone: "coral", opacity: 0.58 },
    { id: "pressure-r4", kind: "rod", x: 109, y: 72, length: 19, thickness: 7, rotationDeg: -21, tone: "coral", opacity: 0.38 },
  ],
  lineage: [
    { id: "lineage-field", kind: "field", cx: 80, cy: 62, rx: 50, ry: 34, tone: "amber", opacity: 0.08 },
    { id: "lineage-trunk", kind: "branch", points: [[80, 84], [80, 62], [65, 48]], tone: "cream", width: 3, opacity: 0.7 },
    { id: "lineage-left", kind: "branch", points: [[65, 48], [49, 36], [36, 30]], tone: "teal", width: 3 },
    { id: "lineage-right", kind: "branch", points: [[80, 62], [97, 49], [118, 38]], tone: "coral", width: 3 },
    { id: "lineage-r1", kind: "rod", x: 27, y: 25, length: 21, thickness: 7, rotationDeg: -18, tone: "teal" },
    { id: "lineage-r2", kind: "rod", x: 109, y: 33, length: 23, thickness: 7, rotationDeg: 19, tone: "coral" },
    { id: "lineage-r3", kind: "rod", x: 70, y: 79, length: 20, thickness: 7, rotationDeg: 4, tone: "amber" },
  ],
  controls: [
    { id: "controls-field", kind: "field", cx: 80, cy: 60, rx: 55, ry: 39, tone: "olive", opacity: 0.09 },
    { id: "controls-r1", kind: "rod", x: 45, y: 55, length: 23, thickness: 8, rotationDeg: -16, tone: "teal" },
    { id: "controls-r2", kind: "rod", x: 72, y: 70, length: 24, thickness: 8, rotationDeg: 17, tone: "mint" },
    { id: "controls-r3", kind: "rod", x: 96, y: 45, length: 20, thickness: 7, rotationDeg: 11, tone: "amber" },
    { id: "controls-r4", kind: "rod", x: 107, y: 71, length: 22, thickness: 7, rotationDeg: -24, tone: "coral" },
  ],
} as const;
