import rawAuthority from "../../../data/pharmacodynamics/chloramphenicol_mg1655_greulich_v1.json";
import {
  validateAntimicrobialEffect,
  type AntimicrobialEffect,
} from "./antimicrobial";

export const CHLORAMPHENICOL_RESPONSE_AUTHORITY_KIND =
  "petra-antimicrobial-response-authority" as const;
export const CHLORAMPHENICOL_RESPONSE_SCHEMA_VERSION = 1 as const;
export const CHLORAMPHENICOL_RESPONSE_MODEL_ID =
  "greulich-ribosome-cubic-v1" as const;
export const CHLORAMPHENICOL_CONCENTRATION_UNIT = "uM" as const;

export interface ChloramphenicolEnvironmentFamily {
  readonly id: string;
  readonly medium: string;
  readonly carbonSource: string;
  readonly carbonSourceConcentration: string;
  readonly temperatureC: number;
  readonly lambda0StarPerHour: number;
  readonly lambda0StarReportedPlusMinusPerHour: number;
  readonly ic50StarMicromolar: number;
  readonly ic50StarReportedPlusMinusMicromolar: number;
}

export interface ChloramphenicolResponseAuthority {
  readonly kind: typeof CHLORAMPHENICOL_RESPONSE_AUTHORITY_KIND;
  readonly schemaVersion: typeof CHLORAMPHENICOL_RESPONSE_SCHEMA_VERSION;
  readonly id: string;
  readonly version: string;
  readonly drug: Readonly<{
    id: "chloramphenicol";
    concentrationUnit: typeof CHLORAMPHENICOL_CONCENTRATION_UNIT;
  }>;
  readonly organism: Readonly<{
    scientificName: string;
    background: string;
  }>;
  readonly responseModel: Readonly<{
    kind: "growth-inhibition";
    id: typeof CHLORAMPHENICOL_RESPONSE_MODEL_ID;
    equation: "Greulich-2015-equation-7";
    sourceKey: "greulich_2015";
    doi: "10.15252/MSB.20145949";
  }>;
  readonly environmentFamilies: readonly ChloramphenicolEnvironmentFamily[];
  readonly effectSemantics: Readonly<{
    divisionMultiplier: string;
    incrementalLossHazardPerHour: 0;
  }>;
  readonly productGate: Readonly<{
    status: "context-gated";
    reason: string;
  }>;
  readonly limitations: readonly string[];
}

export interface ChloramphenicolEffectInput {
  readonly authority: ChloramphenicolResponseAuthority;
  readonly environmentFamilyId: string;
  readonly concentration: Readonly<{
    value: number;
    unit: string;
  }>;
  readonly drugFreeGrowthRatePerHour: number;
}

const ROOT_RESIDUAL_TOLERANCE = 1e-12;
const ROOT_INTERVAL_TOLERANCE = 1e-13;
const ROOT_DEDUPLICATION_TOLERANCE = 1e-10;
const MAX_BISECTION_ITERATIONS = 96;

function expectRecord(
  value: unknown,
  name: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function expectExactKeys(
  record: Record<string, unknown>,
  expected: readonly string[],
  name: string,
): void {
  const actual = Object.keys(record).sort();
  const canonicalExpected = [...expected].sort();
  if (
    actual.length !== canonicalExpected.length ||
    actual.some((key, index) => key !== canonicalExpected[index])
  ) {
    throw new TypeError(
      `${name} must contain exactly: ${canonicalExpected.join(", ")}`,
    );
  }
}

function expectString(value: unknown, name: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value
  ) {
    throw new TypeError(`${name} must be a non-empty canonical string`);
  }
  return value;
}

function expectLiteral<T extends string | number>(
  value: unknown,
  expected: T,
  name: string,
): T {
  if (value !== expected) {
    throw new TypeError(`${name} must equal ${String(expected)}`);
  }
  return expected;
}

function expectFinitePositive(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be positive and finite`);
  }
  return value;
}

function expectFiniteNonNegative(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be finite and non-negative`);
  }
  return value;
}

