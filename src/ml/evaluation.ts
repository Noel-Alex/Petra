import type { RegressionMetrics, RegressionTargetMetrics } from "./benchmark";

export const GROUP_HORIZON_BALANCED_EVALUATION_POLICY_VERSION =
  "group-horizon-balanced-strict-v1";

export interface EvaluationHorizon {
  readonly id: string;
  readonly hours: number;
}

/**
 * One paired held-out record for one stable trajectory at one requested
 * forecast horizon. Candidate and baseline share the exact authoritative
 * target row, preventing independent sampling from biasing comparison.
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
  readonly byGroup: Readonly<Record<string, EvaluationStratumCoverage>>;
  readonly byHorizon: Readonly<Record<string, EvaluationHorizonCoverage>>;
  readonly byGroupHorizon: Readonly<
    Record<string, Readonly<Record<string, EvaluationStratumCoverage>>>
  >;
}

export interface StratifiedRegressionMetrics {
  /**
   * Equal-weight aggregate across held-out groups. count is the raw paired-row
   * count for auditability; it is not the weighting denominator.
   */
  readonly overall: RegressionMetrics;
  /** Equal-weight aggregate across requested horizons within each group. */
  readonly byGroup: Readonly<Record<string, RegressionMetrics>>;
  /** Equal-weight aggregate across groups at each requested horizon. */
  readonly byHorizon: Readonly<Record<string, RegressionMetrics>>;
  /** Raw paired-row metrics for each group × horizon stratum. */
  readonly byGroupHorizon: Readonly<
    Record<string, Readonly<Record<string, RegressionMetrics>>>
  >;
}

export interface PairedStratifiedBenchmark {
  readonly coverage: BenchmarkEvaluationCoverage;
  readonly candidate: StratifiedRegressionMetrics;
  readonly baseline: StratifiedRegressionMetrics;
}

export type EvaluationAssessmentIssueKind =
  | "target-coverage-mismatch"
  | "stratum-coverage-mismatch"
  | "invalid-metrics"
  | "evaluation-count-mismatch"
  | "stratum-metrics-inconsistent"
  | "baseline-not-beaten";

export interface EvaluationAssessmentIssue {
  readonly kind: EvaluationAssessmentIssueKind;
  readonly message: string;
  readonly targetId?: string;
  readonly stratum?: string;
}

/**
 * Builds paired, group-balanced, horizon-aware evaluation evidence.
 *
 * Exactly one row per trajectory × declared horizon is accepted. Therefore a
 * denser snapshot cadence cannot add hidden promotion weight. Horizons are
 * equally weighted within each group; groups are equally weighted overall.
 */
