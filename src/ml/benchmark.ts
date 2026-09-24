import {
  mechanisticDatasetSchemaKey,
  type DatasetSplit,
  type MechanisticDatasetSchemaIdentity,
} from "./dataset";
import type { MechanisticDatasetSummary } from "./generator";
import {
  GROUP_HORIZON_BALANCED_EVALUATION_POLICY_VERSION,
  assessStratifiedRegressionEvidence,
  type BenchmarkEvaluationCoverage,
  type EvaluationHorizon,
  type PairedStratifiedBenchmark,
  type StratifiedRegressionMetrics,
} from "./evaluation";

export {
  GROUP_HORIZON_BALANCED_EVALUATION_POLICY_VERSION,
  computeStratifiedRegressionBenchmark,
} from "./evaluation";
export type {
  BenchmarkEvaluationCoverage,
  EvaluationHorizon,
  RegressionEvaluationRow,
  StratifiedRegressionMetrics,
} from "./evaluation";

export interface RegressionTargetMetrics {
  readonly mae: number;
  readonly rmse: number;
  readonly count: number;
}

export type RegressionMetrics = Readonly<Record<string, RegressionTargetMetrics>>;

export interface SurrogateScenarioCompatibility {
  readonly scenarioId: string;
  readonly scenarioVersion: string;
}

export interface SurrogateCompatibilityIdentity {
  readonly schemaVersion: "surrogate-compatibility-v1";
  readonly supportedScenarios: readonly SurrogateScenarioCompatibility[];
  readonly normalizationProfileId: string;
  readonly inputSchemaVersion: string;
  readonly targetSchemaVersion: string;
}

export interface SurrogateBenchmarkEvidence {
  readonly schemaVersion: "surrogate-benchmark-evidence-v5";
  readonly modelId: string;
  readonly modelVersion: string;
  readonly baselineId: string;
  readonly datasetVersion: string;
  readonly engineVersion: string;
  readonly datasetSchema: MechanisticDatasetSchemaIdentity;
  readonly compatibility: SurrogateCompatibilityIdentity;
  readonly splitPolicyVersion: string;
  readonly splitCoveragePolicyVersion: string;
  readonly evaluationPolicyVersion: string;
  readonly heldOutSplit: Exclude<DatasetSplit, "train">;
  readonly coverage: BenchmarkEvaluationCoverage;
  readonly candidate: StratifiedRegressionMetrics;
  readonly baseline: StratifiedRegressionMetrics;
}

export interface SurrogatePromotionRequirements {
  readonly splitPolicyVersion: string;
  readonly splitCoveragePolicyVersion: string;
  readonly evaluationPolicyVersion: string;
  readonly heldOutSplit: Exclude<DatasetSplit, "train">;
  readonly targetIds: readonly string[];
  readonly requiredGroupKeys: readonly string[];
  readonly requiredHorizons: readonly EvaluationHorizon[];
}

export type PromotionIssueKind =
  | "evidence-schema-mismatch"
  | "identity-mismatch"
  | "dataset-version-mismatch"
  | "engine-version-mismatch"
  | "dataset-schema-mismatch"
  | "compatibility-mismatch"
  | "split-policy-mismatch"
  | "split-coverage-policy-mismatch"
  | "evaluation-policy-mismatch"
  | "held-out-split-mismatch"
  | "target-coverage-mismatch"
  | "stratum-coverage-mismatch"
  | "invalid-metrics"
  | "evaluation-count-mismatch"
  | "stratum-metrics-inconsistent"
  | "baseline-not-beaten";

export interface PromotionIssue {
  readonly kind: PromotionIssueKind;
  readonly message: string;
  readonly targetId?: string;
  readonly stratum?: string;
}

export interface SurrogatePromotionAssessment {
  readonly eligible: boolean;
  readonly issues: readonly PromotionIssue[];
}

