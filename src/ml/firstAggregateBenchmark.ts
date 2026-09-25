import {
  predictAggregateBaseline,
  trainConstantBaseline,
  trainRidgeBaseline,
  type AggregateTrainingRow,
  type ConstantBaselineModel,
  type RidgeBaselineModel,
} from "./baselines";
import type { DatasetSplit } from "./dataset";
import {
  canonicalJson,
  MECHANISTIC_DATASET_ARTIFACT_SCHEMA_VERSION,
  MECHANISTIC_DATASET_ROW_SCHEMA_VERSION,
  type MechanisticDatasetRow,
  type MechanisticDatasetSummary,
} from "./generator";
import {
  createNodeMechanisticDatasetPackage,
  FIRST_AGGREGATE_DATASET_VERSION,
  FIRST_AGGREGATE_INPUT_SCHEMA_VERSION,
  FIRST_AGGREGATE_TARGET_SCHEMA_VERSION,
  type FirstAggregateDatasetInput,
  type FirstAggregateDatasetTarget,
} from "./firstAggregateDatasetPackage";
import {
  computeTrajectoryBalancedTransitionSeriesBenchmark,
  TRAJECTORY_BALANCED_TRANSITION_SERIES_EVALUATION_POLICY_VERSION,
  TRANSITION_SERIES_EVALUATION_ROW_SCHEMA_VERSION,
  type TrajectoryBalancedTransitionSeriesBenchmark,
  type TransitionSeriesEvaluationRow,
} from "./transitionSeriesEvaluation";

export const FIRST_AGGREGATE_BASELINE_BENCHMARK_SCHEMA_VERSION =
  "petra-first-aggregate-baseline-benchmark-v1" as const;
export const FIRST_AGGREGATE_BASELINE_POLICY_VERSION =
  "first-aggregate-constant-ridge-v1" as const;
export const FIRST_AGGREGATE_RIDGE_LAMBDA = 1 as const;

export const FIRST_AGGREGATE_BENCHMARK_FEATURE_IDS = Object.freeze([
  "sourceTick",
  "totalBiomass",
  "totalResource",
  "occupiedCells",
] as const);

export const FIRST_AGGREGATE_BENCHMARK_TARGET_IDS = Object.freeze([
  "totalBiomass",
  "totalResource",
  "occupiedCells",
] as const);

const HORIZON_ID = "authoritative-next-64-ticks";

type AggregateTargetId =
  (typeof FIRST_AGGREGATE_BENCHMARK_TARGET_IDS)[number];

export interface FirstAggregateBaselineBenchmark {
  readonly schemaVersion:
    typeof FIRST_AGGREGATE_BASELINE_BENCHMARK_SCHEMA_VERSION;
  readonly policyVersion: typeof FIRST_AGGREGATE_BASELINE_POLICY_VERSION;
  readonly evaluationPolicyVersion:
    typeof TRAJECTORY_BALANCED_TRANSITION_SERIES_EVALUATION_POLICY_VERSION;
  readonly dataset: Readonly<{
    datasetVersion: typeof FIRST_AGGREGATE_DATASET_VERSION;
    datasetDigest: string;
    executionScheduleIdentity: string;
    inputSchemaVersion: typeof FIRST_AGGREGATE_INPUT_SCHEMA_VERSION;
    targetSchemaVersion: typeof FIRST_AGGREGATE_TARGET_SCHEMA_VERSION;
    rowCount: number;
    trajectoryCount: number;
    groupCount: number;
  }>;
  readonly training: Readonly<{
    rowCount: number;
    trajectoryCount: number;
    groupCount: number;
    featureIds: readonly string[];
    targetIds: readonly string[];
    ridgeLambda: typeof FIRST_AGGREGATE_RIDGE_LAMBDA;
  }>;
  readonly validation: TrajectoryBalancedTransitionSeriesBenchmark;
  readonly test: TrajectoryBalancedTransitionSeriesBenchmark;
  readonly models: Readonly<{
    constant: ConstantBaselineModel;
    ridge: RidgeBaselineModel;
  }>;
}

/**
 * Train the repository-owned simple aggregate baselines on train groups only,
 * then evaluate validation/test transition series with #1019's trajectory-
 * balanced held-out policy.
 *
 * Source tick is retained as the one schedule-position feature. Snapshot index
 * and biological time are validated as authoritative identity but excluded as
 * perfectly redundant encodings of the same fixed schedule position.
 */