function parseEnvironmentFamily(
  value: unknown,
  index: number,
): ChloramphenicolEnvironmentFamily {
  const name = `environmentFamilies[${index}]`;
  const record = expectRecord(value, name);
  expectExactKeys(
    record,
    [
      "id",
      "medium",
      "carbonSource",
      "carbonSourceConcentration",
      "temperatureC",
      "lambda0StarPerHour",
      "lambda0StarReportedPlusMinusPerHour",
      "ic50StarMicromolar",
      "ic50StarReportedPlusMinusMicromolar",
    ],
    name,
  );

  return Object.freeze({
    id: expectString(record.id, `${name}.id`),
    medium: expectString(record.medium, `${name}.medium`),
    carbonSource: expectString(record.carbonSource, `${name}.carbonSource`),
    carbonSourceConcentration: expectString(
      record.carbonSourceConcentration,
      `${name}.carbonSourceConcentration`,
    ),
    temperatureC: expectFinitePositive(
      record.temperatureC,
      `${name}.temperatureC`,
    ),
    lambda0StarPerHour: expectFinitePositive(
      record.lambda0StarPerHour,
      `${name}.lambda0StarPerHour`,
    ),
    lambda0StarReportedPlusMinusPerHour: expectFiniteNonNegative(
      record.lambda0StarReportedPlusMinusPerHour,
      `${name}.lambda0StarReportedPlusMinusPerHour`,
    ),
    ic50StarMicromolar: expectFinitePositive(
      record.ic50StarMicromolar,
      `${name}.ic50StarMicromolar`,
    ),
    ic50StarReportedPlusMinusMicromolar: expectFiniteNonNegative(
      record.ic50StarReportedPlusMinusMicromolar,
      `${name}.ic50StarReportedPlusMinusMicromolar`,
    ),
  });
}

export function parseChloramphenicolResponseAuthority(
  value: unknown,
): ChloramphenicolResponseAuthority {
  const root = expectRecord(value, "chloramphenicol authority");
  expectExactKeys(
    root,
    [
      "kind",
      "schemaVersion",
      "id",
      "version",
      "drug",
      "organism",
      "responseModel",
      "environmentFamilies",
      "effectSemantics",
      "productGate",
      "limitations",
    ],
    "chloramphenicol authority",
  );

  const drug = expectRecord(root.drug, "drug");
  expectExactKeys(drug, ["id", "concentrationUnit"], "drug");
  const parsedDrug = Object.freeze({
    id: expectLiteral(drug.id, "chloramphenicol", "drug.id"),
    concentrationUnit: expectLiteral(
      drug.concentrationUnit,
      CHLORAMPHENICOL_CONCENTRATION_UNIT,
      "drug.concentrationUnit",
    ),
  });

  const organism = expectRecord(root.organism, "organism");
  expectExactKeys(organism, ["scientificName", "background"], "organism");
  const parsedOrganism = Object.freeze({
    scientificName: expectString(
      organism.scientificName,
      "organism.scientificName",
    ),
    background: expectString(organism.background, "organism.background"),
  });

  const responseModel = expectRecord(root.responseModel, "responseModel");
  expectExactKeys(
    responseModel,
    ["kind", "id", "equation", "sourceKey", "doi"],
    "responseModel",
  );
  const parsedResponseModel = Object.freeze({
    kind: expectLiteral(
      responseModel.kind,
      "growth-inhibition",
      "responseModel.kind",
    ),
    id: expectLiteral(
      responseModel.id,
      CHLORAMPHENICOL_RESPONSE_MODEL_ID,
      "responseModel.id",
    ),
    equation: expectLiteral(
      responseModel.equation,
      "Greulich-2015-equation-7",
      "responseModel.equation",
    ),
    sourceKey: expectLiteral(
      responseModel.sourceKey,
      "greulich_2015",
      "responseModel.sourceKey",
    ),
    doi: expectLiteral(
      responseModel.doi,
      "10.15252/MSB.20145949",
      "responseModel.doi",
    ),
  });

  if (!Array.isArray(root.environmentFamilies) || root.environmentFamilies.length === 0) {
    throw new TypeError("environmentFamilies must be a non-empty array");
  }
  const environmentFamilies = root.environmentFamilies.map(
    parseEnvironmentFamily,
  );
  const environmentIds = new Set<string>();
  for (const family of environmentFamilies) {
    if (environmentIds.has(family.id)) {
      throw new TypeError("environment family IDs must be unique");
    }
    environmentIds.add(family.id);
  }

  const effectSemantics = expectRecord(
    root.effectSemantics,
    "effectSemantics",
  );
  expectExactKeys(
    effectSemantics,
    ["divisionMultiplier", "incrementalLossHazardPerHour"],
    "effectSemantics",
  );
  const parsedEffectSemantics = Object.freeze({
    divisionMultiplier: expectString(
      effectSemantics.divisionMultiplier,
      "effectSemantics.divisionMultiplier",
    ),
    incrementalLossHazardPerHour: expectLiteral(
      effectSemantics.incrementalLossHazardPerHour,
      0,
      "effectSemantics.incrementalLossHazardPerHour",
    ),
  });

  const productGate = expectRecord(root.productGate, "productGate");
  expectExactKeys(productGate, ["status", "reason"], "productGate");
  const parsedProductGate = Object.freeze({
    status: expectLiteral(
      productGate.status,
      "context-gated",
      "productGate.status",
    ),
    reason: expectString(productGate.reason, "productGate.reason"),
  });

  if (!Array.isArray(root.limitations) || root.limitations.length === 0) {
    throw new TypeError("limitations must be a non-empty array");
  }
  const limitations = root.limitations.map((limitation, index) =>
    expectString(limitation, `limitations[${index}]`),
  );
  if (new Set(limitations).size !== limitations.length) {
    throw new TypeError("limitations must be unique");
  }

  return Object.freeze({
    kind: expectLiteral(
      root.kind,
      CHLORAMPHENICOL_RESPONSE_AUTHORITY_KIND,
      "kind",
    ),
    schemaVersion: expectLiteral(
      root.schemaVersion,
      CHLORAMPHENICOL_RESPONSE_SCHEMA_VERSION,
      "schemaVersion",
    ),
    id: expectString(root.id, "id"),
    version: expectString(root.version, "version"),
    drug: parsedDrug,
    organism: parsedOrganism,
    responseModel: parsedResponseModel,
    environmentFamilies: Object.freeze(environmentFamilies),
    effectSemantics: parsedEffectSemantics,
    productGate: parsedProductGate,
    limitations: Object.freeze(limitations),
  });
}

