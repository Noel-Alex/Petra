import type { OverlayKind } from "./model";

export type OverlayTransferKind = "sequential" | "diverging-zero";
export type OverlayPatternToken =
  | "solid"
  | "dot-grid"
  | "diagonal-forward"
  | "diagonal-back"
  | "crosshatch"
  | "dash-grid";

export type OverlayPolarity = "negative" | "neutral" | "positive";

export interface OverlayPresentationSpec {
  readonly kind: OverlayKind;
  readonly transfer: OverlayTransferKind;
  readonly legendScale: string;
  readonly pattern: OverlayPatternToken;
  readonly color: number;
  readonly negativeColor?: number;
  readonly neutralColor?: number;
  readonly positiveColor?: number;
  readonly negativePattern?: OverlayPatternToken;
  readonly neutralPattern?: OverlayPatternToken;
  readonly positivePattern?: OverlayPatternToken;
  readonly alphaMinimum: number;
  readonly alphaMaximum: number;
  readonly visibilityThreshold: number;
}

export interface OverlayValuePresentation {
  readonly visible: boolean;
  readonly normalizedMagnitude: number;
  readonly color: number;
  readonly alpha: number;
  readonly pattern: OverlayPatternToken;
  readonly polarity: OverlayPolarity;
}

const SPECS: Readonly<Record<OverlayKind, OverlayPresentationSpec>> =
  Object.freeze({
    nutrient: Object.freeze({
      kind: "nutrient",
      transfer: "sequential",
      legendScale: "low → high nutrient",
      pattern: "dot-grid",
      color: 0xf0bd4e,
      alphaMinimum: 0.035,
      alphaMaximum: 0.2,
      visibilityThreshold: 0.025,
    }),
    antibiotic: Object.freeze({
      kind: "antibiotic",
      transfer: "sequential",
      legendScale: "low → high antibiotic",
      pattern: "diagonal-forward",
      color: 0x8b6cf6,
      alphaMinimum: 0.035,
      alphaMaximum: 0.2,
      visibilityThreshold: 0.025,
    }),
    "net-growth": Object.freeze({
      kind: "net-growth",
      transfer: "diverging-zero",
      legendScale: "negative ◀ 0 ▶ positive net growth",
      pattern: "crosshatch",
      color: 0x8ea0b8,
      negativeColor: 0xf079b7,
      neutralColor: 0x8ea0b8,
      positiveColor: 0x75e3ae,
      negativePattern: "diagonal-back",
      neutralPattern: "dot-grid",
      positivePattern: "diagonal-forward",
      alphaMinimum: 0.04,
      alphaMaximum: 0.22,
      visibilityThreshold: 0,
    }),
    lineage: Object.freeze({
      kind: "lineage",
      transfer: "sequential",
      legendScale: "low → high source-defined lineage field",
      pattern: "dash-grid",
      color: 0x55d7ef,
      alphaMinimum: 0.03,
      alphaMaximum: 0.18,
      visibilityThreshold: 0.025,
    }),
    phage: Object.freeze({
      kind: "phage",
      transfer: "sequential",
      legendScale: "low → high phage field",
      pattern: "crosshatch",
      color: 0x5be0c0,
      alphaMinimum: 0.03,
      alphaMaximum: 0.2,
      visibilityThreshold: 0.025,
    }),
    biomass: Object.freeze({
      kind: "biomass",
      transfer: "sequential",
      legendScale: "low → high biomass",
      pattern: "solid",
      color: 0x6fb7ff,
      alphaMinimum: 0.025,
      alphaMaximum: 0.18,
      visibilityThreshold: 0.025,
    }),
    event: Object.freeze({
      kind: "event",
      transfer: "sequential",
      legendScale: "low → high source-defined event field",
      pattern: "dash-grid",
      color: 0xffa85c,
      alphaMinimum: 0.04,
      alphaMaximum: 0.22,
      visibilityThreshold: 0.025,
    }),
    uncertainty: Object.freeze({
      kind: "uncertainty",
      transfer: "sequential",
      legendScale: "low → high source-defined uncertainty",
      pattern: "crosshatch",
      color: 0xe3b55e,
      alphaMinimum: 0.025,
      alphaMaximum: 0.17,
      visibilityThreshold: 0.025,
    }),
  });

