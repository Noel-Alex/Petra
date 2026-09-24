export type UncertaintyScope =
  | "measurement"
  | "transfer"
  | "model"
  | "calibration";

interface UncertaintyBase {
  readonly scope: UncertaintyScope;
  readonly quantityLabel: string;
  /** Caller-supplied context such as replicate count; never inferred here. */
  readonly supportingText?: string;
}

interface OptionalUnit {
  readonly unit?: string;
}

export interface StandardDeviationUncertainty extends UncertaintyBase, OptionalUnit {
  readonly kind: "standard-deviation";
  readonly value: number;
}

export interface StandardErrorUncertainty extends UncertaintyBase, OptionalUnit {
  readonly kind: "standard-error";
  readonly value: number;
}

export interface ConfidenceIntervalUncertainty extends UncertaintyBase, OptionalUnit {
  readonly kind: "confidence-interval";
  readonly confidenceLevelPercent: number;
  readonly lower: number;
  readonly upper: number;
}

export interface RangeUncertainty extends UncertaintyBase, OptionalUnit {
  readonly kind: "range";
  readonly lower: number;
  readonly upper: number;
}

/**
 * A source-reported symmetric measurement margin whose unit/scale must be kept
 * literally as supplied (for example, an ordinal assay step). It is not a
 * confidence interval or numeric range unless the source says so.
 */
export interface ReportedMarginUncertainty extends UncertaintyBase {
  readonly kind: "reported-margin";
  readonly plusMinus: number;
  readonly unit: string;
}

export interface NotQuantifiedUncertainty extends UncertaintyBase {
  readonly kind: "not-quantified";
}

export type SourceUncertaintyInput =
  | StandardDeviationUncertainty
  | StandardErrorUncertainty
  | ConfidenceIntervalUncertainty
  | RangeUncertainty
  | ReportedMarginUncertainty
  | NotQuantifiedUncertainty;

export interface SourceUncertaintyPresentation {
  readonly scope: UncertaintyScope;
  readonly kind: SourceUncertaintyInput["kind"];
  readonly label: string;
  readonly value: string;
  readonly ariaText: string;
}

const SCOPE_LABELS: Readonly<Record<UncertaintyScope, string>> = {
  measurement: "Measurement",
  transfer: "Transfer",
  model: "Model",
  calibration: "Calibration",
};

export function resolveSourceUncertaintyPresentation(
  input: SourceUncertaintyInput,
): SourceUncertaintyPresentation {
  const scopeLabel = SCOPE_LABELS[input.scope];
  if (scopeLabel === undefined) {
    throw new TypeError("uncertainty scope is unsupported");
  }

  const quantityLabel = nonEmpty("uncertainty quantityLabel", input.quantityLabel);
  const supportingText =
    input.supportingText === undefined
      ? null
      : nonEmpty("uncertainty supportingText", input.supportingText);

  let value: string;
  switch (input.kind) {
    case "standard-deviation":
      value = statistic("SD", nonNegativeFinite("uncertainty SD", input.value), input.unit);
      break;
    case "standard-error":
      value = statistic("SE", nonNegativeFinite("uncertainty SE", input.value), input.unit);
      break;
    case "confidence-interval": {
      const confidence = finite("uncertainty confidence level", input.confidenceLevelPercent);
      if (confidence <= 0 || confidence >= 100) {
        throw new RangeError(
          "uncertainty confidence level must be greater than 0 and less than 100",
        );
      }
      const lower = finite("uncertainty confidence interval lower", input.lower);
      const upper = finite("uncertainty confidence interval upper", input.upper);
      assertOrdered(lower, upper, "confidence interval");
      value =
        formatNumber(confidence) +
        "% CI " +
        bounded(lower, upper, input.unit);
      break;
    }
    case "range": {
      const lower = finite("uncertainty range lower", input.lower);
      const upper = finite("uncertainty range upper", input.upper);
      assertOrdered(lower, upper, "range");
      value = "Range " + bounded(lower, upper, input.unit);
      break;
    }
    case "reported-margin": {
      const plusMinus = nonNegativeFinite(
        "uncertainty reported margin",
        input.plusMinus,
      );
      const unit = nonEmpty("uncertainty unit", input.unit);
      value = "Reported margin ±" + formatNumber(plusMinus) + " " + unit;
      break;
    }
    case "not-quantified":
      value = "Not quantified in selected source.";
      break;
    default:
      return assertNever(input);
  }

  if (supportingText !== null) {
    value += " · " + supportingText;
  }

  const label = scopeLabel + " uncertainty · " + quantityLabel;
  return {
    scope: input.scope,
    kind: input.kind,
    label,
    value,
    ariaText: label + ": " + value,
  };
}

function statistic(label: "SD" | "SE", value: number, unit: string | undefined): string {
  return label + " " + formatNumber(value) + unitSuffix(unit);
}

function bounded(lower: number, upper: number, unit: string | undefined): string {
  return formatNumber(lower) + "–" + formatNumber(upper) + unitSuffix(unit);
}

function unitSuffix(unit: string | undefined): string {
  return unit === undefined ? "" : " " + nonEmpty("uncertainty unit", unit);
}

function finite(name: string, value: number): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(name + " must be finite");
  }
  return Object.is(value, -0) ? 0 : value;
}

function nonNegativeFinite(name: string, value: number): number {
  const normalized = finite(name, value);
  if (normalized < 0) {
    throw new RangeError(name + " must be non-negative");
  }
  return normalized;
}

function assertOrdered(lower: number, upper: number, label: string): void {
  if (lower > upper) {
    throw new RangeError(
      "uncertainty " + label + " lower bound cannot exceed upper bound",
    );
  }
}

function nonEmpty(name: string, value: string): string {
  if (value.trim().length === 0 || value.trim() !== value) {
    throw new TypeError(name + " must be a trimmed non-empty string");
  }
  return value;
}

function formatNumber(value: number): string {
  return (Object.is(value, -0) ? 0 : value).toString();
}

function assertNever(value: never): never {
  throw new TypeError("unsupported uncertainty kind: " + String(value));
}