export const CHLORAMPHENICOL_MG1655_RESPONSE_AUTHORITY =
  parseChloramphenicolResponseAuthority(rawAuthority);

export function resolveChloramphenicolEnvironmentFamily(
  authority: ChloramphenicolResponseAuthority,
  environmentFamilyId: string,
): ChloramphenicolEnvironmentFamily {
  const canonicalId = expectString(
    environmentFamilyId,
    "environmentFamilyId",
  );
  const family = authority.environmentFamilies.find(
    (candidate) => candidate.id === canonicalId,
  );
  if (family === undefined) {
    throw new RangeError(
      `unsupported chloramphenicol environment family: ${canonicalId}`,
    );
  }
  return family;
}

function validateEvaluationInput(
  concentrationMicromolar: number,
  drugFreeGrowthRatePerHour: number,
  family: ChloramphenicolEnvironmentFamily,
): void {
  expectFiniteNonNegative(
    concentrationMicromolar,
    "chloramphenicol concentration",
  );
  expectFinitePositive(
    drugFreeGrowthRatePerHour,
    "drugFreeGrowthRatePerHour",
  );
  expectFinitePositive(
    family.lambda0StarPerHour,
    "environment lambda0StarPerHour",
  );
  expectFinitePositive(
    family.ic50StarMicromolar,
    "environment ic50StarMicromolar",
  );
}

interface GreulichCoefficients {
  readonly linear: number;
  readonly constantMagnitude: number;
}

