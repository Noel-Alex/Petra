import {
  validateAntimicrobialEffect,
  type AntimicrobialEffect,
} from "./effect";

export const GREULICH_CHLORAMPHENICOL_MODEL_ID =
  "greulich-ribosome-cubic-v1" as const;

export interface GreulichChloramphenicolFit {
  readonly id: string;
  /** Fitted reversibility scale lambda_0* in h^-1. */
  readonly lambda0StarPerHour: number;
  /** Fitted concentration scale IC50* in micromolar. */
  readonly ic50StarMicromolar: number;
  /**
   * Source-backed drug-free growth-rate applicability envelope for this carbon
   * source family. Values outside the envelope are rejected rather than
   * silently extrapolated.
   */
  readonly validatedDrugFreeGrowthRateRangePerHour: {
    readonly minimum: number;
    readonly maximum: number;
  };
}

export interface GreulichChloramphenicolResponse {
  readonly modelId: typeof GREULICH_CHLORAMPHENICOL_MODEL_ID;
  readonly fitId: string;
  readonly concentrationMicromolar: number;
  readonly drugFreeGrowthRatePerHour: number;
  readonly growthRatio: number;
  readonly effect: AntimicrobialEffect;
}

const ROOT_ITERATIONS = 80;
const RESIDUAL_RELATIVE_TOLERANCE = 1e-12;

