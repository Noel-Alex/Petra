import type {
  BenchmarkEvaluationCoverage,
  EvaluationHorizon,
  EvaluationHorizonCoverage,
  EvaluationStratumCoverage,
  PairedStratifiedBenchmark,
} from "./evaluation";
import type {
  RegressionMetrics,
  RegressionTargetMetrics,
} from "./benchmark";

export const TRANSITION_SERIES_EVALUATION_ROW_SCHEMA_VERSION =
  "transition-series-evaluation-row-v1" as const;

export const TRAJECTORY_BALANCED_TRANSITION_SERIES_EVALUATION_POLICY_VERSION =
  "trajectory-balanced-transition-series-v1" as const;

export interface TransitionSeriesEvaluationHorizon extends EvaluationHorizon {
  readonly ticks: number;
}

export interface TransitionSeriesEvaluationRow {
  readonly schemaVersion:
    typeof TRANSITION_SERIES_EVALUATION_ROW_SCHEMA_VERSION;
  readonly groupKey: string;
  readonly trajectoryKey: string;
  readonly horizonId: string;
  readonly sourceSnapshotIndex: number;
  readonly targetSnapshotIndex: number;
  readonly sourceTick: number;
  readonly targetTick: number;
  readonly sourceTimeHours: number;
  readonly targetTimeHours: number;
  readonly forecastHorizonTicks: number;
  readonly forecastHorizonHours: number;
  readonly actual: Readonly<Record<string, number>>;
  readonly candidate: Readonly<Record<string, number>>;
  readonly baseline: Readonly<Record<string, number>>;
}

export interface TransitionSeriesHorizonCoverage
  extends EvaluationHorizonCoverage {
  readonly forecastHorizonTicks: number;
}

export interface TransitionSeriesEvaluationCoverage
  extends Omit<BenchmarkEvaluationCoverage, "byHorizon"> {
  readonly byHorizon: Readonly<
    Record<string, TransitionSeriesHorizonCoverage>
  >;
}

export interface TrajectoryBalancedTransitionSeriesBenchmark
  extends Omit<PairedStratifiedBenchmark, "coverage"> {
  readonly evaluationPolicyVersion:
    typeof TRAJECTORY_BALANCED_TRANSITION_SERIES_EVALUATION_POLICY_VERSION;
  readonly coverage: TransitionSeriesEvaluationCoverage;
}

interface TrajectoryHorizonEvidence {
  readonly trajectoryKey: string;
  readonly rowCount: number;
  readonly candidate: RegressionMetrics;
  readonly baseline: RegressionMetrics;
}

/**
 * Evaluate an exact authoritative transition series without giving a trajectory
 * more weight merely because it contributes more source transitions.
 *
 * Each trajectory × horizon is reduced to one MAE/MSE contribution first.
 * Trajectories are then equal-weighted within group × horizon strata, requested
 * horizons are equal-weighted within groups, and held-out groups are
 * equal-weighted overall. Raw row counts are retained only for auditability.
 *
 * This policy intentionally remains separate from the current promotion policy.
 * Promotion code must opt into a separately reviewed policy version before this
 * evidence can make an emulated model eligible.
 */