export function resolveOverlayPresentation(
  kind: OverlayKind,
): OverlayPresentationSpec {
  const spec = SPECS[kind];
  if (spec === undefined) {
    throw new RangeError(`unsupported overlay kind: ${String(kind)}`);
  }
  return spec;
}

export function projectOverlayValue(
  kind: OverlayKind,
  value: number,
  minimum: number,
  maximum: number,
): OverlayValuePresentation {
  assertFinite("overlay value", value);
  assertFinite("overlay minimum", minimum);
  assertFinite("overlay maximum", maximum);
  if (maximum < minimum) {
    throw new RangeError("overlay maximum must be >= minimum");
  }
  const spec = resolveOverlayPresentation(kind);
  if (spec.transfer === "diverging-zero") {
    return projectDiverging(spec, value, minimum, maximum);
  }
  return projectSequential(spec, value, minimum, maximum);
}

export function overlayPatternAlpha(
  pattern: OverlayPatternToken,
  column: number,
  row: number,
): number {
  if (
    !Number.isInteger(column) ||
    column < 0 ||
    !Number.isInteger(row) ||
    row < 0
  ) {
    throw new RangeError(
      "overlay pattern coordinates must be non-negative integers",
    );
  }

  switch (pattern) {
    case "solid":
      return 1;
    case "dot-grid":
      return (column + row) % 2 === 0 ? 1 : 0.58;
    case "diagonal-forward":
      return (column + row) % 3 === 0 ? 1 : 0.62;
    case "diagonal-back":
      return positiveModulo(column - row, 3) === 0 ? 1 : 0.62;
    case "crosshatch":
      return (column + row) % 3 === 0 ||
        positiveModulo(column - row, 3) === 0
        ? 1
        : 0.52;
    case "dash-grid":
      return column % 3 === 0 || row % 3 === 0 ? 1 : 0.58;
  }
}

function projectSequential(
  spec: OverlayPresentationSpec,
  value: number,
  minimum: number,
  maximum: number,
): OverlayValuePresentation {
  const normalized = sequentialMagnitude(value, minimum, maximum);
  return {
    visible:
      normalized >= spec.visibilityThreshold &&
      (normalized > 0 || minimum === maximum),
    normalizedMagnitude: normalized,
    color: spec.color,
    alpha: interpolate(spec.alphaMinimum, spec.alphaMaximum, normalized),
    pattern: spec.pattern,
    polarity: value === 0 ? "neutral" : value < 0 ? "negative" : "positive",
  };
}

function projectDiverging(
  spec: OverlayPresentationSpec,
  value: number,
  minimum: number,
  maximum: number,
): OverlayValuePresentation {
  const extent = Math.max(Math.abs(minimum), Math.abs(maximum));
  const magnitude =
    extent === 0 ? 0 : Math.min(1, Math.abs(value) / extent);
  const polarity: OverlayPolarity =
    value < 0 ? "negative" : value > 0 ? "positive" : "neutral";
  const color =
    polarity === "negative"
      ? spec.negativeColor ?? spec.color
      : polarity === "positive"
        ? spec.positiveColor ?? spec.color
        : spec.neutralColor ?? spec.color;
  const pattern =
    polarity === "negative"
      ? spec.negativePattern ?? spec.pattern
      : polarity === "positive"
        ? spec.positivePattern ?? spec.pattern
        : spec.neutralPattern ?? spec.pattern;

  return {
    visible: magnitude >= spec.visibilityThreshold,
    normalizedMagnitude: magnitude,
    color,
    alpha: interpolate(spec.alphaMinimum, spec.alphaMaximum, magnitude),
    pattern,
    polarity,
  };
}

function sequentialMagnitude(
  value: number,
  minimum: number,
  maximum: number,
): number {
  if (maximum === minimum) return value === 0 ? 0 : 1;
  return Math.min(1, Math.max(0, (value - minimum) / (maximum - minimum)));
}

function interpolate(minimum: number, maximum: number, unit: number): number {
  return minimum + (maximum - minimum) * unit;
}

function assertFinite(name: string, value: number): void {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite`);
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}