function assertFinite(name: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be finite`);
  }
}

export function validateGreulichChloramphenicolFit(
  fit: GreulichChloramphenicolFit,
): void {
  if (!fit.id || fit.id.trim() !== fit.id) {
    throw new Error("chloramphenicol fit id must be non-empty canonical text");
  }

  assertFinite("lambda0StarPerHour", fit.lambda0StarPerHour);
  assertFinite("ic50StarMicromolar", fit.ic50StarMicromolar);
  if (fit.lambda0StarPerHour <= 0) {
    throw new RangeError("lambda0StarPerHour must be > 0");
  }
  if (fit.ic50StarMicromolar <= 0) {
    throw new RangeError("ic50StarMicromolar must be > 0");
  }

  const { minimum, maximum } =
    fit.validatedDrugFreeGrowthRateRangePerHour;
  assertFinite("validated drug-free growth-rate minimum", minimum);
  assertFinite("validated drug-free growth-rate maximum", maximum);
  if (minimum <= 0 || maximum < minimum) {
    throw new RangeError(
      "validated drug-free growth-rate range must satisfy 0 < minimum <= maximum",
    );
  }
}

function validateInputs(
  concentrationMicromolar: number,
  drugFreeGrowthRatePerHour: number,
  fit: GreulichChloramphenicolFit,
): void {
  validateGreulichChloramphenicolFit(fit);

  assertFinite("concentrationMicromolar", concentrationMicromolar);
  if (concentrationMicromolar < 0) {
    throw new RangeError("concentrationMicromolar must be >= 0");
  }

  assertFinite("drugFreeGrowthRatePerHour", drugFreeGrowthRatePerHour);
  const { minimum, maximum } =
    fit.validatedDrugFreeGrowthRateRangePerHour;
  if (
    drugFreeGrowthRatePerHour < minimum ||
    drugFreeGrowthRatePerHour > maximum
  ) {
    throw new RangeError(
      `drugFreeGrowthRatePerHour must be within the source-backed range [${minimum}, ${maximum}] h^-1 for fit ${fit.id}`,
    );
  }
}

interface CubicCoefficients {
  readonly linear: number;
  readonly constant: number;
}

/**
 * Greulich et al. (2015), equation 7, expressed in x = lambda / lambda_0:
 *
 * x^3 - x^2
 * + x * [ 1/4 (lambda0Star / lambda0)^2
 *       + a_ex/(2 IC50Star) (lambda0Star / lambda0) ]
 * - 1/4 (lambda0Star / lambda0)^2 = 0.
 */
function cubicCoefficients(
  concentrationMicromolar: number,
  drugFreeGrowthRatePerHour: number,
  fit: GreulichChloramphenicolFit,
): CubicCoefficients {
  const reversibilityRatio =
    fit.lambda0StarPerHour / drugFreeGrowthRatePerHour;
  const quarterRatioSquared =
    0.25 * reversibilityRatio * reversibilityRatio;
  const concentrationTerm =
    (concentrationMicromolar / (2 * fit.ic50StarMicromolar)) *
    reversibilityRatio;
  const linear = quarterRatioSquared + concentrationTerm;
  const constant = -quarterRatioSquared;

  if (!Number.isFinite(linear) || !Number.isFinite(constant)) {
    throw new RangeError(
      "chloramphenicol equation coefficients must remain finite",
    );
  }
  return { linear, constant };
}

export function greulichChloramphenicolCubicResidual(
  growthRatio: number,
  concentrationMicromolar: number,
  drugFreeGrowthRatePerHour: number,
  fit: GreulichChloramphenicolFit,
): number {
  validateInputs(
    concentrationMicromolar,
    drugFreeGrowthRatePerHour,
    fit,
  );
  assertFinite("growthRatio", growthRatio);

  const { linear, constant } = cubicCoefficients(
    concentrationMicromolar,
    drugFreeGrowthRatePerHour,
    fit,
  );
  return (
    growthRatio * growthRatio * growthRatio -
    growthRatio * growthRatio +
    linear * growthRatio +
    constant
  );
}

/**
 * Cubic discriminant for x^3 - x^2 + linear*x + constant.
 *
 * A positive discriminant means three distinct real roots and zero means a
 * repeated real root. This v1 authority is deliberately limited to the
 * single-real-root reversible chloramphenicol regime; ambiguous branches fail
 * closed rather than selecting a root by numerical accident.
 */
function cubicDiscriminant(linear: number, constant: number): number {
  const a = 1;
  const b = -1;
  const c = linear;
  const d = constant;
  return (
    18 * a * b * c * d -
    4 * b * b * b * d +
    b * b * c * c -
    4 * a * c * c * c -
    27 * a * a * d * d
  );
}

function solvePhysicalGrowthRatio(
  concentrationMicromolar: number,
  drugFreeGrowthRatePerHour: number,
  fit: GreulichChloramphenicolFit,
): number {
  validateInputs(
    concentrationMicromolar,
    drugFreeGrowthRatePerHour,
    fit,
  );

  if (concentrationMicromolar === 0) {
    return 1;
  }

  const coefficients = cubicCoefficients(
    concentrationMicromolar,
    drugFreeGrowthRatePerHour,
    fit,
  );
  const discriminant = cubicDiscriminant(
    coefficients.linear,
    coefficients.constant,
  );
  if (!Number.isFinite(discriminant) || discriminant >= 0) {
    throw new Error(
      "chloramphenicol response left the single physical-root regime",
    );
  }

  let lower = 0;
  let upper = 1;
  let lowerResidual = coefficients.constant;
  let upperResidual = coefficients.linear + coefficients.constant;

  if (!(lowerResidual < 0)) {
    throw new Error("chloramphenicol physical branch is not bracketed at x=0");
  }
  if (upperResidual === 0) {
    // Tiny positive concentrations may round to the exact drug-free endpoint.
    return 1;
  }
  if (!(upperResidual > 0)) {
    throw new Error("chloramphenicol physical branch is not bracketed at x=1");
  }

  for (let iteration = 0; iteration < ROOT_ITERATIONS; iteration += 1) {
    const midpoint = (lower + upper) / 2;
    const midpointResidual =
      midpoint * midpoint * midpoint -
      midpoint * midpoint +
      coefficients.linear * midpoint +
      coefficients.constant;

    if (!Number.isFinite(midpointResidual)) {
      throw new Error("chloramphenicol root solver produced a non-finite residual");
    }
    if (midpointResidual > 0) {
      upper = midpoint;
      upperResidual = midpointResidual;
    } else {
      lower = midpoint;
      lowerResidual = midpointResidual;
    }
  }

  const growthRatio = (lower + upper) / 2;
  if (!Number.isFinite(growthRatio) || growthRatio < 0 || growthRatio > 1) {
    throw new Error("chloramphenicol physical growth ratio is invalid");
  }

  const residual =
    growthRatio * growthRatio * growthRatio -
    growthRatio * growthRatio +
    coefficients.linear * growthRatio +
    coefficients.constant;
  const scale =
    1 +
    Math.abs(coefficients.linear * growthRatio) +
    Math.abs(coefficients.constant);
  if (
    !Number.isFinite(residual) ||
    Math.abs(residual) > RESIDUAL_RELATIVE_TOLERANCE * scale
  ) {
    throw new Error("chloramphenicol physical root failed residual validation");
  }

  // Keep both bracket values live through the loop so accidental solver changes
  // cannot silently remove the sign invariant under noUnusedLocals-free builds.
  if (!(lowerResidual <= 0) || !(upperResidual >= 0)) {
    throw new Error("chloramphenicol root bracket lost its sign invariant");
  }

  return growthRatio;
}

/**
 * Evaluate the source-backed MG1655 chloramphenicol growth-inhibition response.
 *
 * Biological fit selection remains scenario/data authority. This module accepts
 * an explicit fit and never guesses a carbon source from the drug name, UI
 * state, or Petra's current dimensionless model-resource field.
 */
export function greulichChloramphenicolResponse(
  concentrationMicromolar: number,
  drugFreeGrowthRatePerHour: number,
  fit: GreulichChloramphenicolFit,
): GreulichChloramphenicolResponse {
  const growthRatio = solvePhysicalGrowthRatio(
    concentrationMicromolar,
    drugFreeGrowthRatePerHour,
    fit,
  );
  const effect: AntimicrobialEffect = {
    divisionMultiplier: growthRatio,
    incrementalLossHazardPerHour: 0,
  };
  validateAntimicrobialEffect(effect);

  return {
    modelId: GREULICH_CHLORAMPHENICOL_MODEL_ID,
    fitId: fit.id,
    concentrationMicromolar,
    drugFreeGrowthRatePerHour,
    growthRatio,
    effect,
  };
}
