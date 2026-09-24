import type { DatasetSplit } from "./dataset";

export interface RegressionTargetMetrics {
  readonly mae: number;
  readonly rmse: number;
  readonly count: number;
}

export type RegressionMetrics = Readonly<Record<string, RegressionTargetMetrics>>;

export const GROUP_HORIZON_BALANCED_EVALUATION_POLICY_VERSION =
  "group-horizon-balanced-strict-v1";

export interface EvaluationHorizon {
  readonly id: string;
  readonly hours: number;
}

/**
 * One paired held-out evaluation record for one trajectory at one requested
 * forecast horizon. Candidate and baseline predictions share the exact same
 * authoritative target row by construction.
 */
export interface RegressionEvaluationRow {
  readonly groupKey: string;
  readonly trajectoryKey: string;
  readonly horizonId: string;
  readonly forecastHorizonHours: number;
  readonly actual: Readonly<Record<string, number>>;
  readonly candidate: Readonly<Record<string, number>>;
  readonly baseline: Readonly<Record<string, number>>;
}

export interface EvaluationStratumCoverage {
  readonly rowCount: number;
  readonly trajectoryCount: number;
}

export interface EvaluationHorizonCoverage extends EvaluationStratumCoverage {
  readonly forecastHorizonHours: number;
  readonly groupCount: number;
}

export interface BenchmarkEvaluationCoverage {
  readonly rowCount: number;
  readonly trajectoryCount: number;
  readonly groupCount: number;
  readonly byGroup: Readonly<
    Record<string, EvaluationStratumCoverage>
  >;
  readonly byHorizon: Readonly<
    Record<string, EvaluationHorizonCoverage>
  >;
  readonly byGroupHorizon: Readonly<
    Record<string, Readonly<Record<string, EvaluationStratumCoverage>>>
  >;
}

export interface StratifiedRegressionMetrics {
  /**
   * Equal-weight aggregate across held-out groups. The count remains the raw
   * paired-row count for auditability; it is not the weighting denominator.
   */
  readonly overall: RegressionMetrics;
  /** Equal-weight aggregate across required horizons within each group. */
  readonly byGroup: Readonly<Record<string, RegressionMetrics>>;
  /** Equal-weight aggregate across groups at each requested horizon. */
  readonly byHorizon: Readonly<Record<string, RegressionMetrics>>;
  /** Raw paired-row metrics for each group × requested-horizon stratum. */
  readonly byGroupHorizon: Readonly<
    Record<string, Readonly<Record<string, RegressionMetrics>>>
  >;
}

export interface PairedStratifiedBenchmark {
  readonly coverage: BenchmarkEvaluationCoverage;
  readonly candidate: StratifiedRegressionMetrics;
  readonly baseline: StratifiedRegressionMetrics;
}