export function buildFirstAggregateBaselineBenchmark(args: {
  readonly datasetDigest: string;
  readonly summary: MechanisticDatasetSummary;
  readonly rows: readonly MechanisticDatasetRow<
    FirstAggregateDatasetInput,
    FirstAggregateDatasetTarget
  >[];
}): FirstAggregateBaselineBenchmark {
  requireDigest("datasetDigest", args.datasetDigest);
  const validated = validateFirstAggregateBenchmarkDataset(
    args.summary,
    args.rows,
  );
  const trainRows = validated.rowsBySplit.train;
  const validationRows = validated.rowsBySplit.validation;
  const testRows = validated.rowsBySplit.test;

  const trainingRows = trainRows.map(toTrainingRow);
  const constant = trainConstantBaseline({
    featureIds: FIRST_AGGREGATE_BENCHMARK_FEATURE_IDS,
    targetIds: FIRST_AGGREGATE_BENCHMARK_TARGET_IDS,
    rows: trainingRows,
  });
  const ridge = trainRidgeBaseline({
    featureIds: FIRST_AGGREGATE_BENCHMARK_FEATURE_IDS,
    targetIds: FIRST_AGGREGATE_BENCHMARK_TARGET_IDS,
    rows: trainingRows,
    lambda: FIRST_AGGREGATE_RIDGE_LAMBDA,
  });

  const validation = evaluateSplit(validationRows, ridge, constant);
  const test = evaluateSplit(testRows, ridge, constant);

  return Object.freeze({
    schemaVersion: FIRST_AGGREGATE_BASELINE_BENCHMARK_SCHEMA_VERSION,
    policyVersion: FIRST_AGGREGATE_BASELINE_POLICY_VERSION,
    evaluationPolicyVersion:
      TRAJECTORY_BALANCED_TRANSITION_SERIES_EVALUATION_POLICY_VERSION,
    dataset: Object.freeze({
      datasetVersion: FIRST_AGGREGATE_DATASET_VERSION,
      datasetDigest: args.datasetDigest,
      executionScheduleIdentity: args.summary.executionScheduleIdentity,
      inputSchemaVersion: FIRST_AGGREGATE_INPUT_SCHEMA_VERSION,
      targetSchemaVersion: FIRST_AGGREGATE_TARGET_SCHEMA_VERSION,
      rowCount: args.rows.length,
      trajectoryCount: args.summary.trajectoryCount,
      groupCount: args.summary.groupCount,
    }),
    training: Object.freeze({
      rowCount: trainRows.length,
      trajectoryCount: new Set(trainRows.map((row) => row.trajectoryKey)).size,
      groupCount: new Set(trainRows.map((row) => row.splitGroupKey)).size,
      featureIds: FIRST_AGGREGATE_BENCHMARK_FEATURE_IDS,
      targetIds: FIRST_AGGREGATE_BENCHMARK_TARGET_IDS,
      ridgeLambda: FIRST_AGGREGATE_RIDGE_LAMBDA,
    }),
    validation,
    test,
    models: Object.freeze({ constant, ridge }),
  });
}