export function buildSurrogateBenchmarkEvidence(args: {
  readonly modelId: string;
  readonly modelVersion: string;
  readonly baselineId: string;
  readonly dataset: MechanisticDatasetSummary;
  readonly compatibility: SurrogateCompatibilityIdentity;
  readonly evaluationPolicyVersion: string;
  readonly heldOutSplit: Exclude<DatasetSplit, "train">;
  readonly benchmark: PairedStratifiedBenchmark;
}): SurrogateBenchmarkEvidence {
  requireCompatibilityText("modelId", args.modelId);
  requireCompatibilityText("modelVersion", args.modelVersion);
  requireCompatibilityText("baselineId", args.baselineId);

  if (args.dataset.schemaVersion !== "petra-ml-dataset-artifact-v3") {
    throw new RangeError("unsupported mechanistic dataset artifact schema version");
  }

  assertDatasetCompatibility(args.dataset, args.compatibility);

  return {
    schemaVersion: "surrogate-benchmark-evidence-v5",
    modelId: args.modelId,
    modelVersion: args.modelVersion,
    baselineId: args.baselineId,
    datasetVersion: args.dataset.datasetVersion,
    engineVersion: args.dataset.engineVersion,
    datasetSchema: { ...args.dataset.datasetSchema },
    compatibility: {
      ...args.compatibility,
      supportedScenarios: args.compatibility.supportedScenarios.map((scenario) => ({
        ...scenario,
      })),
    },
    splitPolicyVersion: args.dataset.splitPolicyVersion,
    splitCoveragePolicyVersion: args.dataset.splitCoveragePolicyVersion,
    evaluationPolicyVersion: args.evaluationPolicyVersion,
    heldOutSplit: args.heldOutSplit,
    coverage: args.benchmark.coverage,
    candidate: args.benchmark.candidate,
    baseline: args.benchmark.baseline,
  };
}

/**
 * Computes deterministic complete-row MAE/RMSE metrics for declared targets.
 * Missing/extra targets, non-finite values, row-count mismatch and overflow
 * are rejected rather than silently dropping samples.
 */
export function computeRegressionMetrics(args: {
  readonly targetIds: readonly string[];
  readonly actual: readonly Readonly<Record<string, number>>[];
  readonly predicted: readonly Readonly<Record<string, number>>[];
}): RegressionMetrics {
  const targetIds = validateTargetIds(args.targetIds);
  if (args.actual.length !== args.predicted.length) {
    throw new RangeError("actual and predicted row counts must match");
  }
  if (args.actual.length === 0) {
    throw new RangeError("at least one evaluation row is required");
  }

  const sums = new Map<string, { absolute: number; squared: number }>();
  for (const targetId of targetIds) {
    sums.set(targetId, { absolute: 0, squared: 0 });
  }

  for (let rowIndex = 0; rowIndex < args.actual.length; rowIndex += 1) {
    const actualRow = args.actual[rowIndex];
    const predictedRow = args.predicted[rowIndex];
    if (actualRow === undefined || predictedRow === undefined) {
      throw new RangeError("evaluation rows must be complete");
    }
    assertExactTargets(actualRow, targetIds, `actual row ${rowIndex}`);
    assertExactTargets(predictedRow, targetIds, `predicted row ${rowIndex}`);

    for (const targetId of targetIds) {
      const actual = actualRow[targetId];
      const predicted = predictedRow[targetId];
      if (actual === undefined || predicted === undefined) {
        throw new TypeError(`target ${targetId} is missing`);
      }
      if (!Number.isFinite(actual) || !Number.isFinite(predicted)) {
        throw new RangeError(`target ${targetId} values must be finite`);
      }
      const error = predicted - actual;
      const absolute = Math.abs(error);
      const squared = error * error;
      if (!Number.isFinite(absolute) || !Number.isFinite(squared)) {
        throw new RangeError(`target ${targetId} metric accumulation overflowed`);
      }
      const sum = sums.get(targetId);
      if (sum === undefined) throw new Error("unreachable target accumulator");
      sum.absolute += absolute;
      sum.squared += squared;
      if (!Number.isFinite(sum.absolute) || !Number.isFinite(sum.squared)) {
        throw new RangeError(`target ${targetId} metric accumulation overflowed`);
      }
    }
  }

  const result: Record<string, RegressionTargetMetrics> = {};
  for (const targetId of targetIds) {
    const sum = sums.get(targetId);
    if (sum === undefined) throw new Error("unreachable target accumulator");
    const count = args.actual.length;
    result[targetId] = {
      mae: sum.absolute / count,
      rmse: Math.sqrt(sum.squared / count),
      count,
    };
  }
  return result;
}

/**
 * Promotion is intentionally conservative: compatibility must match, held-out
 * evidence must satisfy the supported versioned group/horizon weighting policy,
 * and the candidate must strictly improve both MAE and RMSE in every required
 * overall/group/horizon/group×horizon stratum. No percentage margin is invented.
 */
