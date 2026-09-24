import {
  assessSurrogatePromotion,
  type PromotionIssue,
  type SurrogateBenchmarkEvidence,
  type SurrogatePromotionRequirements,
} from "./benchmark";

export type ExecutionMode = "mechanistic" | "emulated";
export type SurrogatePromotionStatus = "experimental" | "validated";

export interface NumericDomainRange {
  readonly minimum: number;
  readonly maximum: number;
}

export interface SurrogateDomain {
  readonly numeric: Readonly<Record<string, NumericDomainRange>>;
  readonly categorical: Readonly<Record<string, readonly string[]>>;
}

export interface SurrogateInput {
  readonly numeric: Readonly<Record<string, number>>;
  readonly categorical: Readonly<Record<string, string>>;
}

interface SurrogateModelCardBase {
  readonly modelId: string;
  readonly modelVersion: string;
  readonly datasetVersion: string;
  readonly engineVersion: string;
  readonly domain: SurrogateDomain;
}

export interface ExperimentalSurrogateModelCard extends SurrogateModelCardBase {
  readonly promotionStatus: "experimental";
}

export interface ValidatedSurrogateModelCard extends SurrogateModelCardBase {
  readonly promotionStatus: "validated";
  readonly promotionEvidence: SurrogateBenchmarkEvidence;
  readonly promotionRequirements: SurrogatePromotionRequirements;
}

export type SurrogateModelCard =
  | ExperimentalSurrogateModelCard
  | ValidatedSurrogateModelCard;

export type DomainViolationKind =
  | "missing-numeric"
  | "non-finite-numeric"
  | "numeric-out-of-range"
  | "unknown-numeric"
  | "missing-categorical"
  | "categorical-out-of-domain"
  | "unknown-categorical";

export interface DomainViolation {
  readonly kind: DomainViolationKind;
  readonly field: string;
  readonly message: string;
}

export type EmulatedRefusalReason =
  | "feature-disabled"
  | "model-not-promoted"
  | "engine-version-mismatch"
  | "promotion-evidence-invalid"
  | "out-of-domain";

export type ExecutionDecision =
  | {
      readonly mode: "mechanistic";
      readonly requested: "mechanistic";
      readonly violations: readonly [];
    }
  | {
      readonly mode: "emulated";
      readonly requested: "emulated";
      readonly modelId: string;
      readonly modelVersion: string;
      readonly violations: readonly [];
    }
  | {
      readonly mode: "mechanistic";
      readonly requested: "emulated";
      readonly refusalReason: EmulatedRefusalReason;
      readonly violations: readonly DomainViolation[];
      readonly promotionIssues?: readonly PromotionIssue[];
    };

export function checkSurrogateDomain(
  input: SurrogateInput,
  domain: SurrogateDomain,
): readonly DomainViolation[] {
  const violations: DomainViolation[] = [];

  for (const [field, range] of Object.entries(domain.numeric)) {
    if (
      !Number.isFinite(range.minimum) ||
      !Number.isFinite(range.maximum) ||
      range.maximum < range.minimum
    ) {
      throw new RangeError(`invalid numeric training domain for ${field}`);
    }

    const value = input.numeric[field];
    if (value === undefined) {
      violations.push({
        kind: "missing-numeric",
        field,
        message: `required numeric input ${field} is missing`,
      });
      continue;
    }
    if (!Number.isFinite(value)) {
      violations.push({
        kind: "non-finite-numeric",
        field,
        message: `numeric input ${field} must be finite`,
      });
      continue;
    }
    if (value < range.minimum || value > range.maximum) {
      violations.push({
        kind: "numeric-out-of-range",
        field,
        message: `${field}=${value} is outside [${range.minimum}, ${range.maximum}]`,
      });
    }
  }

  for (const field of Object.keys(input.numeric)) {
    if (domain.numeric[field] === undefined) {
      violations.push({
        kind: "unknown-numeric",
        field,
        message: `numeric input ${field} is not part of the trained input contract`,
      });
    }
  }

  for (const [field, allowed] of Object.entries(domain.categorical)) {
    if (allowed.length === 0) {
      throw new RangeError(
        `categorical training domain for ${field} must not be empty`,
      );
    }

    const value = input.categorical[field];
    if (value === undefined) {
      violations.push({
        kind: "missing-categorical",
        field,
        message: `required categorical input ${field} is missing`,
      });
      continue;
    }
    if (!allowed.includes(value)) {
      violations.push({
        kind: "categorical-out-of-domain",
        field,
        message: `${field}=${value} was not present in the declared training domain`,
      });
    }
  }

  for (const field of Object.keys(input.categorical)) {
    if (domain.categorical[field] === undefined) {
      violations.push({
        kind: "unknown-categorical",
        field,
        message: `categorical input ${field} is not part of the trained input contract`,
      });
    }
  }

  return violations;
}

/**
 * Emulated execution is optional. Any failed safety gate returns the
 * authoritative mechanistic path plus an explicit refusal reason.
 */
export function resolveExecutionMode(args: {
  readonly requested: ExecutionMode;
  readonly activeEngineVersion: string;
  readonly emulatedFeatureEnabled: boolean;
  readonly model: SurrogateModelCard;
  readonly input: SurrogateInput;
}): ExecutionDecision {
  if (args.requested === "mechanistic") {
    return { mode: "mechanistic", requested: "mechanistic", violations: [] };
  }

  if (!args.emulatedFeatureEnabled) {
    return {
      mode: "mechanistic",
      requested: "emulated",
      refusalReason: "feature-disabled",
      violations: [],
    };
  }

  if (args.model.promotionStatus !== "validated") {
    return {
      mode: "mechanistic",
      requested: "emulated",
      refusalReason: "model-not-promoted",
      violations: [],
    };
  }

  if (args.activeEngineVersion !== args.model.engineVersion) {
    return {
      mode: "mechanistic",
      requested: "emulated",
      refusalReason: "engine-version-mismatch",
      violations: [],
    };
  }

  const promotion = assessSurrogatePromotion({
    evidence: args.model.promotionEvidence,
    requirements: args.model.promotionRequirements,
    expectedModelId: args.model.modelId,
    expectedModelVersion: args.model.modelVersion,
    expectedDatasetVersion: args.model.datasetVersion,
    expectedEngineVersion: args.model.engineVersion,
  });
  if (!promotion.eligible) {
    return {
      mode: "mechanistic",
      requested: "emulated",
      refusalReason: "promotion-evidence-invalid",
      violations: [],
      promotionIssues: promotion.issues,
    };
  }

  const violations = checkSurrogateDomain(args.input, args.model.domain);
  if (violations.length > 0) {
    return {
      mode: "mechanistic",
      requested: "emulated",
      refusalReason: "out-of-domain",
      violations,
    };
  }

  return {
    mode: "emulated",
    requested: "emulated",
    modelId: args.model.modelId,
    modelVersion: args.model.modelVersion,
    violations: [],
  };
}