export function computeStratifiedRegressionBenchmark(args: {
  readonly targetIds: readonly string[];
  readonly requiredGroupKeys: readonly string[];
  readonly requiredHorizons: readonly EvaluationHorizon[];
  readonly rows: readonly RegressionEvaluationRow[];
}): PairedStratifiedBenchmark {
  const targetIds = validateUniqueStrings("target id", args.targetIds);
  const groupKeys = validateUniqueStrings(
    "required group key",
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

    const seen =
      trajectoryHorizons.get(row.trajectoryKey) ?? new Set<string>();
    seen.add(row.horizonId);
    trajectoryHorizons.set(row.trajectoryKey, seen);

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
    const missing = requiredHorizonIds.filter((id) => !seen.has(id));
    if (missing.length > 0) {
      throw new RangeError(
        `trajectory ${trajectoryKey} is missing required horizons: ${missing.join(", ")}`,
      );
    }
  }

  for (const groupKey of groupKeys) {
    if (![...trajectoryGroups.values()].some((value) => value === groupKey)) {
      throw new RangeError(
        `required held-out group has no trajectories: ${groupKey}`,
      );
    }
  }

  const candidateMatrix: Record<string, Record<string, RegressionMetrics>> = {};
  const baselineMatrix: Record<string, Record<string, RegressionMetrics>> = {};
  const coverageMatrix: Record<
    string,
    Record<string, EvaluationStratumCoverage>
  > = {};

  for (const groupKey of groupKeys) {
    candidateMatrix[groupKey] = {};
    baselineMatrix[groupKey] = {};
    coverageMatrix[groupKey] = {};

    for (const horizon of horizons) {
      const rows =
        rowsByGroupHorizon.get(stratumKey(groupKey, horizon.id)) ?? [];
      if (rows.length === 0) {
        throw new RangeError(
          `required stratum ${groupKey} × ${horizon.id} has no evidence`,
        );
      }
      candidateMatrix[groupKey]![horizon.id] = computeMetrics(
        targetIds,
        rows.map((row) => row.actual),
        rows.map((row) => row.candidate),
      );
      baselineMatrix[groupKey]![horizon.id] = computeMetrics(
        targetIds,
        rows.map((row) => row.actual),
        rows.map((row) => row.baseline),
      );
      coverageMatrix[groupKey]![horizon.id] = {
        rowCount: rows.length,
        trajectoryCount: new Set(rows.map((row) => row.trajectoryKey)).size,
      };
    }
  }

  const candidateByGroup: Record<string, RegressionMetrics> = {};
  const baselineByGroup: Record<string, RegressionMetrics> = {};
  const coverageByGroup: Record<string, EvaluationStratumCoverage> = {};
  for (const groupKey of groupKeys) {
    candidateByGroup[groupKey] = averageStrata(
      targetIds,
      horizons.map((horizon) => candidateMatrix[groupKey]![horizon.id]!),
    );
    baselineByGroup[groupKey] = averageStrata(
      targetIds,
      horizons.map((horizon) => baselineMatrix[groupKey]![horizon.id]!),
    );
    const rows = args.rows.filter((row) => row.groupKey === groupKey);
    coverageByGroup[groupKey] = {
      rowCount: rows.length,
      trajectoryCount: new Set(rows.map((row) => row.trajectoryKey)).size,
    };
  }

  const candidateByHorizon: Record<string, RegressionMetrics> = {};
  const baselineByHorizon: Record<string, RegressionMetrics> = {};
  const coverageByHorizon: Record<string, EvaluationHorizonCoverage> = {};
  for (const horizon of horizons) {
    candidateByHorizon[horizon.id] = averageStrata(
      targetIds,
      groupKeys.map((groupKey) => candidateMatrix[groupKey]![horizon.id]!),
    );
    baselineByHorizon[horizon.id] = averageStrata(
      targetIds,
      groupKeys.map((groupKey) => baselineMatrix[groupKey]![horizon.id]!),
    );
    const rows = args.rows.filter((row) => row.horizonId === horizon.id);
    coverageByHorizon[horizon.id] = {
      forecastHorizonHours: horizon.hours,
      rowCount: rows.length,
      trajectoryCount: new Set(rows.map((row) => row.trajectoryKey)).size,
      groupCount: new Set(rows.map((row) => row.groupKey)).size,
    };
  }

  return {
    coverage: {
      rowCount: args.rows.length,
      trajectoryCount: trajectoryGroups.size,
      groupCount: groupKeys.length,
      byGroup: coverageByGroup,
      byHorizon: coverageByHorizon,
      byGroupHorizon: coverageMatrix,
    },
    candidate: {
      overall: averageStrata(
        targetIds,
        groupKeys.map((groupKey) => candidateByGroup[groupKey]!),
      ),
      byGroup: candidateByGroup,
      byHorizon: candidateByHorizon,
      byGroupHorizon: candidateMatrix,
    },
    baseline: {
      overall: averageStrata(
        targetIds,
        groupKeys.map((groupKey) => baselineByGroup[groupKey]!),
      ),
      byGroup: baselineByGroup,
      byHorizon: baselineByHorizon,
      byGroupHorizon: baselineMatrix,
    },
  };
}

/**
 * Validates coverage, balanced aggregate consistency, paired counts and strict
 * baseline improvement at overall, group, horizon and group×horizon levels.
 */