export function assessSurrogatePromotion(args: {
  readonly evidence: SurrogateBenchmarkEvidence;
  readonly requirements: SurrogatePromotionRequirements;
  readonly expectedModelId: string;
  readonly expectedModelVersion: string;
  readonly expectedDatasetVersion: string;
  readonly expectedEngineVersion: string;
  readonly expectedCompatibility: SurrogateCompatibilityIdentity;
}): SurrogatePromotionAssessment {
  const issues: PromotionIssue[] = [];
  const { evidence, requirements } = args;
  const targetIds = validateTargetIds(requirements.targetIds);

  if (evidence.schemaVersion !== "surrogate-benchmark-evidence-v5") {
    issues.push({
      kind: "evidence-schema-mismatch",
      message: "benchmark evidence schema version is not supported",
    });
  }

  if (
    evidence.modelId !== args.expectedModelId ||
    evidence.modelVersion !== args.expectedModelVersion
  ) {
    issues.push({
      kind: "identity-mismatch",
      message: "benchmark evidence model identity does not match the model card",
    });
  }
  if (evidence.datasetVersion !== args.expectedDatasetVersion) {
    issues.push({
      kind: "dataset-version-mismatch",
      message: "benchmark evidence dataset version does not match the model card",
    });
  }
  if (evidence.engineVersion !== args.expectedEngineVersion) {
    issues.push({
      kind: "engine-version-mismatch",
      message: "benchmark evidence engine version does not match the model card",
    });
  }
  const evidenceDatasetSchemaKey = safeMechanisticDatasetSchemaKey(
    evidence.datasetSchema,
  );
  if (
    evidenceDatasetSchemaKey === null ||
    evidence.datasetSchema.inputSchemaVersion !==
      args.expectedCompatibility.inputSchemaVersion ||
    evidence.datasetSchema.targetSchemaVersion !==
      args.expectedCompatibility.targetSchemaVersion
  ) {
    issues.push({
      kind: "dataset-schema-mismatch",
      message:
        "benchmark evidence dataset schema does not match the model compatibility contract",
    });
  }

  const evidenceCompatibilityKey = safeSurrogateCompatibilityKey(
    evidence.compatibility,
  );
  const expectedCompatibilityKey = safeSurrogateCompatibilityKey(
    args.expectedCompatibility,
  );
  if (
    evidenceCompatibilityKey === null ||
    expectedCompatibilityKey === null ||
    evidenceCompatibilityKey !== expectedCompatibilityKey
  ) {
    issues.push({
      kind: "compatibility-mismatch",
      message:
        "benchmark evidence scenario/normalization/schema compatibility does not match the model card",
    });
  }
  if (evidence.splitPolicyVersion !== requirements.splitPolicyVersion) {
    issues.push({
      kind: "split-policy-mismatch",
      message: "benchmark evidence split policy does not match promotion requirements",
    });
  }
  if (
    evidence.splitCoveragePolicyVersion !==
    requirements.splitCoveragePolicyVersion
  ) {
    issues.push({
      kind: "split-coverage-policy-mismatch",
      message:
        "benchmark evidence split coverage policy does not match promotion requirements",
    });
  }
  if (
    evidence.evaluationPolicyVersion !== requirements.evaluationPolicyVersion ||
    evidence.evaluationPolicyVersion !==
      GROUP_HORIZON_BALANCED_EVALUATION_POLICY_VERSION
  ) {
    issues.push({
      kind: "evaluation-policy-mismatch",
      message:
        "benchmark evidence evaluation policy is unsupported or does not match promotion requirements",
    });
  }
  if (evidence.heldOutSplit !== requirements.heldOutSplit) {
    issues.push({
      kind: "held-out-split-mismatch",
      message: "benchmark evidence held-out split does not match promotion requirements",
    });
  }

  issues.push(
    ...assessStratifiedRegressionEvidence({
      targetIds,
      requiredGroupKeys: requirements.requiredGroupKeys,
      requiredHorizons: requirements.requiredHorizons,
      coverage: evidence.coverage,
      candidate: evidence.candidate,
      baseline: evidence.baseline,
    }),
  );

  return { eligible: issues.length === 0, issues };
}