function validateFirstAggregateBenchmarkDataset(
  summary: MechanisticDatasetSummary,
  rows: readonly MechanisticDatasetRow<
    FirstAggregateDatasetInput,
    FirstAggregateDatasetTarget
  >[],
): Readonly<{
  rowsBySplit: Readonly<
    Record<
      DatasetSplit,
      readonly MechanisticDatasetRow<
        FirstAggregateDatasetInput,
        FirstAggregateDatasetTarget
      >[]
    >
  >;
}> {
  const datasetPackage = createNodeMechanisticDatasetPackage();
  const plan = datasetPackage.plan;

  if (summary.schemaVersion !== MECHANISTIC_DATASET_ARTIFACT_SCHEMA_VERSION) {
    throw new RangeError("unsupported mechanistic dataset artifact version");
  }
  const exactSummaryPairs: ReadonlyArray<
    readonly [string, unknown, unknown]
  > = [
    ["planVersion", summary.planVersion, plan.planVersion],
    ["datasetVersion", summary.datasetVersion, FIRST_AGGREGATE_DATASET_VERSION],
    ["engineVersion", summary.engineVersion, plan.engineVersion],
    ["scenarioId", summary.scenarioId, plan.scenarioId],
    ["scenarioVersion", summary.scenarioVersion, plan.scenarioVersion],
    [
      "normalizationProfileId",
      summary.normalizationProfileId,
      plan.normalizationProfileId,
    ],
    [
      "executionScheduleIdentity",
      summary.executionScheduleIdentity,
      plan.executionScheduleIdentity,
    ],
    ["splitPolicyVersion", summary.splitPolicyVersion, plan.splitPolicy.version],
    [
      "splitCoveragePolicyVersion",
      summary.splitCoveragePolicyVersion,
      plan.splitCoveragePolicy.version,
    ],
    ["groupCount", summary.groupCount, plan.groupCount],
    ["trajectoryCount", summary.trajectoryCount, plan.trajectoryCount],
  ];
  for (const [name, observed, expected] of exactSummaryPairs) {
    if (observed !== expected) {
      throw new TypeError(
        `first aggregate benchmark summary ${name} does not match package authority`,
      );
    }
  }
  if (
    canonicalJson(summary.datasetSchema) !== canonicalJson(plan.datasetSchema) ||
    canonicalJson(summary.executionSchedule) !==
      canonicalJson(plan.executionSchedule) ||
    canonicalJson(summary.splitGroupCounts) !==
      canonicalJson(plan.splitGroupCounts) ||
    canonicalJson(summary.splitTrajectoryCounts) !==
      canonicalJson(plan.splitTrajectoryCounts)
  ) {
    throw new TypeError(
      "first aggregate benchmark summary identity does not match package authority",
    );
  }
  if (
    summary.datasetSchema.inputSchemaVersion !==
      FIRST_AGGREGATE_INPUT_SCHEMA_VERSION ||
    summary.datasetSchema.targetSchemaVersion !==
      FIRST_AGGREGATE_TARGET_SCHEMA_VERSION
  ) {
    throw new TypeError(
      "first aggregate benchmark requires exact v2 input/target schema identity",
    );
  }
  if (summary.sampleCount !== rows.length) {
    throw new RangeError(
      "first aggregate benchmark row count does not match finalized summary",
    );
  }

  const taskById = new Map(plan.tasks.map((task) => [task.taskId, task]));
  const rowsBySplit: Record<
    DatasetSplit,
    MechanisticDatasetRow<
      FirstAggregateDatasetInput,
      FirstAggregateDatasetTarget
    >[]
  > = { train: [], validation: [], test: [] };
  const rowsByTask = new Map<
    string,
    MechanisticDatasetRow<
      FirstAggregateDatasetInput,
      FirstAggregateDatasetTarget
    >[]
  >();

  for (const row of rows) {
    if (row.schemaVersion !== MECHANISTIC_DATASET_ROW_SCHEMA_VERSION) {
      throw new RangeError("first aggregate benchmark received a stale row schema");
    }
    const task = taskById.get(row.taskId);
    if (task === undefined) {
      throw new RangeError(
        `first aggregate benchmark row references unknown task ${row.taskId}`,
      );
    }
    const identities: ReadonlyArray<readonly [string, unknown, unknown]> = [
      ["parameterPointId", row.parameterPointId, task.parameterPointId],
      ["runConditionId", row.runConditionId, task.runConditionId],
      [
        "interventionFamilyId",
        row.interventionFamilyId,
        task.interventionFamilyId,
      ],
      ["split", row.split, task.split],
      ["splitGroupKey", row.splitGroupKey, task.splitGroupKey],
      ["trajectoryKey", row.trajectoryKey, task.trajectoryKey],
      ["datasetVersion", row.sample.datasetVersion, task.datasetVersion],
      [
        "normalizationProfileId",
        row.sample.normalizationProfileId,
        task.normalizationProfileId,
      ],
    ];
    for (const [name, observed, expected] of identities) {
      if (observed !== expected) {
        throw new TypeError(
          `first aggregate benchmark row ${row.taskId} has wrong ${name}`,
        );
      }
    }
    if (
      canonicalJson(row.sample.datasetSchema) !== canonicalJson(task.datasetSchema) ||
      canonicalJson(row.sample.trajectory) !== canonicalJson(task.trajectory)
    ) {
      throw new TypeError(
        `first aggregate benchmark row ${row.taskId} has foreign sample identity`,
      );
    }
    validateAggregateTransition(row);

    rowsBySplit[row.split].push(row);
    const bucket = rowsByTask.get(row.taskId) ?? [];
    bucket.push(row);
    rowsByTask.set(row.taskId, bucket);
  }

  const expectedRowsPerTrajectory =
    plan.executionSchedule.totalTicks /
    plan.executionSchedule.snapshotEveryTicks;
  if (
    !Number.isSafeInteger(expectedRowsPerTrajectory) ||
    expectedRowsPerTrajectory < 1
  ) {
    throw new Error(
      "first aggregate benchmark package has a non-integral transition schedule",
    );
  }

  for (const task of plan.tasks) {
    const taskRows = rowsByTask.get(task.taskId) ?? [];
    if (taskRows.length !== expectedRowsPerTrajectory) {
      throw new RangeError(
        `first aggregate trajectory ${task.taskId} requires exactly ${expectedRowsPerTrajectory} transition rows`,
      );
    }
    const ordered = [...taskRows].sort(
      (left, right) =>
        left.sample.input.sourceSnapshotIndex -
        right.sample.input.sourceSnapshotIndex,
    );
    for (let index = 0; index < ordered.length; index += 1) {
      const row = ordered[index]!;
      if (
        row.sample.snapshotIndex !== index ||
        row.sample.input.sourceSnapshotIndex !== index ||
        row.sample.target.targetSnapshotIndex !== index + 1
      ) {
        throw new RangeError(
          `first aggregate trajectory ${task.taskId} has non-contiguous observation identity`,
        );
      }
      if (
        (index === ordered.length - 1) !==
        (row.sample.terminationReason !== undefined)
      ) {
        throw new TypeError(
          `first aggregate trajectory ${task.taskId} termination identity is invalid`,
        );
      }
      if (
        index === ordered.length - 1 &&
        row.sample.terminationReason !==
          "first-aggregate-heldout-horizon-complete"
      ) {
        throw new TypeError(
          `first aggregate trajectory ${task.taskId} has unexpected termination reason`,
        );
      }
    }
  }

  const observedSplitCounts: Record<DatasetSplit, number> = {
    train: rowsBySplit.train.length,
    validation: rowsBySplit.validation.length,
    test: rowsBySplit.test.length,
  };
  if (
    canonicalJson(observedSplitCounts) !==
      canonicalJson(summary.splitSampleCounts)
  ) {
    throw new RangeError(
      "first aggregate benchmark split sample counts do not match finalized summary",
    );
  }
  for (const split of ["train", "validation", "test"] as const) {
    if (rowsBySplit[split].length === 0) {
      throw new RangeError(
        `first aggregate benchmark requires non-empty ${split} evidence`,
      );
    }
  }

  return Object.freeze({
    rowsBySplit: Object.freeze({
      train: Object.freeze([...rowsBySplit.train]),
      validation: Object.freeze([...rowsBySplit.validation]),
      test: Object.freeze([...rowsBySplit.test]),
    }),
  });
}