export function assessStratifiedRegressionEvidence(args: {
  readonly targetIds: readonly string[];
  readonly requiredGroupKeys: readonly string[];
  readonly requiredHorizons: readonly EvaluationHorizon[];
  readonly coverage: BenchmarkEvaluationCoverage;
  readonly candidate: StratifiedRegressionMetrics;
  readonly baseline: StratifiedRegressionMetrics;
}): readonly EvaluationAssessmentIssue[] {
  const targetIds = validateUniqueStrings("target id", args.targetIds);
  const groupKeys = validateUniqueStrings(
    "required group key",
    args.requiredGroupKeys,
  );
  const horizons = validateHorizons(args.requiredHorizons);
  const issues: EvaluationAssessmentIssue[] = [];
  const expectedGroupKeys = [...groupKeys].sort();
  const expectedHorizonKeys = horizons.map((horizon) => horizon.id).sort();

  if (
    !positiveInteger(args.coverage.rowCount) ||
    !positiveInteger(args.coverage.trajectoryCount) ||
    args.coverage.groupCount !== groupKeys.length ||
    args.coverage.rowCount !==
      args.coverage.trajectoryCount * horizons.length
  ) {
    issues.push({
      kind: "stratum-coverage-mismatch",
      message:
        "aggregate evaluation coverage must be complete trajectory × horizon evidence",
    });
  }

  checkExactKeys(
    "held-out groups",
    expectedGroupKeys,
    [
      Object.keys(args.coverage.byGroup),
      Object.keys(args.coverage.byGroupHorizon),
      Object.keys(args.candidate.byGroup),
      Object.keys(args.candidate.byGroupHorizon),
      Object.keys(args.baseline.byGroup),
      Object.keys(args.baseline.byGroupHorizon),
    ],
    issues,
  );
  checkExactKeys(
    "forecast horizons",
    expectedHorizonKeys,
    [
      Object.keys(args.coverage.byHorizon),
      Object.keys(args.candidate.byHorizon),
      Object.keys(args.baseline.byHorizon),
    ],
    issues,
  );

  let groupRows = 0;
  let groupTrajectories = 0;
  for (const groupKey of groupKeys) {
    const groupCoverage = args.coverage.byGroup[groupKey];
    const coverageMatrix = args.coverage.byGroupHorizon[groupKey];
    const candidateMatrix = args.candidate.byGroupHorizon[groupKey];
    const baselineMatrix = args.baseline.byGroupHorizon[groupKey];
    const candidateGroup = args.candidate.byGroup[groupKey];
    const baselineGroup = args.baseline.byGroup[groupKey];

    if (
      groupCoverage === undefined ||
      coverageMatrix === undefined ||
      candidateMatrix === undefined ||
      baselineMatrix === undefined ||
      candidateGroup === undefined ||
      baselineGroup === undefined
    ) {
      issues.push({
        kind: "stratum-coverage-mismatch",
        stratum: `group:${groupKey}`,
        message: `required group ${groupKey} is missing evaluation evidence`,
      });
      continue;
    }

    if (
      !positiveInteger(groupCoverage.rowCount) ||
      !positiveInteger(groupCoverage.trajectoryCount) ||
      groupCoverage.rowCount !==
        groupCoverage.trajectoryCount * horizons.length
    ) {
      issues.push({
        kind: "stratum-coverage-mismatch",
        stratum: `group:${groupKey}`,
        message:
          `group ${groupKey} must contain one row per trajectory × required horizon`,
      });
    } else {
      groupRows += groupCoverage.rowCount;
      groupTrajectories += groupCoverage.trajectoryCount;
    }

    checkExactKeys(
      `horizons for group ${groupKey}`,
      expectedHorizonKeys,
      [
        Object.keys(coverageMatrix),
        Object.keys(candidateMatrix),
        Object.keys(baselineMatrix),
      ],
      issues,
      `group:${groupKey}`,
    );

    const expectedCandidateGroup: RegressionMetrics[] = [];
    const expectedBaselineGroup: RegressionMetrics[] = [];
    for (const horizon of horizons) {
      const coverage = coverageMatrix[horizon.id];
      const candidate = candidateMatrix[horizon.id];
      const baseline = baselineMatrix[horizon.id];
      const stratum = `group:${groupKey}/horizon:${horizon.id}`;
      if (
        coverage === undefined ||
        candidate === undefined ||
        baseline === undefined
      ) {
        issues.push({
          kind: "stratum-coverage-mismatch",
          stratum,
          message: `required stratum ${groupKey} × ${horizon.id} is missing`,
        });
        continue;
      }
      if (
        !positiveInteger(coverage.rowCount) ||
        coverage.rowCount !== coverage.trajectoryCount ||
        coverage.trajectoryCount !== groupCoverage.trajectoryCount
      ) {
        issues.push({
          kind: "stratum-coverage-mismatch",
          stratum,
          message:
            `stratum ${groupKey} × ${horizon.id} must contain exactly one row per group trajectory`,
        });
      }
      assessMetricPair(
        targetIds,
        candidate,
        baseline,
        coverage.rowCount,
        stratum,
        issues,
      );
      expectedCandidateGroup.push(candidate);
      expectedBaselineGroup.push(baseline);
    }

    if (expectedCandidateGroup.length === horizons.length) {
      assessDerivedAggregate(
        targetIds,
        candidateGroup,
        expectedCandidateGroup,
        `group:${groupKey}`,
        issues,
      );
      assessDerivedAggregate(
        targetIds,
        baselineGroup,
        expectedBaselineGroup,
        `baseline-group:${groupKey}`,
        issues,
      );
      assessMetricPair(
        targetIds,
        candidateGroup,
        baselineGroup,
        groupCoverage.rowCount,
        `group:${groupKey}`,
        issues,
      );
    }
  }

  if (
    groupRows !== args.coverage.rowCount ||
    groupTrajectories !== args.coverage.trajectoryCount
  ) {
    issues.push({
      kind: "stratum-coverage-mismatch",
      message: "group coverage does not reconcile with aggregate coverage",
    });
  }

  const candidateHorizonMetrics: RegressionMetrics[] = [];
  const baselineHorizonMetrics: RegressionMetrics[] = [];
  let horizonRows = 0;
  for (const horizon of horizons) {
    const coverage = args.coverage.byHorizon[horizon.id];
    const candidate = args.candidate.byHorizon[horizon.id];
    const baseline = args.baseline.byHorizon[horizon.id];
    const stratum = `horizon:${horizon.id}`;
    if (
      coverage === undefined ||
      candidate === undefined ||
      baseline === undefined
    ) {
      issues.push({
        kind: "stratum-coverage-mismatch",
        stratum,
        message: `required horizon ${horizon.id} is missing evaluation evidence`,
      });
      continue;
    }
    if (
      !Number.isFinite(coverage.forecastHorizonHours) ||
      Math.abs(coverage.forecastHorizonHours - horizon.hours) > 1e-12 ||
      coverage.groupCount !== groupKeys.length ||
      coverage.rowCount !== args.coverage.trajectoryCount ||
      coverage.trajectoryCount !== args.coverage.trajectoryCount
    ) {
      issues.push({
        kind: "stratum-coverage-mismatch",
        stratum,
        message: `coverage for horizon ${horizon.id} does not match declared evaluation requirements`,
      });
    } else {
      horizonRows += coverage.rowCount;
    }

    const candidateCells: RegressionMetrics[] = [];
    const baselineCells: RegressionMetrics[] = [];
    for (const groupKey of groupKeys) {
      const candidateCell =
        args.candidate.byGroupHorizon[groupKey]?.[horizon.id];
      const baselineCell =
        args.baseline.byGroupHorizon[groupKey]?.[horizon.id];
      if (candidateCell !== undefined && baselineCell !== undefined) {
        candidateCells.push(candidateCell);
        baselineCells.push(baselineCell);
      }
    }
    if (candidateCells.length === groupKeys.length) {
      assessDerivedAggregate(
        targetIds,
        candidate,
        candidateCells,
        stratum,
        issues,
      );
      assessDerivedAggregate(
        targetIds,
        baseline,
        baselineCells,
        `baseline-${stratum}`,
        issues,
      );
    }
    assessMetricPair(
      targetIds,
      candidate,
      baseline,
      coverage.rowCount,
      stratum,
      issues,
    );
    candidateHorizonMetrics.push(candidate);
    baselineHorizonMetrics.push(baseline);
  }

  if (horizonRows !== args.coverage.rowCount) {
    issues.push({
      kind: "stratum-coverage-mismatch",
      message: "horizon coverage does not reconcile with aggregate coverage",
    });
  }

  const candidateGroups = groupKeys
    .map((groupKey) => args.candidate.byGroup[groupKey])
    .filter((metrics): metrics is RegressionMetrics => metrics !== undefined);
  const baselineGroups = groupKeys
    .map((groupKey) => args.baseline.byGroup[groupKey])
    .filter((metrics): metrics is RegressionMetrics => metrics !== undefined);

  if (
    candidateGroups.length === groupKeys.length &&
    baselineGroups.length === groupKeys.length
  ) {
    assessDerivedAggregate(
      targetIds,
      args.candidate.overall,
      candidateGroups,
      "overall",
      issues,
    );
    assessDerivedAggregate(
      targetIds,
      args.baseline.overall,
      baselineGroups,
      "baseline-overall",
      issues,
    );
  }
  assessMetricPair(
    targetIds,
    args.candidate.overall,
    args.baseline.overall,
    args.coverage.rowCount,
    "overall",
    issues,
  );

  return issues;
}