function validateTargetIds(targetIds: readonly string[]): readonly string[] {
  if (targetIds.length === 0) {
    throw new RangeError("at least one target id is required");
  }
  const seen = new Set<string>();
  for (const targetId of targetIds) {
    if (targetId.trim().length === 0) throw new TypeError("target ids must be non-empty");
    if (seen.has(targetId)) throw new TypeError(`duplicate target id: ${targetId}`);
    seen.add(targetId);
  }
  return targetIds;
}

function assertExactTargets(
  row: Readonly<Record<string, number>>,
  targetIds: readonly string[],
  label: string,
): void {
  const rowKeys = Object.keys(row).sort();
  const expected = [...targetIds].sort();
  if (rowKeys.join("\u0000") !== expected.join("\u0000")) {
    throw new TypeError(`${label} must exactly match declared target ids`);
  }
}

function validMetrics(metrics: RegressionTargetMetrics): boolean {
  return (
    Number.isFinite(metrics.mae) &&
    metrics.mae >= 0 &&
    Number.isFinite(metrics.rmse) &&
    metrics.rmse >= 0 &&
    Number.isSafeInteger(metrics.count) &&
    metrics.count > 0
  );
}


export function surrogateCompatibilityKey(
  identity: SurrogateCompatibilityIdentity,
): string {
  if (identity.schemaVersion !== "surrogate-compatibility-v1") {
    throw new RangeError("unsupported surrogate compatibility schema version");
  }
  requireCompatibilityText(
    "normalizationProfileId",
    identity.normalizationProfileId,
  );
  requireCompatibilityText("inputSchemaVersion", identity.inputSchemaVersion);
  requireCompatibilityText("targetSchemaVersion", identity.targetSchemaVersion);
  if (identity.supportedScenarios.length === 0) {
    throw new RangeError(
      "surrogate compatibility must declare at least one supported scenario",
    );
  }

  const scenarioKeys = identity.supportedScenarios.map((scenario) => {
    requireCompatibilityText("scenarioId", scenario.scenarioId);
    requireCompatibilityText("scenarioVersion", scenario.scenarioVersion);
    return encodeCompatibilityParts([
      scenario.scenarioId,
      scenario.scenarioVersion,
    ]);
  });
  const unique = new Set(scenarioKeys);
  if (unique.size !== scenarioKeys.length) {
    throw new TypeError(
      "surrogate compatibility must not contain duplicate scenario/version pairs",
    );
  }

  return encodeCompatibilityParts([
    identity.schemaVersion,
    ...scenarioKeys.sort(),
    identity.normalizationProfileId,
    identity.inputSchemaVersion,
    identity.targetSchemaVersion,
  ]);
}

function assertDatasetCompatibility(
  dataset: MechanisticDatasetSummary,
  compatibility: SurrogateCompatibilityIdentity,
): void {
  mechanisticDatasetSchemaKey(dataset.datasetSchema);
  surrogateCompatibilityKey(compatibility);

  const scenarioSupported = compatibility.supportedScenarios.some(
    (scenario) =>
      scenario.scenarioId === dataset.scenarioId &&
      scenario.scenarioVersion === dataset.scenarioVersion,
  );
  if (!scenarioSupported) {
    throw new TypeError(
      "dataset scenario/version is not declared by surrogate compatibility",
    );
  }
  if (compatibility.normalizationProfileId !== dataset.normalizationProfileId) {
    throw new TypeError(
      "dataset normalization profile does not match surrogate compatibility",
    );
  }
  if (
    compatibility.inputSchemaVersion !== dataset.datasetSchema.inputSchemaVersion ||
    compatibility.targetSchemaVersion !== dataset.datasetSchema.targetSchemaVersion
  ) {
    throw new TypeError(
      "dataset input/target schema does not match surrogate compatibility",
    );
  }
}

function safeMechanisticDatasetSchemaKey(
  identity: MechanisticDatasetSchemaIdentity,
): string | null {
  try {
    return mechanisticDatasetSchemaKey(identity);
  } catch {
    return null;
  }
}

function safeSurrogateCompatibilityKey(
  identity: SurrogateCompatibilityIdentity,
): string | null {
  try {
    return surrogateCompatibilityKey(identity);
  } catch {
    return null;
  }
}

function requireCompatibilityText(name: string, value: string): void {
  if (value.trim().length === 0) {
    throw new TypeError(`${name} must be non-empty`);
  }
}

function encodeCompatibilityParts(parts: readonly string[]): string {
  return parts.map((part) => `${part.length}:${part}`).join("|");
}