function greulichCoefficients(
  concentrationMicromolar: number,
  drugFreeGrowthRatePerHour: number,
  family: ChloramphenicolEnvironmentFamily,
): GreulichCoefficients {
  validateEvaluationInput(
    concentrationMicromolar,
    drugFreeGrowthRatePerHour,
    family,
  );
  const rateRatio =
    family.lambda0StarPerHour / drugFreeGrowthRatePerHour;
  const constantMagnitude = 0.25 * rateRatio * rateRatio;
  const linear =
    constantMagnitude +
    (concentrationMicromolar / (2 * family.ic50StarMicromolar)) *
      rateRatio;
  if (!Number.isFinite(constantMagnitude) || !Number.isFinite(linear)) {
    throw new RangeError(
      "chloramphenicol response coefficients are not numerically representable",
    );
  }
  return { linear, constantMagnitude };
}

function residualFromCoefficients(
  normalizedGrowth: number,
  coefficients: GreulichCoefficients,
): number {
  return (
    normalizedGrowth * normalizedGrowth * normalizedGrowth -
    normalizedGrowth * normalizedGrowth +
    coefficients.linear * normalizedGrowth -
    coefficients.constantMagnitude
  );
}

/**
 * Greulich et al. 2015 equation 7, expressed as a residual in
 * x = lambda / lambda0. A valid steady-state response has residual 0.
 */
export function greulichEquation7Residual(
  normalizedGrowth: number,
  concentrationMicromolar: number,
  drugFreeGrowthRatePerHour: number,
  family: ChloramphenicolEnvironmentFamily,
): number {
  if (
    !Number.isFinite(normalizedGrowth) ||
    normalizedGrowth < 0 ||
    normalizedGrowth > 1
  ) {
    throw new RangeError(
      "normalizedGrowth must be finite and within [0, 1]",
    );
  }
  return residualFromCoefficients(
    normalizedGrowth,
    greulichCoefficients(
      concentrationMicromolar,
      drugFreeGrowthRatePerHour,
      family,
    ),
  );
}

function pushUniqueRoot(roots: number[], root: number): void {
  const bounded =
    root < 0 && root >= -ROOT_INTERVAL_TOLERANCE
      ? 0
      : root > 1 && root <= 1 + ROOT_INTERVAL_TOLERANCE
        ? 1
        : root;
  if (bounded < 0 || bounded > 1 || !Number.isFinite(bounded)) {
    return;
  }
  if (
    roots.every(
      (candidate) =>
        Math.abs(candidate - bounded) > ROOT_DEDUPLICATION_TOLERANCE,
    )
  ) {
    roots.push(bounded);
  }
}

function bisectSignChangingInterval(
  lower: number,
  upper: number,
  coefficients: GreulichCoefficients,
): number {
  let low = lower;
  let high = upper;
  let lowResidual = residualFromCoefficients(low, coefficients);
  let highResidual = residualFromCoefficients(high, coefficients);

  if (!(lowResidual * highResidual < 0)) {
    throw new Error(
      "Greulich bisection requires a sign-changing interval",
    );
  }

  for (let iteration = 0; iteration < MAX_BISECTION_ITERATIONS; iteration += 1) {
    const middle = (low + high) / 2;
    const middleResidual = residualFromCoefficients(
      middle,
      coefficients,
    );
    if (
      Math.abs(middleResidual) <= ROOT_RESIDUAL_TOLERANCE ||
      high - low <= ROOT_INTERVAL_TOLERANCE
    ) {
      return middle;
    }

    if (lowResidual * middleResidual < 0) {
      high = middle;
      highResidual = middleResidual;
    } else {
      low = middle;
      lowResidual = middleResidual;
    }
  }

  const root = (low + high) / 2;
  const residual = residualFromCoefficients(root, coefficients);
  if (
    !Number.isFinite(residual) ||
    Math.abs(residual) > ROOT_RESIDUAL_TOLERANCE * 10
  ) {
    throw new Error(
      "Greulich physical-root solve did not converge deterministically",
    );
  }
  void highResidual;
  return root;
}