export interface SurrogateBenchmarkEvidence {
  readonly schemaVersion: "surrogate-benchmark-evidence-v3";
  readonly modelId: string;
  readonly modelVersion: string;
  readonly baselineId: string;
  readonly datasetVersion: string;
  readonly engineVersion: string;
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
  | "identity-mismatch"
  | "dataset-version-mismatch"
  | "engine-version-mismatch"
  | "split-policy-mismatch"
  | "split-coverage-policy-mismatch"
  | "evaluation-policy-mismatch"
  | "held-out-split-mismatch"
  | "target-coverage-mismatch"
  | "stratum-coverage-mismatch"
  | "invalid-metrics"
  | "evaluation-count-mismatch"
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
 * Builds paired, group-balanced and horizon-aware benchmark evidence.
 *
 * The evaluation policy requires exactly one record per trajectory × declared
 * horizon. That makes snapshot cadence unable to add hidden weight by emitting
 * more adjacent frames. Each required horizon is equally weighted inside a
 * group, and each held-out group is equally weighted in the overall metric.
 */
export function computeStratifiedRegressionBenchmark(args: {
  readonly targetIds: readonly string[];
  readonly requiredGroupKeys: readonly string[];
  readonly requiredHorizons: readonly EvaluationHorizon[];
  readonly rows: readonly RegressionEvaluationRow[];
}): PairedStratifiedBenchmark {
  const targetIds = validateTargetIds(args.targetIds);
  const groupKeys = validateUniqueStrings(
    "required group keys",
    args.requiredGroupKeys,
  );
  const horizons = validateHorizons(args.requiredHorizons);
  if (args.rows.length === 0) {
    throw new RangeError("at least one stratified evaluation row is required");
  }

  const groupSet = new Set(groupKeys);
  const horizonById = new Map(horizons.map((horizon) => [horizon.id, horizon]));
  const trajectoryGroups = new Map<string, string>();
  const trajectoryHorizons = new Map<string, Set<string>>();
  const rowIdentities = new Set<string>();

  const rowsByGroupHorizon = new Map<string, RegressionEvaluationRow[]>();
  for (const groupKey of groupKeys) {
    for (const horizon of horizons) {
      rowsByGroupHorizon.set(stratumKey(groupKey, horizon.id), []);
    }
  }

  for (let rowIndex = 0; rowIndex < args.rows.length; rowIndex += 1) {
    const row = args.rows[rowIndex];
    if (row === undefined) throw new RangeError("evaluation rows must be complete");

    requireNonEmpty("groupKey", row.groupKey);
    requireNonEmpty("trajectoryKey", row.trajectoryKey);
    requireNonEmpty("horizonId", row.horizonId);
    if (!groupSet.has(row.groupKey)) {
      throw new RangeError(`unexpected held-out group: ${row.groupKey}`);
    }
    const horizon = horizonById.get(row.horizonId);
    if (horizon === undefined) {
      throw new RangeError(`unexpected forecast horizon: ${row.horizonId}`);
    }
    if (
      !Number.isFinite(row.forecastHorizonHours) ||
      row.forecastHorizonHours < 0 ||
      Math.abs(row.forecastHorizonHours - horizon.hours) > 1e-12
    ) {
      throw new RangeError(
        `forecast horizon ${row.horizonId} does not match its declared hours`,
      );
    }

    const previousGroup = trajectoryGroups.get(row.trajectoryKey);
    if (previousGroup !== undefined && previousGroup !== row.groupKey) {
      throw new RangeError(
        `trajectory ${row.trajectoryKey} appears in multiple held-out groups`,
      );
    }
    trajectoryGroups.set(row.trajectoryKey, row.groupKey);

    const identity = stratumKey(
      row.groupKey,
      row.trajectoryKey,
      row.horizonId,
    );
    if (rowIdentities.has(identity)) {
      throw new RangeError(
        `duplicate evaluation record for trajectory ${row.trajectoryKey} at horizon ${row.horizonId}`,
      );
    }
    rowIdentities.add(identity);

    const seenHorizons =
      trajectoryHorizons.get(row.trajectoryKey) ?? new Set<string>();
    seenHorizons.add(row.horizonId);
    trajectoryHorizons.set(row.trajectoryKey, seenHorizons);

    assertExactTargets(row.actual, targetIds, `actual row ${rowIndex}`);
    assertExactTargets(row.candidate, targetIds, `candidate row ${rowIndex}`);
    assertExactTargets(row.baseline, targetIds, `baseline row ${rowIndex}`);
    assertFiniteTargets(row.actual, targetIds, `actual row ${rowIndex}`);
    assertFiniteTargets(row.candidate, targetIds, `candidate row ${rowIndex}`);
    assertFiniteTargets(row.baseline, targetIds, `baseline row ${rowIndex}`);

    const bucket = rowsByGroupHorizon.get(
      stratumKey(row.groupKey, row.horizonId),
    );
    if (bucket === undefined) throw new Error("unreachable evaluation stratum");
    bucket.push(row);
  }

  const requiredHorizonIds = horizons.map((horizon) => horizon.id);
  for (const [trajectoryKey, seen] of trajectoryHorizons) {
    const missing = requiredHorizonIds.filter((horizonId) => !seen.has(horizonId));
    if (missing.length > 0) {
      throw new RangeError(
        `trajectory ${trajectoryKey} is missing required horizons: ${missing.join(", ")}`,
      );
    }
  }

  for (const groupKey of groupKeys) {
    const hasTrajectory = [...trajectoryGroups.values()].some(
      (value) => value === groupKey,
    );
    if (!hasTrajectory) {
      throw new RangeError(`required held-out group has no trajectories: ${groupKey}`);
    }
  }

  const candidateByGroupHorizon: Record<
    string,
    Record<string, RegressionMetrics>
  > = {};
  const baselineByGroupHorizon: Record<
    string,
    Record<string, RegressionMetrics>
  > = {};
  const coverageByGroupHorizon: Record<
    string,
    Record<string, EvaluationStratumCoverage>
  > = {};

  for (const groupKey of groupKeys) {
    candidateByGroupHorizon[groupKey] = {};
    baselineByGroupHorizon[groupKey] = {};
    coverageByGroupHorizon[groupKey] = {};

    for (const horizon of horizons) {
      const rows =
        rowsByGroupHorizon.get(stratumKey(groupKey, horizon.id)) ?? [];
      if (rows.length === 0) {
        throw new RangeError(
          `required stratum ${groupKey} × ${horizon.id} has no evidence`,
        );
      }

      candidateByGroupHorizon[groupKey]![horizon.id] =
        computeMetricsForEvaluationRows(targetIds, rows, "candidate");
      baselineByGroupHorizon[groupKey]![horizon.id] =
        computeMetricsForEvaluationRows(targetIds, rows, "baseline");
      coverageByGroupHorizon[groupKey]![horizon.id] = {
        rowCount: rows.length,
        trajectoryCount: new Set(rows.map((row) => row.trajectoryKey)).size,
      };
    }
  }

  const candidateByGroup: Record<string, RegressionMetrics> = {};
  const baselineByGroup: Record<string, RegressionMetrics> = {};
  const coverageByGroup: Record<string, EvaluationStratumCoverage> = {};
  for (const groupKey of groupKeys) {
    candidateByGroup[groupKey] = averageStratumMetrics(
      targetIds,
      horizons.map(
        (horizon) => candidateByGroupHorizon[groupKey]![horizon.id]!,
      ),
    );
    baselineByGroup[groupKey] = averageStratumMetrics(
      targetIds,
      horizons.map(
        (horizon) => baselineByGroupHorizon[groupKey]![horizon.id]!,
      ),
    );
    const groupRows = args.rows.filter((row) => row.groupKey === groupKey);
    coverageByGroup[groupKey] = {
      rowCount: groupRows.length,
      trajectoryCount: new Set(groupRows.map((row) => row.trajectoryKey)).size,
    };
  }

  const candidateByHorizon: Record<string, RegressionMetrics> = {};
  const baselineByHorizon: Record<string, RegressionMetrics> = {};
  const coverageByHorizon: Record<string, EvaluationHorizonCoverage> = {};
  for (const horizon of horizons) {
    candidateByHorizon[horizon.id] = averageStratumMetrics(
      targetIds,
      groupKeys.map(
        (groupKey) => candidateByGroupHorizon[groupKey]![horizon.id]!,
      ),
    );
    baselineByHorizon[horizon.id] = averageStratumMetrics(
      targetIds,
      groupKeys.map(
        (groupKey) => baselineByGroupHorizon[groupKey]![horizon.id]!,
      ),
    );
    const horizonRows = args.rows.filter(
      (row) => row.horizonId === horizon.id,
    );
    coverageByHorizon[horizon.id] = {
      forecastHorizonHours: horizon.hours,
      rowCount: horizonRows.length,
      trajectoryCount: new Set(
        horizonRows.map((row) => row.trajectoryKey),
      ).size,
      groupCount: new Set(horizonRows.map((row) => row.groupKey)).size,
    };
  }

  return {
    coverage: {
      rowCount: args.rows.length,
      trajectoryCount: trajectoryGroups.size,
      groupCount: groupKeys.length,
      byGroup: coverageByGroup,
      byHorizon: coverageByHorizon,
      byGroupHorizon: coverageByGroupHorizon,
    },
    candidate: {
      overall: averageStratumMetrics(
        targetIds,
        groupKeys.map((groupKey) => candidateByGroup[groupKey]!),
      ),
      byGroup: candidateByGroup,
      byHorizon: candidateByHorizon,
      byGroupHorizon: candidateByGroupHorizon,
    },
    baseline: {
      overall: averageStratumMetrics(
        targetIds,
        groupKeys.map((groupKey) => baselineByGroup[groupKey]!),
      ),
      byGroup: baselineByGroup,
      byHorizon: baselineByHorizon,
      byGroupHorizon: baselineByGroupHorizon,
    },
  };
}

/**
 * Promotion is intentionally conservative. Candidate and baseline evidence must
 * share the same required group/horizon coverage, and the candidate must
 * strictly improve both MAE and RMSE for every target overall, per group, per
 * requested horizon, and per group × horizon. No percentage margin is invented.
 */
export function assessSurrogatePromotion(args: {
  readonly evidence: SurrogateBenchmarkEvidence;
  readonly requirements: SurrogatePromotionRequirements;
  readonly expectedModelId: string;
  readonly expectedModelVersion: string;
  readonly expectedDatasetVersion: string;
  readonly expectedEngineVersion: string;
}): SurrogatePromotionAssessment {
  const issues: PromotionIssue[] = [];
  const { evidence, requirements } = args;
  const targetIds = validateTargetIds(requirements.targetIds);
  const groupKeys = validateUniqueStrings(
    "required group keys",
    requirements.requiredGroupKeys,
  );
  const horizons = validateHorizons(requirements.requiredHorizons);

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
  if (evidence.evaluationPolicyVersion !== requirements.evaluationPolicyVersion) {
    issues.push({
      kind: "evaluation-policy-mismatch",
      message:
        "benchmark evidence evaluation weighting policy does not match promotion requirements",
    });
  }
  if (evidence.heldOutSplit !== requirements.heldOutSplit) {
    issues.push({
      kind: "held-out-split-mismatch",
      message: "benchmark evidence held-out split does not match promotion requirements",
    });
  }

  validateEvidenceCoverage(evidence, groupKeys, horizons, issues);

  assessMetricPair({
    issues,
    targetIds,
    candidate: evidence.candidate.overall,
    baseline: evidence.baseline.overall,
    expectedCount: evidence.coverage.rowCount,
    stratum: "overall",
  });

  for (const groupKey of groupKeys) {
    const candidate = evidence.candidate.byGroup[groupKey];
    const baseline = evidence.baseline.byGroup[groupKey];
    const coverage = evidence.coverage.byGroup[groupKey];
    if (candidate === undefined || baseline === undefined || coverage === undefined) {
      continue;
    }
    assessMetricPair({
      issues,
      targetIds,
      candidate,
      baseline,
      expectedCount: coverage.rowCount,
      stratum: `group:${groupKey}`,
    });
  }

  for (const horizon of horizons) {
    const candidate = evidence.candidate.byHorizon[horizon.id];
    const baseline = evidence.baseline.byHorizon[horizon.id];
    const coverage = evidence.coverage.byHorizon[horizon.id];
    if (candidate === undefined || baseline === undefined || coverage === undefined) {
      continue;
    }
    assessMetricPair({
      issues,
      targetIds,
      candidate,
      baseline,
      expectedCount: coverage.rowCount,
      stratum: `horizon:${horizon.id}`,
    });
  }

  for (const groupKey of groupKeys) {
    for (const horizon of horizons) {
      const candidate = evidence.candidate.byGroupHorizon[groupKey]?.[horizon.id];
      const baseline = evidence.baseline.byGroupHorizon[groupKey]?.[horizon.id];
      const coverage =
        evidence.coverage.byGroupHorizon[groupKey]?.[horizon.id];
      if (
        candidate === undefined ||
        baseline === undefined ||
        coverage === undefined
      ) {
        issues.push({
          kind: "stratum-coverage-mismatch",
          stratum: `group:${groupKey}/horizon:${horizon.id}`,
          message:
            `required group/horizon stratum ${groupKey} × ${horizon.id} is missing evidence`,
        });
        continue;
      }
      assessMetricPair({
        issues,
        targetIds,
        candidate,
        baseline,
        expectedCount: coverage.rowCount,
        stratum: `group:${groupKey}/horizon:${horizon.id}`,
      });
    }
  }

  return { eligible: issues.length === 0, issues };
}

function validateEvidenceCoverage(
  evidence: SurrogateBenchmarkEvidence,
  groupKeys: readonly string[],
  horizons: readonly EvaluationHorizon[],
  issues: PromotionIssue[],
): void {
  if (
    !Number.isSafeInteger(evidence.coverage.rowCount) ||
    evidence.coverage.rowCount <= 0 ||
    !Number.isSafeInteger(evidence.coverage.trajectoryCount) ||
    evidence.coverage.trajectoryCount <= 0 ||
    evidence.coverage.groupCount !== groupKeys.length
  ) {
    issues.push({
      kind: "stratum-coverage-mismatch",
      message: "benchmark aggregate coverage counts are invalid",
    });
  }

  const expectedGroups = [...groupKeys].sort();
  const expectedHorizons = horizons.map((horizon) => horizon.id).sort();
  const actualGroups = Object.keys(evidence.coverage.byGroup).sort();
  const actualHorizons = Object.keys(evidence.coverage.byHorizon).sort();
  const candidateGroups = Object.keys(evidence.candidate.byGroup).sort();
  const baselineGroups = Object.keys(evidence.baseline.byGroup).sort();
  const candidateMatrixGroups = Object.keys(
    evidence.candidate.byGroupHorizon,
  ).sort();
  const baselineMatrixGroups = Object.keys(
    evidence.baseline.byGroupHorizon,
  ).sort();
  const candidateHorizons = Object.keys(evidence.candidate.byHorizon).sort();
  const baselineHorizons = Object.keys(evidence.baseline.byHorizon).sort();

  if (actualGroups.join("\u0000") !== expectedGroups.join("\u0000")) {
    issues.push({
      kind: "stratum-coverage-mismatch",
      message: "benchmark evidence must exactly cover required held-out groups",
    });
  }
  if (
    [candidateGroups, baselineGroups, candidateMatrixGroups, baselineMatrixGroups]
      .some((keys) => keys.join("\u0000") !== expectedGroups.join("\u0000"))
  ) {
    issues.push({
      kind: "stratum-coverage-mismatch",
      message: "candidate and baseline metrics must exactly cover required groups",
    });
  }
  if (actualHorizons.join("\u0000") !== expectedHorizons.join("\u0000")) {
    issues.push({
      kind: "stratum-coverage-mismatch",
      message: "benchmark evidence must exactly cover required forecast horizons",
    });
  }
  if (
    [candidateHorizons, baselineHorizons].some(
      (keys) => keys.join("\u0000") !== expectedHorizons.join("\u0000"),
    )
  ) {
    issues.push({
      kind: "stratum-coverage-mismatch",
      message:
        "candidate and baseline metrics must exactly cover required forecast horizons",
    });
  }

  let groupRowTotal = 0;
  let groupTrajectoryTotal = 0;
  for (const groupKey of groupKeys) {
    const group = evidence.coverage.byGroup[groupKey];
    const candidate = evidence.candidate.byGroup[groupKey];
    const baseline = evidence.baseline.byGroup[groupKey];
    const matrix = evidence.coverage.byGroupHorizon[groupKey];
    const candidateMatrix = evidence.candidate.byGroupHorizon[groupKey];
    const baselineMatrix = evidence.baseline.byGroupHorizon[groupKey];
    if (
      group === undefined ||
      candidate === undefined ||
      baseline === undefined ||
      matrix === undefined ||
      candidateMatrix === undefined ||
      baselineMatrix === undefined
    ) {
      issues.push({
        kind: "stratum-coverage-mismatch",
        stratum: `group:${groupKey}`,
        message: `required group ${groupKey} is missing benchmark evidence`,
      });
      continue;
    }
    if (
      !Number.isSafeInteger(group.rowCount) ||
      group.rowCount <= 0 ||
      !Number.isSafeInteger(group.trajectoryCount) ||
      group.trajectoryCount <= 0
    ) {
      issues.push({
        kind: "stratum-coverage-mismatch",
        stratum: `group:${groupKey}`,
        message: `coverage for group ${groupKey} must be positive integers`,
      });
    } else {
      groupRowTotal += group.rowCount;
      groupTrajectoryTotal += group.trajectoryCount;
    }

    const coverageHorizonKeys = Object.keys(matrix).sort();
    const candidateHorizonKeys = Object.keys(candidateMatrix).sort();
    const baselineHorizonKeys = Object.keys(baselineMatrix).sort();
    if (
      [coverageHorizonKeys, candidateHorizonKeys, baselineHorizonKeys].some(
        (keys) => keys.join("\u0000") !== expectedHorizons.join("\u0000"),
      )
    ) {
      issues.push({
        kind: "stratum-coverage-mismatch",
        stratum: `group:${groupKey}`,
        message:
          `group ${groupKey} candidate, baseline, and coverage must include every required horizon`,
      });
    }

    for (const horizon of horizons) {
      const cell = matrix[horizon.id];
      if (
        cell === undefined ||
        !Number.isSafeInteger(cell.rowCount) ||
        cell.rowCount <= 0 ||
        !Number.isSafeInteger(cell.trajectoryCount) ||
        cell.trajectoryCount <= 0
      ) {
        issues.push({
          kind: "stratum-coverage-mismatch",
          stratum: `group:${groupKey}/horizon:${horizon.id}`,
          message:
            `coverage for ${groupKey} × ${horizon.id} must be positive integers`,
        });
      }
    }
  }

  if (
    groupRowTotal !== evidence.coverage.rowCount ||
    groupTrajectoryTotal !== evidence.coverage.trajectoryCount
  ) {
    issues.push({
      kind: "stratum-coverage-mismatch",
      message: "group coverage counts do not reconcile with aggregate coverage",
    });
  }

  let horizonRowTotal = 0;
  for (const horizon of horizons) {
    const coverage = evidence.coverage.byHorizon[horizon.id];
    const candidate = evidence.candidate.byHorizon[horizon.id];
    const baseline = evidence.baseline.byHorizon[horizon.id];
    if (coverage === undefined || candidate === undefined || baseline === undefined) {
      issues.push({
        kind: "stratum-coverage-mismatch",
        stratum: `horizon:${horizon.id}`,
        message: `required horizon ${horizon.id} is missing benchmark evidence`,
      });
      continue;
    }
    if (
      !Number.isFinite(coverage.forecastHorizonHours) ||
      Math.abs(coverage.forecastHorizonHours - horizon.hours) > 1e-12 ||
      coverage.groupCount !== groupKeys.length ||
      !Number.isSafeInteger(coverage.rowCount) ||
      coverage.rowCount <= 0 ||
      !Number.isSafeInteger(coverage.trajectoryCount) ||
      coverage.trajectoryCount <= 0
    ) {
      issues.push({
        kind: "stratum-coverage-mismatch",
        stratum: `horizon:${horizon.id}`,
        message: `coverage for horizon ${horizon.id} does not match requirements`,
      });
    } else {
      horizonRowTotal += coverage.rowCount;
    }
  }

  if (horizonRowTotal !== evidence.coverage.rowCount) {
    issues.push({
      kind: "stratum-coverage-mismatch",
      message: "horizon coverage row counts do not reconcile with aggregate coverage",
    });
  }
}

function assessMetricPair(args: {
  readonly issues: PromotionIssue[];
  readonly targetIds: readonly string[];
  readonly candidate: RegressionMetrics;
  readonly baseline: RegressionMetrics;
  readonly expectedCount: number;
  readonly stratum: string;
}): void {
  const candidateTargets = Object.keys(args.candidate).sort();
  const baselineTargets = Object.keys(args.baseline).sort();
  const expectedTargets = [...args.targetIds].sort();
  if (
    candidateTargets.join("\u0000") !== expectedTargets.join("\u0000") ||
    baselineTargets.join("\u0000") !== expectedTargets.join("\u0000")
  ) {
    args.issues.push({
      kind: "target-coverage-mismatch",
      stratum: args.stratum,
      message: `candidate and baseline metrics must exactly cover declared targets for ${args.stratum}`,
    });
    return;
  }

  for (const targetId of args.targetIds) {
    const candidate = args.candidate[targetId];
    const baseline = args.baseline[targetId];
    if (candidate === undefined || baseline === undefined) continue;

    if (!validMetrics(candidate) || !validMetrics(baseline)) {
      args.issues.push({
        kind: "invalid-metrics",
        targetId,
        stratum: args.stratum,
        message: `metrics for ${targetId} in ${args.stratum} must be finite, non-negative and have a positive integer count`,
      });
      continue;
    }
    if (
      candidate.count !== baseline.count ||
      candidate.count !== args.expectedCount
    ) {
      args.issues.push({
        kind: "evaluation-count-mismatch",
        targetId,
        stratum: args.stratum,
        message: `candidate/baseline counts for ${targetId} in ${args.stratum} do not match paired coverage`,
      });
      continue;
    }
    if (!(candidate.mae < baseline.mae && candidate.rmse < baseline.rmse)) {
      args.issues.push({
        kind: "baseline-not-beaten",
        targetId,
        stratum: args.stratum,
        message: `candidate must strictly improve both MAE and RMSE for ${targetId} in ${args.stratum}`,
      });
    }
  }
}

function computeMetricsForEvaluationRows(
  targetIds: readonly string[],
  rows: readonly RegressionEvaluationRow[],
  prediction: "candidate" | "baseline",
): RegressionMetrics {
  return computeRegressionMetrics({
    targetIds,
    actual: rows.map((row) => row.actual),
    predicted: rows.map((row) => row[prediction]),
  });
}

/**
 * Combines already-computed strata with equal stratum weight. RMSE is combined
 * in squared-error space; raw row counts are retained only for coverage audit.
 */
function averageStratumMetrics(
  targetIds: readonly string[],
  strata: readonly RegressionMetrics[],
): RegressionMetrics {
  if (strata.length === 0) {
    throw new RangeError("at least one metric stratum is required");
  }

  const result: Record<string, RegressionTargetMetrics> = {};
  for (const targetId of targetIds) {
    let mae = 0;
    let meanSquaredError = 0;
    let count = 0;
    for (const metrics of strata) {
      const target = metrics[targetId];
      if (target === undefined || !validMetrics(target)) {
        throw new RangeError(
          `cannot aggregate invalid metrics for target ${targetId}`,
        );
      }
      mae += target.mae;
      meanSquaredError += target.rmse * target.rmse;
      count += target.count;
    }
    result[targetId] = {
      mae: mae / strata.length,
      rmse: Math.sqrt(meanSquaredError / strata.length),
      count,
    };
  }
  return result;
}

function validateTargetIds(targetIds: readonly string[]): readonly string[] {
  return validateUniqueStrings("target ids", targetIds);
}

function validateUniqueStrings(
  label: string,
  values: readonly string[],
): readonly string[] {
  if (values.length === 0) {
    throw new RangeError(`at least one ${label.slice(0, -1)} is required`);
  }
  const seen = new Set<string>();
  for (const value of values) {
    requireNonEmpty(label, value);
    if (seen.has(value)) {
      throw new TypeError(`duplicate ${label.slice(0, -1)}: ${value}`);
    }
    seen.add(value);
  }
  return values;
}

function validateHorizons(
  horizons: readonly EvaluationHorizon[],
): readonly EvaluationHorizon[] {
  if (horizons.length === 0) {
    throw new RangeError("at least one evaluation horizon is required");
  }
  const seen = new Set<string>();
  for (const horizon of horizons) {
    requireNonEmpty("horizon id", horizon.id);
    if (seen.has(horizon.id)) {
      throw new TypeError(`duplicate horizon id: ${horizon.id}`);
    }
    seen.add(horizon.id);
    if (!Number.isFinite(horizon.hours) || horizon.hours < 0) {
      throw new RangeError("forecast horizon hours must be finite and non-negative");
    }
  }
  return horizons;
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

function assertFiniteTargets(
  row: Readonly<Record<string, number>>,
  targetIds: readonly string[],
  label: string,
): void {
  for (const targetId of targetIds) {
    const value = row[targetId];
    if (value === undefined || !Number.isFinite(value)) {
      throw new RangeError(`${label} target ${targetId} must be finite`);
    }
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

function requireNonEmpty(name: string, value: string): void {
  if (value.trim().length === 0) {
    throw new TypeError(`${name} must be non-empty`);
  }
}

function stratumKey(...parts: readonly string[]): string {
  return parts.map((part) => `${part.length}:${part}`).join("|");
}