function validateAggregateTransition(
  row: MechanisticDatasetRow<
    FirstAggregateDatasetInput,
    FirstAggregateDatasetTarget
  >,
): void {
  const input = row.sample.input;
  const target = row.sample.target;
  assertExactFiniteNumbers(
    input as unknown as Readonly<Record<string, number>>,
    [
      "sourceSnapshotIndex",
      "sourceTick",
      "sourceTimeHours",
      "totalBiomass",
      "totalResource",
      "occupiedCells",
    ],
    "first aggregate input",
  );
  assertExactFiniteNumbers(
    target as unknown as Readonly<Record<string, number>>,
    [
      "targetSnapshotIndex",
      "targetTick",
      "targetTimeHours",
      "forecastHorizonTicks",
      "forecastHorizonHours",
      "totalBiomass",
      "totalResource",
      "occupiedCells",
    ],
    "first aggregate target",
  );

  const schedule = createNodeMechanisticDatasetPackage().plan.executionSchedule;
  if (
    input.sourceSnapshotIndex !== row.sample.snapshotIndex ||
    input.sourceTick !==
      input.sourceSnapshotIndex * schedule.snapshotEveryTicks ||
    target.targetSnapshotIndex !== input.sourceSnapshotIndex + 1 ||
    target.targetTick - input.sourceTick !== schedule.snapshotEveryTicks ||
    target.forecastHorizonTicks !== schedule.snapshotEveryTicks ||
    row.sample.simulationTimeHours !== input.sourceTimeHours
  ) {
    throw new RangeError(
      "first aggregate transition position does not match authoritative schedule",
    );
  }
  if (
    target.targetTimeHours <= input.sourceTimeHours ||
    target.forecastHorizonHours <= 0 ||
    !numbersAgree(
      target.targetTimeHours - input.sourceTimeHours,
      target.forecastHorizonHours,
    )
  ) {
    throw new RangeError(
      "first aggregate transition biological-time horizon is invalid",
    );
  }
  for (const value of [
    input.totalBiomass,
    input.totalResource,
    input.occupiedCells,
    target.totalBiomass,
    target.totalResource,
    target.occupiedCells,
  ]) {
    if (value < 0) {
      throw new RangeError(
        "first aggregate state aggregates must be non-negative",
      );
    }
  }
  if (
    !Number.isSafeInteger(input.sourceSnapshotIndex) ||
    !Number.isSafeInteger(input.sourceTick) ||
    !Number.isSafeInteger(input.occupiedCells) ||
    !Number.isSafeInteger(target.targetSnapshotIndex) ||
    !Number.isSafeInteger(target.targetTick) ||
    !Number.isSafeInteger(target.forecastHorizonTicks) ||
    !Number.isSafeInteger(target.occupiedCells)
  ) {
    throw new RangeError(
      "first aggregate discrete transition fields must be safe integers",
    );
  }
}