function assessMetricPair(
  targetIds: readonly string[],
  candidate: RegressionMetrics,
  baseline: RegressionMetrics,
  expectedCount: number,
  stratum: string,
  issues: EvaluationAssessmentIssue[],
): void {
  const expected = [...targetIds].sort();
  if (
    Object.keys(candidate).sort().join("\u0000") !== expected.join("\u0000") ||
    Object.keys(baseline).sort().join("\u0000") !== expected.join("\u0000")
  ) {
    issues.push({
      kind: "target-coverage-mismatch",
      stratum,
      message:
        `candidate and baseline must exactly cover declared targets in ${stratum}`,
    });
    return;
  }

  for (const targetId of targetIds) {
    const candidateMetric = candidate[targetId];
    const baselineMetric = baseline[targetId];
    if (candidateMetric === undefined || baselineMetric === undefined) continue;
    if (!validMetric(candidateMetric) || !validMetric(baselineMetric)) {
      issues.push({
        kind: "invalid-metrics",
        targetId,
        stratum,
        message: `metrics for ${targetId} in ${stratum} are invalid`,
      });
      continue;
    }
    if (
      candidateMetric.count !== baselineMetric.count ||
      candidateMetric.count !== expectedCount
    ) {
      issues.push({
        kind: "evaluation-count-mismatch",
        targetId,
        stratum,
        message:
          `candidate/baseline counts for ${targetId} in ${stratum} do not match paired coverage`,
      });
      continue;
    }
    if (
      !(
        candidateMetric.mae < baselineMetric.mae &&
        candidateMetric.rmse < baselineMetric.rmse
      )
    ) {
      issues.push({
        kind: "baseline-not-beaten",
        targetId,
        stratum,
        message:
          `candidate must strictly improve MAE and RMSE for ${targetId} in ${stratum}`,
      });
    }
  }
}