function physicalRoots(
  concentrationMicromolar: number,
  drugFreeGrowthRatePerHour: number,
  family: ChloramphenicolEnvironmentFamily,
): readonly number[] {
  if (concentrationMicromolar === 0) {
    validateEvaluationInput(
      concentrationMicromolar,
      drugFreeGrowthRatePerHour,
      family,
    );
    return [1];
  }

  const coefficients = greulichCoefficients(
    concentrationMicromolar,
    drugFreeGrowthRatePerHour,
    family,
  );
  const boundaries = [0, 1];
  const derivativeDiscriminant = 4 - 12 * coefficients.linear;
  if (derivativeDiscriminant > 0) {
    const root = Math.sqrt(derivativeDiscriminant);
    const first = (2 - root) / 6;
    const second = (2 + root) / 6;
    if (first > 0 && first < 1) boundaries.push(first);
    if (second > 0 && second < 1) boundaries.push(second);
  }
  boundaries.sort((left, right) => left - right);

  const roots: number[] = [];
  for (const boundary of boundaries) {
    const residual = residualFromCoefficients(boundary, coefficients);
    if (Math.abs(residual) <= ROOT_RESIDUAL_TOLERANCE) {
      pushUniqueRoot(roots, boundary);
    }
  }

  for (let index = 0; index + 1 < boundaries.length; index += 1) {
    const lower = boundaries[index]!;
    const upper = boundaries[index + 1]!;
    const lowerResidual = residualFromCoefficients(lower, coefficients);
    const upperResidual = residualFromCoefficients(upper, coefficients);
    if (lowerResidual * upperResidual < 0) {
      pushUniqueRoot(
        roots,
        bisectSignChangingInterval(lower, upper, coefficients),
      );
    }
  }

  roots.sort((left, right) => left - right);
  return roots;
}

/**
 * Select the source-backed physical branch. Multiple admissible roots are
 * rejected rather than picking a visually/convenient branch.
 */
export function greulichChloramphenicolDivisionMultiplier(
  concentrationMicromolar: number,
  drugFreeGrowthRatePerHour: number,
  family: ChloramphenicolEnvironmentFamily,
): number {
  const roots = physicalRoots(
    concentrationMicromolar,
    drugFreeGrowthRatePerHour,
    family,
  );
  if (roots.length === 0) {
    throw new Error(
      "no physical Greulich chloramphenicol root exists within [0, 1]",
    );
  }
  if (roots.length !== 1) {
    throw new Error(
      "ambiguous Greulich chloramphenicol physical branch",
    );
  }

  const root = roots[0]!;
  const residual = greulichEquation7Residual(
    root,
    concentrationMicromolar,
    drugFreeGrowthRatePerHour,
    family,
  );
  if (Math.abs(residual) > ROOT_RESIDUAL_TOLERANCE * 10) {
    throw new Error(
      "selected Greulich chloramphenicol root violates equation 7",
    );
  }
  return root;
}

/**
 * Source-paper reversible-limit diagnostic. This is intentionally separate
 * from the full equation-7 evaluator and must not replace it by default.
 */
export function greulichReversibleLimitDivisionMultiplier(
  concentrationMicromolar: number,
  drugFreeGrowthRatePerHour: number,
  family: ChloramphenicolEnvironmentFamily,
): number {
  validateEvaluationInput(
    concentrationMicromolar,
    drugFreeGrowthRatePerHour,
    family,
  );
  const ic50Micromolar =
    (family.ic50StarMicromolar * family.lambda0StarPerHour) /
    (2 * drugFreeGrowthRatePerHour);
  const multiplier =
    1 / (1 + concentrationMicromolar / ic50Micromolar);
  if (!Number.isFinite(multiplier) || multiplier < 0 || multiplier > 1) {
    throw new Error(
      "Greulich reversible-limit diagnostic became invalid",
    );
  }
  return multiplier;
}

export function chloramphenicolGrowthInhibitionEffect(
  input: ChloramphenicolEffectInput,
): Readonly<AntimicrobialEffect> {
  if (
    input.concentration.unit !==
    input.authority.drug.concentrationUnit
  ) {
    throw new RangeError(
      `chloramphenicol concentration unit must be ${input.authority.drug.concentrationUnit}`,
    );
  }
  const family = resolveChloramphenicolEnvironmentFamily(
    input.authority,
    input.environmentFamilyId,
  );
  const divisionMultiplier =
    greulichChloramphenicolDivisionMultiplier(
      input.concentration.value,
      input.drugFreeGrowthRatePerHour,
      family,
    );

  return validateAntimicrobialEffect({
    divisionMultiplier,
    incrementalLossHazardPerHour: 0,
  });
}