function toTrainingRow(
  row: MechanisticDatasetRow<
    FirstAggregateDatasetInput,
    FirstAggregateDatasetTarget
  >,
): AggregateTrainingRow {
  return Object.freeze({
    features: featureRecord(row.sample.input),
    targets: targetRecord(row.sample.target),
  });
}

function featureRecord(
  input: FirstAggregateDatasetInput,
): Readonly<Record<string, number>> {
  return Object.freeze({
    sourceTick: input.sourceTick,
    totalBiomass: input.totalBiomass,
    totalResource: input.totalResource,
    occupiedCells: input.occupiedCells,
  });
}

function targetRecord(
  target: FirstAggregateDatasetTarget,
): Readonly<Record<AggregateTargetId, number>> {
  return Object.freeze({
    totalBiomass: target.totalBiomass,
    totalResource: target.totalResource,
    occupiedCells: target.occupiedCells,
  });
}

function evaluateSplit(
  rows: readonly MechanisticDatasetRow<
    FirstAggregateDatasetInput,
    FirstAggregateDatasetTarget
  >[],
  candidate: RidgeBaselineModel,
  baseline: ConstantBaselineModel,
): TrajectoryBalancedTransitionSeriesBenchmark {
  const groupKeys = uniqueSorted(rows.map((row) => row.splitGroupKey));
  const first = rows[0];
  if (first === undefined) {
    throw new RangeError("held-out transition split cannot be empty");
  }
  const horizonHours = first.sample.target.forecastHorizonHours;
  const evaluationRows: TransitionSeriesEvaluationRow[] = rows.map((row) => {
    const input = row.sample.input;
    const target = row.sample.target;
    if (!numbersAgree(target.forecastHorizonHours, horizonHours)) {
      throw new RangeError(
        "first aggregate benchmark requires one exact biological-time horizon",
      );
    }
    const features = featureRecord(input);
    return Object.freeze({
      schemaVersion: TRANSITION_SERIES_EVALUATION_ROW_SCHEMA_VERSION,
      groupKey: row.splitGroupKey,
      trajectoryKey: row.trajectoryKey,
      horizonId: HORIZON_ID,
      sourceSnapshotIndex: input.sourceSnapshotIndex,
      targetSnapshotIndex: target.targetSnapshotIndex,
      sourceTick: input.sourceTick,
      targetTick: target.targetTick,
      sourceTimeHours: input.sourceTimeHours,
      targetTimeHours: target.targetTimeHours,
      forecastHorizonTicks: target.forecastHorizonTicks,
      forecastHorizonHours: target.forecastHorizonHours,
      actual: targetRecord(target),
      candidate: predictAggregateBaseline(candidate, features),
      baseline: predictAggregateBaseline(baseline, features),
    });
  });

  return computeTrajectoryBalancedTransitionSeriesBenchmark({
    targetIds: FIRST_AGGREGATE_BENCHMARK_TARGET_IDS,
    requiredGroupKeys: groupKeys,
    requiredHorizons: [
      {
        id: HORIZON_ID,
        ticks:
          first.sample.target.forecastHorizonTicks,
        hours: horizonHours,
      },
    ],
    rows: evaluationRows,
  });
}

function assertExactFiniteNumbers(
  record: Readonly<Record<string, number>>,
  keys: readonly string[],
  label: string,
): void {
  const observed = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (observed.join("\u0000") !== expected.join("\u0000")) {
    throw new TypeError(`${label} must exactly match its v2 schema`);
  }
  for (const key of keys) {
    if (!Number.isFinite(record[key])) {
      throw new RangeError(`${label} field ${key} must be finite`);
    }
  }
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function requireDigest(name: string, value: string): void {
  if (
    typeof value !== "string" ||
    !/^fnv1a64-utf8-v1:[0-9a-f]{16}$/.test(value)
  ) {
    throw new TypeError(`${name} must be a finalized Petra dataset digest`);
  }
}

function numbersAgree(left: number, right: number): boolean {
  if (Object.is(left, right)) return true;
  const scale = Math.max(1, Math.abs(left), Math.abs(right));
  return Math.abs(left - right) <= 1e-12 * scale;
}