function assessDerivedAggregate(
  targetIds: readonly string[],
  observed: RegressionMetrics,
  sourceStrata: readonly RegressionMetrics[],
  stratum: string,
  issues: EvaluationAssessmentIssue[],
): void {
  let expected: RegressionMetrics;
  try {
    expected = averageStrata(targetIds, sourceStrata);
  } catch {
    issues.push({
      kind: "invalid-metrics",
      stratum,
      message:
        `source metrics for ${stratum} are malformed and cannot be aggregated`,
    });
    return;
  }
  assessDerivedMetrics(targetIds, observed, expected, stratum, issues);
}

function assessDerivedMetrics(
  targetIds: readonly string[],
  observed: RegressionMetrics,
  expected: RegressionMetrics,
  stratum: string,
  issues: EvaluationAssessmentIssue[],
): void {
  for (const targetId of targetIds) {
    const actual = observed[targetId];
    const derived = expected[targetId];
    if (
      actual === undefined ||
      derived === undefined ||
      !approximatelyEqual(actual.mae, derived.mae) ||
      !approximatelyEqual(actual.rmse, derived.rmse) ||
      actual.count !== derived.count
    ) {
      issues.push({
        kind: "stratum-metrics-inconsistent",
        targetId,
        stratum,
        message:
          `reported metrics for ${targetId} in ${stratum} do not match the declared balanced weighting policy`,
      });
    }
  }
}

