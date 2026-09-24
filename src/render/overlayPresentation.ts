import {
  isOverlayKind,
  type OverlayKind,
} from "./model";

export const OVERLAY_PATTERN_TOKENS = [
  "dot-grid",
  "diagonal-forward",
  "diagonal-back",
  "signed-diagonal",
  "neutral-grid",
  "ring-grid",
  "crosshatch",
  "horizontal-bars",
  "diamond-grid",
  "speckle",
] as const;

export type OverlayPatternToken =
  (typeof OVERLAY_PATTERN_TOKENS)[number];

export interface OverlayPresentationSpec {
  readonly kind: OverlayKind;
  readonly transfer: "sequential" | "diverging";
  readonly legendPatternToken: OverlayPatternToken;
  readonly negativePatternToken: OverlayPatternToken;
  readonly neutralPatternToken: OverlayPatternToken;
  readonly positivePatternToken: OverlayPatternToken;
  readonly negativeColor: number;
  readonly neutralColor: number;
  readonly positiveColor: number;
  readonly negativeCssColor: string;
  readonly neutralCssColor: string;
  readonly positiveCssColor: string;
  readonly alphaFloor: number;
  readonly alphaCeiling: number;
  readonly visibilityThreshold: number;
  readonly legendSemantics: string;
}

export interface ProjectedOverlayScalar {
  readonly visible: boolean;
  readonly normalized: number;
  readonly color: number;
  readonly alpha: number;
  readonly patternToken: OverlayPatternToken;
}

const REGISTRY = {
  nutrient: sequential(
    "nutrient",
    0xf0bd4e,
    "#f0bd4e",
    "dot-grid",
    0.04,
    0.2,
    0.025,
    "Low → high nutrient field",
  ),
  antibiotic: sequential(
    "antibiotic",
    0x8b6cf6,
    "#8b6cf6",
    "diagonal-forward",
    0.04,
    0.2,
    0.025,
    "Low → high antibiotic field",
  ),
  "net-growth": {
    kind: "net-growth",
    transfer: "diverging",
    legendPatternToken: "signed-diagonal",
    negativePatternToken: "diagonal-back",
    neutralPatternToken: "neutral-grid",
    positivePatternToken: "diagonal-forward",
    negativeColor: 0x5d8cff,
    neutralColor: 0x8391a6,
    positiveColor: 0x63d19e,
    negativeCssColor: "#5d8cff",
    neutralCssColor: "#8391a6",
    positiveCssColor: "#63d19e",
    alphaFloor: 0.07,
    alphaCeiling: 0.22,
    visibilityThreshold: 0,
    legendSemantics: "Negative loss · zero neutral · positive growth",
  },
  lineage: sequential(
    "lineage",
    0x58c6d8,
    "#58c6d8",
    "ring-grid",
    0.04,
    0.18,
    0.02,
    "Low → high source-provided lineage field",
  ),
  phage: sequential(
    "phage",
    0xff7a90,
    "#ff7a90",
    "crosshatch",
    0.05,
    0.21,
    0.02,
    "Low → high source-provided phage field",
  ),
  biomass: sequential(
    "biomass",
    0x66d18f,
    "#66d18f",
    "horizontal-bars",
    0.04,
    0.2,
    0.02,
    "Low → high biomass field",
  ),
  event: sequential(
    "event",
    0xf29f67,
    "#f29f67",
    "diamond-grid",
    0.06,
    0.23,
    0.01,
    "Low → high source-provided event field",
  ),
  uncertainty: sequential(
    "uncertainty",
    0xa5b1c4,
    "#a5b1c4",
    "speckle",
    0.04,
    0.18,
    0.01,
    "Low → high source-defined uncertainty",
  ),
} as const satisfies Record<OverlayKind, OverlayPresentationSpec>;

export function resolveOverlayPresentation(
  kind: unknown,
): OverlayPresentationSpec {
  if (!isOverlayKind(kind)) {
    throw new RangeError(`unsupported overlay kind: ${String(kind)}`);
  }
  return REGISTRY[kind];
}