export function computeTrajectoryBalancedTransitionSeriesBenchmark(args: {
  readonly targetIds: readonly string[];
  readonly requiredGroupKeys: readonly string[];
  readonly requiredHorizons: readonly TransitionSeriesEvaluationHorizon[];
  readonly rows: readonly TransitionSeriesEvaluationRow[];
}): TrajectoryBalancedTransitionSeriesBenchmark {
  const targetIds = validateUniqueCanonicalStrings("target id", args.targetIds);
  const groupKeys = validateUniqueCanonicalStrings(
    "required group key",
    args.requiredGroupKeys,
  );
  const horizons = validateTransitionHorizons(args.requiredHorizons);
  if (args.rows.length === 0) {
    throw new RangeError(
      "at least one transition-series evaluation row is required",
    );
  }

  const groupSet = new Set(groupKeys);
  const horizonById = new Map(
    horizons.map((horizon) => [horizon.id, horizon] as const),
  );
  const trajectoryGroups = new Map<string, string>();
  const rowsByTrajectoryHorizon = new Map<
    string,
    TransitionSeriesEvaluationRow[]
  >();
  const horizonIdsByTrajectory = new Map<string, Set<string>>();

  for (let rowIndex = 0; rowIndex < args.rows.length; rowIndex += 1) {
    const row = args.rows[rowIndex];
    if (row === undefined) {
      throw new RangeError("transition-series rows must be complete");
    }
    validateTransitionRowShape(row, rowIndex, targetIds);

    if (!groupSet.has(row.groupKey)) {
      throw new RangeError(`unexpected held-out group: ${row.groupKey}`);
    }
    const horizon = horizonById.get(row.horizonId);
    if (horizon === undefined) {
      throw new RangeError(
        `unexpected transition-series forecast horizon: ${row.horizonId}`,
      );
    }
    validateRowHorizon(row, horizon);

    const priorGroup = trajectoryGroups.get(row.trajectoryKey);
    if (priorGroup !== undefined && priorGroup !== row.groupKey) {
      throw new RangeError(
        `trajectory ${row.trajectoryKey} appears in multiple held-out groups`,
      );
    }
    trajectoryGroups.set(row.trajectoryKey, row.groupKey);

    const trajectoryHorizonKey = stratumKey(
      row.groupKey,
      row.trajectoryKey,
      row.horizonId,
    );
    const bucket = rowsByTrajectoryHorizon.get(trajectoryHorizonKey) ?? [];
    bucket.push(row);
    rowsByTrajectoryHorizon.set(trajectoryHorizonKey, bucket);

    const horizonIds =
      horizonIdsByTrajectory.get(row.trajectoryKey) ?? new Set<string>();
    horizonIds.add(row.horizonId);
    horizonIdsByTrajectory.set(row.trajectoryKey, horizonIds);
  }

  const requiredHorizonIds = horizons.map((horizon) => horizon.id);
  for (const [trajectoryKey, horizonIds] of horizonIdsByTrajectory) {
    const missing = requiredHorizonIds.filter((id) => !horizonIds.has(id));
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

  const evidenceByGroupHorizon = new Map<
    string,
    TrajectoryHorizonEvidence[]
  >();
  const sortedTrajectoryKeys = [...trajectoryGroups.keys()].sort();
  for (const trajectoryKey of sortedTrajectoryKeys) {
    const groupKey = trajectoryGroups.get(trajectoryKey);
    if (groupKey === undefined) {
      throw new Error("unreachable transition-series trajectory group");
    }
    for (const horizon of horizons) {
      const rows =
        rowsByTrajectoryHorizon.get(
          stratumKey(groupKey, trajectoryKey, horizon.id),
        ) ?? [];
      if (rows.length === 0) {
        throw new RangeError(
          `trajectory ${trajectoryKey} is missing horizon ${horizon.id}`,
        );
      }
      const canonicalRows = validateAndCanonicalizeTransitionSequence(
        rows,
        horizon,
      );
      const evidence: TrajectoryHorizonEvidence = {
        trajectoryKey,
        rowCount: canonicalRows.length,
        candidate: computeRowMetrics(
          targetIds,
          canonicalRows,
          (row) => row.candidate,
        ),
        baseline: computeRowMetrics(
          targetIds,
          canonicalRows,
          (row) => row.baseline,
        ),
      };
      const key = stratumKey(groupKey, horizon.id);
      const bucket = evidenceByGroupHorizon.get(key) ?? [];
      bucket.push(evidence);
      evidenceByGroupHorizon.set(key, bucket);
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
      const evidence =
        evidenceByGroupHorizon.get(stratumKey(groupKey, horizon.id)) ?? [];
      if (evidence.length === 0) {
        throw new RangeError(
          `required stratum ${groupKey} × ${horizon.id} has no transition-series evidence`,
        );
      }
      const sortedEvidence = [...evidence].sort((left, right) =>
        left.trajectoryKey.localeCompare(right.trajectoryKey),
      );
      candidateMatrix[groupKey]![horizon.id] = averageBalancedMetrics(
        targetIds,
        sortedEvidence.map((item) => item.candidate),
      );
      baselineMatrix[groupKey]![horizon.id] = averageBalancedMetrics(
        targetIds,
        sortedEvidence.map((item) => item.baseline),
      );
      coverageMatrix[groupKey]![horizon.id] = {
        rowCount: sortedEvidence.reduce(
          (total, item) => addSafeCount(total, item.rowCount),
          0,
        ),
        trajectoryCount: sortedEvidence.length,
      };
    }
  }

  const candidateByGroup: Record<string, RegressionMetrics> = {};
  const baselineByGroup: Record<string, RegressionMetrics> = {};
  const coverageByGroup: Record<string, EvaluationStratumCoverage> = {};
  for (const groupKey of groupKeys) {
    candidateByGroup[groupKey] = averageBalancedMetrics(
      targetIds,
      horizons.map((horizon) => candidateMatrix[groupKey]![horizon.id]!),
    );
    baselineByGroup[groupKey] = averageBalancedMetrics(
      targetIds,
      horizons.map((horizon) => baselineMatrix[groupKey]![horizon.id]!),
    );
    const trajectoryKeys = [...trajectoryGroups.entries()]
      .filter(([, group]) => group === groupKey)
      .map(([trajectoryKey]) => trajectoryKey);
    const rowCount = args.rows.filter((row) => row.groupKey === groupKey).length;
    coverageByGroup[groupKey] = {
      rowCount,
      trajectoryCount: trajectoryKeys.length,
    };
  }

  const candidateByHorizon: Record<string, RegressionMetrics> = {};
  const baselineByHorizon: Record<string, RegressionMetrics> = {};
  const coverageByHorizon: Record<string, TransitionSeriesHorizonCoverage> = {};
  for (const horizon of horizons) {
    candidateByHorizon[horizon.id] = averageBalancedMetrics(
      targetIds,
      groupKeys.map((groupKey) => candidateMatrix[groupKey]![horizon.id]!),
    );
    baselineByHorizon[horizon.id] = averageBalancedMetrics(
      targetIds,
      groupKeys.map((groupKey) => baselineMatrix[groupKey]![horizon.id]!),
    );
    const horizonRows = args.rows.filter(
      (row) => row.horizonId === horizon.id,
    );
    coverageByHorizon[horizon.id] = {
      forecastHorizonHours: horizon.hours,
      forecastHorizonTicks: horizon.ticks,
      rowCount: horizonRows.length,
      trajectoryCount: new Set(
        horizonRows.map((row) => row.trajectoryKey),
      ).size,
      groupCount: new Set(horizonRows.map((row) => row.groupKey)).size,
    };
  }

  return {
    evaluationPolicyVersion:
      TRAJECTORY_BALANCED_TRANSITION_SERIES_EVALUATION_POLICY_VERSION,
    coverage: {
      rowCount: args.rows.length,
      trajectoryCount: trajectoryGroups.size,
      groupCount: groupKeys.length,
      byGroup: coverageByGroup,
      byHorizon: coverageByHorizon,
      byGroupHorizon: coverageMatrix,
    },
    candidate: {
      overall: averageBalancedMetrics(
        targetIds,
        groupKeys.map((groupKey) => candidateByGroup[groupKey]!),
      ),
      byGroup: candidateByGroup,
      byHorizon: candidateByHorizon,
      byGroupHorizon: candidateMatrix,
    },
    baseline: {
      overall: averageBalancedMetrics(
        targetIds,
        groupKeys.map((groupKey) => baselineByGroup[groupKey]!),
      ),
      byGroup: baselineByGroup,
      byHorizon: baselineByHorizon,
      byGroupHorizon: baselineMatrix,
    },
  };
}

function validateTransitionRowShape(
  row: TransitionSeriesEvaluationRow,
  rowIndex: number,
  targetIds: readonly string[],
): void {
  if (row.schemaVersion !== TRANSITION_SERIES_EVALUATION_ROW_SCHEMA_VERSION) {
    throw new RangeError(
      `transition-series row ${rowIndex} has unsupported schema version`,
    );
  }
  requireCanonicalText("groupKey", row.groupKey);
  requireCanonicalText("trajectoryKey", row.trajectoryKey);
  requireCanonicalText("horizonId", row.horizonId);
  requireNonNegativeSafeInteger(
    "sourceSnapshotIndex",
    row.sourceSnapshotIndex,
  );
  requireNonNegativeSafeInteger(
    "targetSnapshotIndex",
    row.targetSnapshotIndex,
  );
  requireNonNegativeSafeInteger("sourceTick", row.sourceTick);
  requireNonNegativeSafeInteger("targetTick", row.targetTick);
  requireFiniteNonNegative("sourceTimeHours", row.sourceTimeHours);
  requireFiniteNonNegative("targetTimeHours", row.targetTimeHours);
  requirePositiveSafeInteger("forecastHorizonTicks", row.forecastHorizonTicks);
  requireFinitePositive("forecastHorizonHours", row.forecastHorizonHours);

  if (row.targetSnapshotIndex !== row.sourceSnapshotIndex + 1) {
    throw new RangeError(
      `transition-series row ${rowIndex} must bind consecutive authoritative observation indices`,
    );
  }
  if (row.targetTick <= row.sourceTick) {
    throw new RangeError(
      `transition-series row ${rowIndex} target tick must follow source tick`,
    );
  }
  if (row.targetTimeHours <= row.sourceTimeHours) {
    throw new RangeError(
      `transition-series row ${rowIndex} target time must follow source time`,
    );
  }

  assertExactFiniteTargets(row.actual, targetIds, `actual row ${rowIndex}`);
  assertExactFiniteTargets(
    row.candidate,
    targetIds,
    `candidate row ${rowIndex}`,
  );
  assertExactFiniteTargets(
    row.baseline,
    targetIds,
    `baseline row ${rowIndex}`,
  );
}

function validateRowHorizon(
  row: TransitionSeriesEvaluationRow,
  horizon: TransitionSeriesEvaluationHorizon,
): void {
  if (
    row.forecastHorizonTicks !== horizon.ticks ||
    row.targetTick - row.sourceTick !== horizon.ticks
  ) {
    throw new RangeError(
      `forecast horizon ${row.horizonId} does not match its declared tick offset`,
    );
  }
  if (
    !numbersAgree(row.forecastHorizonHours, horizon.hours) ||
    !numbersAgree(row.targetTimeHours - row.sourceTimeHours, horizon.hours)
  ) {
    throw new RangeError(
      `forecast horizon ${row.horizonId} does not match its declared biological-time offset`,
    );
  }
}

function validateAndCanonicalizeTransitionSequence(
  rows: readonly TransitionSeriesEvaluationRow[],
  horizon: TransitionSeriesEvaluationHorizon,
): readonly TransitionSeriesEvaluationRow[] {
  const canonical = [...rows].sort((left, right) => {
    if (left.sourceTick !== right.sourceTick) {
      return left.sourceTick - right.sourceTick;
    }
    if (left.sourceSnapshotIndex !== right.sourceSnapshotIndex) {
      return left.sourceSnapshotIndex - right.sourceSnapshotIndex;
    }
    return left.sourceTimeHours - right.sourceTimeHours;
  });

  for (let index = 0; index < canonical.length; index += 1) {
    const current = canonical[index]!;
    validateRowHorizon(current, horizon);
    if (index === 0) continue;
    const previous = canonical[index - 1]!;
    if (
      current.sourceTick <= previous.sourceTick ||
      current.sourceSnapshotIndex <= previous.sourceSnapshotIndex ||
      current.sourceTimeHours <= previous.sourceTimeHours
    ) {
      throw new RangeError(
        `trajectory ${current.trajectoryKey} horizon ${horizon.id} has duplicate or regressing source positions`,
      );
    }
    if (
      current.targetTick <= previous.targetTick ||
      current.targetSnapshotIndex <= previous.targetSnapshotIndex ||
      current.targetTimeHours <= previous.targetTimeHours
    ) {
      throw new RangeError(
        `trajectory ${current.trajectoryKey} horizon ${horizon.id} has regressing target positions`,
      );
    }
    if (
      current.sourceSnapshotIndex !== previous.targetSnapshotIndex ||
      current.sourceTick !== previous.targetTick ||
      !numbersAgree(current.sourceTimeHours, previous.targetTimeHours)
    ) {
      throw new RangeError(
        `trajectory ${current.trajectoryKey} horizon ${horizon.id} must form one continuous accepted transition chain`,
      );
    }
  }
  return canonical;
}

function computeRowMetrics(
  targetIds: readonly string[],
  rows: readonly TransitionSeriesEvaluationRow[],
  prediction: (
    row: TransitionSeriesEvaluationRow,
  ) => Readonly<Record<string, number>>,
): RegressionMetrics {
  const sums = new Map<string, { absolute: number; squared: number }>();
  for (const targetId of targetIds) {
    sums.set(targetId, { absolute: 0, squared: 0 });
  }

  for (const row of rows) {
    for (const targetId of targetIds) {
      const actual = row.actual[targetId]!;
      const predicted = prediction(row)[targetId]!;
      const error = predicted - actual;
      const absolute = Math.abs(error);
      const squared = error * error;
      if (!Number.isFinite(absolute) || !Number.isFinite(squared)) {
        throw new RangeError(
          `target ${targetId} transition-series metric accumulation overflowed`,
        );
      }
      const sum = sums.get(targetId)!;
      sum.absolute += absolute;
      sum.squared += squared;
      if (!Number.isFinite(sum.absolute) || !Number.isFinite(sum.squared)) {
        throw new RangeError(
          `target ${targetId} transition-series metric accumulation overflowed`,
        );
      }
    }
  }

  const metrics: Record<string, RegressionTargetMetrics> = {};
  for (const targetId of targetIds) {
    const sum = sums.get(targetId)!;
    metrics[targetId] = {
      mae: sum.absolute / rows.length,
      rmse: Math.sqrt(sum.squared / rows.length),
      count: rows.length,
    };
  }
  return metrics;
}

function averageBalancedMetrics(
  targetIds: readonly string[],
  strata: readonly RegressionMetrics[],
): RegressionMetrics {
  if (strata.length === 0) {
    throw new RangeError("balanced metric aggregation requires evidence");
  }

  const result: Record<string, RegressionTargetMetrics> = {};
  for (const targetId of targetIds) {
    let mae = 0;
    let meanSquaredError = 0;
    let count = 0;
    for (const stratum of strata) {
      const metrics = stratum[targetId];
      if (
        metrics === undefined ||
        !Number.isFinite(metrics.mae) ||
        metrics.mae < 0 ||
        !Number.isFinite(metrics.rmse) ||
        metrics.rmse < 0 ||
        !Number.isSafeInteger(metrics.count) ||
        metrics.count <= 0
      ) {
        throw new RangeError(
          `target ${targetId} has invalid balanced transition-series metrics`,
        );
      }
      const squaredRmse = metrics.rmse * metrics.rmse;
      if (!Number.isFinite(squaredRmse)) {
        throw new RangeError(
          `target ${targetId} balanced transition-series RMSE overflowed`,
        );
      }
      mae += metrics.mae;
      meanSquaredError += squaredRmse;
      count = addSafeCount(count, metrics.count);
      if (!Number.isFinite(mae) || !Number.isFinite(meanSquaredError)) {
        throw new RangeError(
          `target ${targetId} balanced transition-series metric accumulation overflowed`,
        );
      }
    }
    result[targetId] = {
      mae: mae / strata.length,
      rmse: Math.sqrt(meanSquaredError / strata.length),
      count,
    };
  }
  return result;
}

function validateTransitionHorizons(
  horizons: readonly TransitionSeriesEvaluationHorizon[],
): readonly TransitionSeriesEvaluationHorizon[] {
  if (horizons.length === 0) {
    throw new RangeError(
      "at least one transition-series evaluation horizon is required",
    );
  }
  const ids = new Set<string>();
  for (const horizon of horizons) {
    requireCanonicalText("transition-series horizon id", horizon.id);
    if (ids.has(horizon.id)) {
      throw new TypeError(
        `duplicate transition-series horizon id: ${horizon.id}`,
      );
    }
    ids.add(horizon.id);
    requirePositiveSafeInteger("transition-series horizon ticks", horizon.ticks);
    requireFinitePositive("transition-series horizon hours", horizon.hours);
  }
  return horizons;
}

function validateUniqueCanonicalStrings(
  name: string,
  values: readonly string[],
): readonly string[] {
  if (values.length === 0) {
    throw new RangeError(`at least one ${name} is required`);
  }
  const seen = new Set<string>();
  for (const value of values) {
    requireCanonicalText(name, value);
    if (seen.has(value)) {
      throw new TypeError(`duplicate ${name}: ${value}`);
    }
    seen.add(value);
  }
  return values;
}

function assertExactFiniteTargets(
  row: Readonly<Record<string, number>>,
  targetIds: readonly string[],
  label: string,
): void {
  const keys = Object.keys(row).sort();
  const expected = [...targetIds].sort();
  if (keys.join("\u0000") !== expected.join("\u0000")) {
    throw new TypeError(`${label} must exactly match declared target ids`);
  }
  for (const targetId of targetIds) {
    const value = row[targetId];
    if (value === undefined || !Number.isFinite(value)) {
      throw new RangeError(`${label} target ${targetId} must be finite`);
    }
  }
}

function requireCanonicalText(name: string, value: string): void {
  if (value.length === 0 || value !== value.trim()) {
    throw new TypeError(`${name} must be a canonical non-empty string`);
  }
}

function requireNonNegativeSafeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
}

function requirePositiveSafeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
}

function requireFiniteNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be finite and non-negative`);
  }
}

function requireFinitePositive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be finite and positive`);
  }
}

function addSafeCount(left: number, right: number): number {
  const total = left + right;
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new RangeError("transition-series coverage count overflowed");
  }
  return total;
}

function numbersAgree(left: number, right: number): boolean {
  if (Object.is(left, right)) return true;
  const scale = Math.max(1, Math.abs(left), Math.abs(right));
  return Math.abs(left - right) <= 1e-12 * scale;
}

function stratumKey(...parts: readonly string[]): string {
  return parts.map((part) => `${part.length}:${part}`).join("|");
}