function computeMetrics(
  targetIds: readonly string[],
  actualRows: readonly Readonly<Record<string, number>>[],
  predictedRows: readonly Readonly<Record<string, number>>[],
): RegressionMetrics {
  if (actualRows.length !== predictedRows.length || actualRows.length === 0) {
    throw new RangeError("paired evaluation rows must be non-empty and aligned");
  }
  const result: Record<string, RegressionTargetMetrics> = {};
  for (const targetId of targetIds) {
    let absolute = 0;
    let squared = 0;
    for (let index = 0; index < actualRows.length; index += 1) {
      const actual = actualRows[index]?.[targetId];
      const predicted = predictedRows[index]?.[targetId];
      if (
        actual === undefined ||
        predicted === undefined ||
        !Number.isFinite(actual) ||
        !Number.isFinite(predicted)
      ) {
        throw new RangeError(
          `target ${targetId} evaluation values must be finite and complete`,
        );
      }
      const error = predicted - actual;
      absolute += Math.abs(error);
      squared += error * error;
      if (!Number.isFinite(absolute) || !Number.isFinite(squared)) {
        throw new RangeError(
          `target ${targetId} metric accumulation overflowed`,
        );
      }
    }
    result[targetId] = {
      mae: absolute / actualRows.length,
      rmse: Math.sqrt(squared / actualRows.length),
      count: actualRows.length,
    };
  }
  return result;
}

function averageStrata(
  targetIds: readonly string[],
  strata: readonly RegressionMetrics[],
): RegressionMetrics {
  if (strata.length === 0) {
    throw new RangeError("at least one metric stratum is required");
  }
  const result: Record<string, RegressionTargetMetrics> = {};
  for (const targetId of targetIds) {
    let mae = 0;
    let mse = 0;
    let count = 0;
    for (const metrics of strata) {
      const metric = metrics[targetId];
      if (metric === undefined || !validMetric(metric)) {
        throw new RangeError(
          `cannot aggregate invalid metrics for target ${targetId}`,
        );
      }
      mae += metric.mae;
      mse += metric.rmse * metric.rmse;
      count += metric.count;
    }
    result[targetId] = {
      mae: mae / strata.length,
      rmse: Math.sqrt(mse / strata.length),
      count,
    };
  }
  return result;
}

function checkExactKeys(
  label: string,
  expected: readonly string[],
  actualSets: readonly (readonly string[])[],
  issues: EvaluationAssessmentIssue[],
  stratum?: string,
): void {
  const expectedKey = [...expected].sort().join("\u0000");
  if (
    actualSets.some(
      (actual) => [...actual].sort().join("\u0000") !== expectedKey,
    )
  ) {
    issues.push({
      kind: "stratum-coverage-mismatch",
      ...(stratum === undefined ? {} : { stratum }),
      message: `candidate, baseline, and coverage must exactly match required ${label}`,
    });
  }
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
      throw new RangeError(
        "forecast horizon hours must be finite and non-negative",
      );
    }
  }
  return horizons;
}

function validateUniqueStrings(
  label: string,
  values: readonly string[],
): readonly string[] {
  if (values.length === 0) {
    throw new RangeError(`at least one ${label} is required`);
  }
  const seen = new Set<string>();
  for (const value of values) {
    requireNonEmpty(label, value);
    if (seen.has(value)) throw new TypeError(`duplicate ${label}: ${value}`);
    seen.add(value);
  }
  return values;
}

function assertExactTargets(
  row: Readonly<Record<string, number>>,
  targetIds: readonly string[],
  label: string,
): void {
  if (
    Object.keys(row).sort().join("\u0000") !==
    [...targetIds].sort().join("\u0000")
  ) {
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

function validMetric(metric: RegressionTargetMetrics): boolean {
  return (
    Number.isFinite(metric.mae) &&
    metric.mae >= 0 &&
    Number.isFinite(metric.rmse) &&
    metric.rmse >= 0 &&
    Number.isSafeInteger(metric.count) &&
    metric.count > 0
  );
}

function positiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function approximatelyEqual(left: number, right: number): boolean {
  const scale = Math.max(1, Math.abs(left), Math.abs(right));
  return Math.abs(left - right) <= 1e-12 * scale;
}

function requireNonEmpty(name: string, value: string): void {
  if (value.trim().length === 0) {
    throw new TypeError(`${name} must be non-empty`);
  }
}

function stratumKey(...parts: readonly string[]): string {
  return parts.map((part) => `${part.length}:${part}`).join("|");
}