export function projectOverlayScalar(
  presentation: OverlayPresentationSpec,
  value: number,
  minimum: number,
  maximum: number,
): ProjectedOverlayScalar {
  assertFinite("overlay value", value);
  assertFinite("overlay minimum", minimum);
  assertFinite("overlay maximum", maximum);
  if (maximum < minimum) {
    throw new RangeError("overlay maximum must be >= minimum");
  }

  if (presentation.transfer === "diverging") {
    const extent = Math.max(Math.abs(minimum), Math.abs(maximum));
    const normalized =
      extent === 0 ? 0 : clamp(value / extent, -1, 1);
    const magnitude = Math.abs(normalized);
    const alpha = lerp(
      presentation.alphaFloor,
      presentation.alphaCeiling,
      magnitude,
    );

    if (normalized < 0) {
      return {
        visible: true,
        normalized,
        color: presentation.negativeColor,
        alpha,
        patternToken: presentation.negativePatternToken,
      };
    }
    if (normalized > 0) {
      return {
        visible: true,
        normalized,
        color: presentation.positiveColor,
        alpha,
        patternToken: presentation.positivePatternToken,
      };
    }
    return {
      visible: true,
      normalized: 0,
      color: presentation.neutralColor,
      alpha: presentation.alphaFloor,
      patternToken: presentation.neutralPatternToken,
    };
  }

  const range = maximum - minimum;
  const normalized =
    range === 0
      ? value === 0
        ? 0
        : 1
      : clamp((value - minimum) / range, 0, 1);
  const visible = normalized >= presentation.visibilityThreshold &&
    (normalized > 0 || presentation.visibilityThreshold === 0);

  return {
    visible,
    normalized,
    color: presentation.positiveColor,
    alpha: lerp(
      presentation.alphaFloor,
      presentation.alphaCeiling,
      normalized,
    ),
    patternToken: presentation.positivePatternToken,
  };
}

/**
 * Cheap deterministic non-color texture cue for grid-cell fills.
 * It modulates alpha only; it never changes source values.
 */
export function overlayPatternMultiplier(
  token: OverlayPatternToken,
  row: number,
  column: number,
): number {
  if (!Number.isInteger(row) || row < 0 || !Number.isInteger(column) || column < 0) {
    throw new RangeError("overlay pattern coordinates must be non-negative integers");
  }

  switch (token) {
    case "dot-grid":
      return row % 3 === 0 && column % 3 === 0 ? 1 : 0.58;
    case "diagonal-forward":
      return (row + column) % 4 === 0 ? 1 : 0.62;
    case "diagonal-back":
      return positiveModulo(row - column, 4) === 0 ? 1 : 0.62;
    case "signed-diagonal":
      return (
        (row + column) % 4 === 0 ||
        positiveModulo(row - column, 4) === 0
      ) ? 1 : 0.58;
    case "neutral-grid":
      return row % 3 === 0 || column % 3 === 0 ? 1 : 0.64;
    case "ring-grid":
      return positiveModulo(row * 2 + column, 5) <= 1 ? 1 : 0.62;
    case "crosshatch":
      return (
        (row + column) % 4 === 0 ||
        positiveModulo(row - column, 4) === 0
      ) ? 1 : 0.56;
    case "horizontal-bars":
      return row % 3 === 0 ? 1 : 0.6;
    case "diamond-grid":
      return (
        (row + column) % 5 === 0 ||
        positiveModulo(row - column, 5) === 0
      ) ? 1 : 0.6;
    case "speckle":
      return deterministicSpeckle(row, column) > 0.58 ? 1 : 0.62;
  }
}

function sequential(
  kind: OverlayKind,
  color: number,
  cssColor: string,
  pattern: OverlayPatternToken,
  alphaFloor: number,
  alphaCeiling: number,
  visibilityThreshold: number,
  legendSemantics: string,
): OverlayPresentationSpec {
  return {
    kind,
    transfer: "sequential",
    legendPatternToken: pattern,
    negativePatternToken: pattern,
    neutralPatternToken: pattern,
    positivePatternToken: pattern,
    negativeColor: color,
    neutralColor: color,
    positiveColor: color,
    negativeCssColor: cssColor,
    neutralCssColor: cssColor,
    positiveCssColor: cssColor,
    alphaFloor,
    alphaCeiling,
    visibilityThreshold,
    legendSemantics,
  };
}

function deterministicSpeckle(row: number, column: number): number {
  let value = Math.imul(row + 1, 0x45d9f3b) ^
    Math.imul(column + 1, 0x119de1f3);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value ^= value >>> 16;
  return (value >>> 0) / 0xffffffff;
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function assertFinite(name: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be finite`);
  }
}
