import type { DatasetSplit } from "./dataset";
import {
  createNoInterventionSweepFamily,
} from "./executionDefinition";
import {
  canonicalJson,
  MECHANISTIC_DATASET_ROW_SCHEMA_VERSION,
  type MechanisticDatasetSummary,
} from "./generator";
import {
  mechanisticIncrementalPlanDigest,
  verifyMechanisticDatasetFinalization,
  type MechanisticDatasetFinalization,
} from "./incrementalGenerator";
import type {
  MechanisticSweepRunReport,
  MechanisticTaskFailure,
} from "./runner";
import {
  buildMechanisticSweepManifest,
  type MechanisticSweepPlan,
} from "./sweep";

export const MECHANISTIC_DATASET_EVIDENCE_SCHEMA_VERSION =
  "petra-ml-generation-evidence-v1" as const;

const DATASET_SPLITS = ["train", "validation", "test"] as const;
const MAX_NUMERIC_RANGE_PATHS = 256;

export interface FirstAggregateSweepReadinessOptions {
  readonly minimumSeedsPerGroup: number;
  readonly maximumTrajectories: number;
}

export interface FirstAggregateSweepReadiness {
  readonly ready: boolean;
  readonly reasons: readonly string[];
  readonly minimumSeedsPerGroup: number;
  readonly maximumTrajectories: number;
  readonly observedTrajectoryCount: number;
  readonly splitGroupCounts: Readonly<Record<DatasetSplit, number>>;
  readonly groupSeedCounts: Readonly<Record<string, number>>;
}

export interface MechanisticRuntimeMeasurement {
  readonly durationSeconds: number;
  readonly peakRssBytes?: number;
  readonly logicalCpuCount?: number;
  readonly workerCount?: number;
}

export interface MechanisticNumericRangeEvidence {
  readonly minimum: number;
  readonly maximum: number;
  readonly count: number;
}

export interface MechanisticFailureEvidence {
  readonly name: string;
  readonly message: string;
  readonly count: number;
}

export interface MechanisticDatasetGenerationEvidence {
  readonly schemaVersion: typeof MECHANISTIC_DATASET_EVIDENCE_SCHEMA_VERSION;
  readonly status: "complete" | "incomplete";
  readonly source: {
    readonly engineCommit: string;
    readonly repositoryDirty: boolean;
    readonly sourceStateMatchesCommit: boolean;
  };
  readonly plan: {
    readonly planDigest: string;
    readonly planVersion: string;
    readonly datasetVersion: string;
    readonly engineVersion: string;
    readonly scenarioId: string;
    readonly scenarioVersion: string;
    readonly normalizationProfileId: string;
    readonly datasetSchema: MechanisticDatasetSummary["datasetSchema"];
    readonly splitPolicyVersion: string;
    readonly splitCoveragePolicyVersion: string;
    readonly groupCount: number;
    readonly trajectoryCount: number;
    readonly splitGroupCounts: Readonly<Record<DatasetSplit, number>>;
    readonly splitTrajectoryCounts: Readonly<Record<DatasetSplit, number>>;
    readonly parameterSetHashes: readonly string[];
    readonly interventionFingerprints: readonly string[];
  };
  readonly run: {
    readonly resumedTrajectoryCount: number;
    readonly completedTrajectoryCount: number;
    readonly failedTrajectoryCount: number;
    readonly failures: readonly MechanisticFailureEvidence[];
  };
  readonly dataset: null | {
    readonly datasetDigest: string;
    readonly sampleCount: number;
    readonly splitSampleCounts: Readonly<Record<DatasetSplit, number>>;
    readonly terminationReasonCounts: Readonly<Record<string, number>>;
    readonly inputNumericRanges: Readonly<
      Record<string, MechanisticNumericRangeEvidence>
    >;
    readonly targetNumericRanges: Readonly<
      Record<string, MechanisticNumericRangeEvidence>
    >;
  };
  readonly runtime: MechanisticRuntimeMeasurement | null;
  readonly artifactIntegrityVerified: boolean;
  readonly promotionEvidence: false;
}

export interface BuildMechanisticDatasetGenerationEvidenceArgs {
  readonly plan: MechanisticSweepPlan;
  readonly runReport: MechanisticSweepRunReport;
  readonly engineCommit: string;
  readonly repositoryDirty: boolean;
  readonly runtime?: MechanisticRuntimeMeasurement;
  readonly finalization?: MechanisticDatasetFinalization;
  /**
   * Re-openable canonical JSONL source. Evidence verification and range
   * extraction intentionally use separate streaming passes rather than loading
   * a potentially large dataset into memory.
   */
  readonly datasetLines?: () => Iterable<string>;
}

/**
 * Checks whether a planned dataset is eligible to be Petra's first aggregate
 * no-intervention held-out sweep. It never invents parameter points or seeds.
 */
export function assessFirstAggregateSweepReadiness(
  plan: MechanisticSweepPlan,
  options: FirstAggregateSweepReadinessOptions,
): FirstAggregateSweepReadiness {
  mechanisticIncrementalPlanDigest(plan);
  requirePositiveSafeInteger(
    "minimumSeedsPerGroup",
    options.minimumSeedsPerGroup,
  );
  requirePositiveSafeInteger(
    "maximumTrajectories",
    options.maximumTrajectories,
  );

  const reasons = new Set<string>();
  const noInterventionFingerprint =
    createNoInterventionSweepFamily("no-intervention").fingerprint;
  const seedsByGroup = new Map<string, Set<number>>();

  for (const task of plan.tasks) {
    if (task.trajectory.interventionFingerprint !== noInterventionFingerprint) {
      reasons.add(
        "first aggregate sweep currently permits only the authoritative no-intervention schedule",
      );
    }
    let seeds = seedsByGroup.get(task.splitGroupKey);
    if (seeds === undefined) {
      seeds = new Set<number>();
      seedsByGroup.set(task.splitGroupKey, seeds);
    }
    seeds.add(task.trajectory.seed);
  }

  for (const split of DATASET_SPLITS) {
    if (plan.splitGroupCounts[split] < 1) {
      reasons.add(`first aggregate sweep requires at least one ${split} group`);
    }
  }

  for (const [groupKey, seeds] of seedsByGroup) {
    if (seeds.size < options.minimumSeedsPerGroup) {
      reasons.add(
        `group ${groupKey} has ${seeds.size} seed(s); requires at least ${options.minimumSeedsPerGroup}`,
      );
    }
  }

  if (plan.trajectoryCount > options.maximumTrajectories) {
    reasons.add(
      `planned trajectory count ${plan.trajectoryCount} exceeds first-sweep cap ${options.maximumTrajectories}`,
    );
  }

  const groupSeedCounts = Object.fromEntries(
    [...seedsByGroup.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([groupKey, seeds]) => [groupKey, seeds.size]),
  );

  return Object.freeze({
    ready: reasons.size === 0,
    reasons: Object.freeze([...reasons]),
    minimumSeedsPerGroup: options.minimumSeedsPerGroup,
    maximumTrajectories: options.maximumTrajectories,
    observedTrajectoryCount: plan.trajectoryCount,
    splitGroupCounts: Object.freeze({ ...plan.splitGroupCounts }),
    groupSeedCounts: Object.freeze(groupSeedCounts),
  });
}

/**
 * Builds compact, JSON-safe evidence for one mechanistic dataset generation
 * attempt. Complete evidence requires a verified incremental finalization and
 * a re-openable canonical JSONL source. Incomplete attempts remain explicit
 * and never receive a dataset digest or numeric-range summary.
 */
export function buildMechanisticDatasetGenerationEvidence(
  args: BuildMechanisticDatasetGenerationEvidenceArgs,
): MechanisticDatasetGenerationEvidence {
  const planDigest = mechanisticIncrementalPlanDigest(args.plan);
  const manifest = buildMechanisticSweepManifest(args.plan);
  validateCommitIdentity(args.engineCommit);
  if (typeof args.repositoryDirty !== "boolean") {
    throw new TypeError("repositoryDirty must be boolean");
  }
  validateRunReport(args.plan, args.runReport, planDigest);

  const runtime =
    args.runtime === undefined
      ? null
      : Object.freeze(validateRuntimeMeasurement(args.runtime));

  const parameterSetHashes = uniqueSorted(
    args.plan.tasks.map((task) => task.trajectory.group.parameterSetHash),
  );
  const interventionFingerprints = uniqueSorted(
    args.plan.tasks.map((task) => task.trajectory.interventionFingerprint),
  );

  let dataset: MechanisticDatasetGenerationEvidence["dataset"] = null;
  let status: MechanisticDatasetGenerationEvidence["status"] = "incomplete";

  if (args.finalization !== undefined) {
    if (args.datasetLines === undefined) {
      throw new TypeError(
        "complete dataset evidence requires a re-openable datasetLines source",
      );
    }
    if (args.runReport.failedTrajectoryCount !== 0) {
      throw new TypeError(
        "a finalized dataset cannot be paired with failed trajectory records",
      );
    }
    if (
      args.runReport.completedTrajectoryCount +
        args.runReport.resumedTrajectoryCount !==
      args.plan.trajectoryCount
    ) {
      throw new TypeError(
        "a finalized dataset requires every planned trajectory to be completed or resumed",
      );
    }

    validateFinalizationAgainstPlan(args.plan, args.finalization, planDigest);
    const scanned = scanFinalDataset(
      args.plan,
      args.finalization,
      args.datasetLines(),
    );
    verifyMechanisticDatasetFinalization(
      args.datasetLines(),
      args.finalization,
    );
    dataset = Object.freeze({
      datasetDigest: args.finalization.datasetDigest,
      sampleCount: args.finalization.summary.sampleCount,
      splitSampleCounts: Object.freeze({
        ...args.finalization.summary.splitSampleCounts,
      }),
      terminationReasonCounts: scanned.terminationReasonCounts,
      inputNumericRanges: scanned.inputNumericRanges,
      targetNumericRanges: scanned.targetNumericRanges,
    });
    status = "complete";
  } else if (args.datasetLines !== undefined) {
    throw new TypeError(
      "datasetLines must not be supplied without a finalization record",
    );
  }

  const failures = summarizeFailures(args.runReport);
  const evidence: MechanisticDatasetGenerationEvidence = {
    schemaVersion: MECHANISTIC_DATASET_EVIDENCE_SCHEMA_VERSION,
    status,
    source: Object.freeze({
      engineCommit: args.engineCommit,
      repositoryDirty: args.repositoryDirty,
      sourceStateMatchesCommit: !args.repositoryDirty,
    }),
    plan: Object.freeze({
      planDigest,
      planVersion: manifest.planVersion,
      datasetVersion: manifest.datasetVersion,
      engineVersion: manifest.engineVersion,
      scenarioId: manifest.scenarioId,
      scenarioVersion: manifest.scenarioVersion,
      normalizationProfileId: manifest.normalizationProfileId,
      datasetSchema: Object.freeze({ ...manifest.datasetSchema }),
      splitPolicyVersion: manifest.splitPolicyVersion,
      splitCoveragePolicyVersion: manifest.splitCoveragePolicyVersion,
      groupCount: manifest.groupCount,
      trajectoryCount: manifest.trajectoryCount,
      splitGroupCounts: Object.freeze({ ...manifest.splitGroupCounts }),
      splitTrajectoryCounts: Object.freeze({ ...manifest.splitCounts }),
      parameterSetHashes: Object.freeze(parameterSetHashes),
      interventionFingerprints: Object.freeze(interventionFingerprints),
    }),
    run: Object.freeze({
      resumedTrajectoryCount: args.runReport.resumedTrajectoryCount,
      completedTrajectoryCount: args.runReport.completedTrajectoryCount,
      failedTrajectoryCount: args.runReport.failedTrajectoryCount,
      failures: Object.freeze(failures),
    }),
    dataset,
    runtime,
    artifactIntegrityVerified: status === "complete",
    promotionEvidence: false,
  };

  canonicalJson(evidence);
  return deepFreeze(evidence);
}

function validateRunReport(
  plan: MechanisticSweepPlan,
  report: MechanisticSweepRunReport,
  planDigest: string,
): void {
  if (report.schemaVersion !== "petra-ml-run-report-v1") {
    throw new RangeError("unsupported mechanistic run report version");
  }
  if (report.planDigest !== planDigest) {
    throw new TypeError("run report belongs to a different sweep plan");
  }
  if (report.plannedTrajectoryCount !== plan.trajectoryCount) {
    throw new RangeError("run report planned trajectory count mismatch");
  }
  if (report.records.length !== plan.tasks.length) {
    throw new RangeError("run report record count mismatch");
  }

  let resumed = 0;
  let completed = 0;
  let failed = 0;
  for (let index = 0; index < plan.tasks.length; index += 1) {
    const task = plan.tasks[index]!;
    const record = report.records[index]!;
    if (
      record.taskId !== task.taskId ||
      record.trajectoryKey !== task.trajectoryKey
    ) {
      throw new TypeError(
        `run report record ${index} does not match canonical sweep task order`,
      );
    }
    if (record.status === "resumed") resumed += 1;
    else if (record.status === "completed") completed += 1;
    else if (record.status === "failed") {
      failed += 1;
      validateFailure(record.failure);
    } else {
      throw new TypeError("run report contains an unknown task status");
    }
  }

  if (
    resumed !== report.resumedTrajectoryCount ||
    completed !== report.completedTrajectoryCount ||
    failed !== report.failedTrajectoryCount
  ) {
    throw new RangeError("run report aggregate counts do not match its records");
  }
}

function validateFinalizationAgainstPlan(
  plan: MechanisticSweepPlan,
  finalization: MechanisticDatasetFinalization,
  planDigest: string,
): void {
  if (finalization.planDigest !== planDigest) {
    throw new TypeError("dataset finalization belongs to a different sweep plan");
  }
  const summary = finalization.summary;
  const scalarPairs: ReadonlyArray<readonly [string, unknown, unknown]> = [
    ["planVersion", summary.planVersion, plan.planVersion],
    ["datasetVersion", summary.datasetVersion, plan.datasetVersion],
    ["engineVersion", summary.engineVersion, plan.engineVersion],
    ["scenarioId", summary.scenarioId, plan.scenarioId],
    ["scenarioVersion", summary.scenarioVersion, plan.scenarioVersion],
    [
      "normalizationProfileId",
      summary.normalizationProfileId,
      plan.normalizationProfileId,
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
  for (const [name, observed, expected] of scalarPairs) {
    if (observed !== expected) {
      throw new TypeError(
        `dataset finalization ${name} does not match sweep plan`,
      );
    }
  }
  if (
    canonicalJson(summary.datasetSchema) !== canonicalJson(plan.datasetSchema) ||
    canonicalJson(summary.splitGroupCounts) !==
      canonicalJson(plan.splitGroupCounts) ||
    canonicalJson(summary.splitTrajectoryCounts) !==
      canonicalJson(plan.splitTrajectoryCounts)
  ) {
    throw new TypeError("dataset finalization summary identity does not match sweep plan");
  }
  if (finalization.trajectories.length !== plan.tasks.length) {
    throw new RangeError("dataset finalization trajectory count mismatch");
  }

  for (let index = 0; index < plan.tasks.length; index += 1) {
    const task = plan.tasks[index]!;
    const record = finalization.trajectories[index]!;
    if (
      record.planDigest !== planDigest ||
      record.taskId !== task.taskId ||
      record.trajectoryKey !== task.trajectoryKey ||
      record.split !== task.split
    ) {
      throw new TypeError(
        `dataset finalization trajectory ${index} does not match canonical sweep task identity`,
      );
    }
    if (!Number.isSafeInteger(record.rowCount) || record.rowCount < 1) {
      throw new RangeError(
        `dataset finalization trajectory ${task.taskId} has invalid rowCount`,
      );
    }
  }
}

function scanFinalDataset(
  plan: MechanisticSweepPlan,
  finalization: MechanisticDatasetFinalization,
  lines: Iterable<string>,
): {
  readonly terminationReasonCounts: Readonly<Record<string, number>>;
  readonly inputNumericRanges: Readonly<
    Record<string, MechanisticNumericRangeEvidence>
  >;
  readonly targetNumericRanges: Readonly<
    Record<string, MechanisticNumericRangeEvidence>
  >;
} {
  const taskById = new Map(plan.tasks.map((task) => [task.taskId, task]));
  const expectedRows = new Map(
    finalization.trajectories.map((record) => [record.taskId, record.rowCount]),
  );
  const observedRows = new Map<string, number>();
  const terminalByTask = new Set<string>();
  const terminations = new Map<string, number>();
  const inputRanges = new Map<string, MutableRange>();
  const targetRanges = new Map<string, MutableRange>();

  for (const line of lines) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      throw new TypeError(
        `final dataset contains invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const row = requireRecord("dataset row", parsed);
    if (row.schemaVersion !== MECHANISTIC_DATASET_ROW_SCHEMA_VERSION) {
      throw new RangeError("final dataset contains an unsupported row version");
    }
    const taskId = requireString("dataset row taskId", row.taskId);
    const task = taskById.get(taskId);
    if (task === undefined) {
      throw new RangeError(`final dataset contains unknown task ${taskId}`);
    }
    if (row.split !== task.split) {
      throw new TypeError(`dataset row for ${taskId} has the wrong split`);
    }
    const rowIdentity: ReadonlyArray<readonly [string, unknown, string]> = [
      ["parameterPointId", row.parameterPointId, task.parameterPointId],
      ["interventionFamilyId", row.interventionFamilyId, task.interventionFamilyId],
      ["splitGroupKey", row.splitGroupKey, task.splitGroupKey],
      ["trajectoryKey", row.trajectoryKey, task.trajectoryKey],
    ];
    for (const [name, observed, expected] of rowIdentity) {
      if (observed !== expected) {
        throw new TypeError(
          `dataset row for ${taskId} has the wrong ${name}`,
        );
      }
    }

    observedRows.set(taskId, (observedRows.get(taskId) ?? 0) + 1);
    const sample = requireRecord("dataset row sample", row.sample);
    collectNumericRanges(sample.input, "", inputRanges);
    collectNumericRanges(sample.target, "", targetRanges);

    if (sample.terminationReason !== undefined) {
      const reason = requireCanonicalText(
        "sample terminationReason",
        sample.terminationReason,
      );
      if (terminalByTask.has(taskId)) {
        throw new RangeError(
          `dataset task ${taskId} has multiple termination reasons`,
        );
      }
      terminalByTask.add(taskId);
      terminations.set(reason, (terminations.get(reason) ?? 0) + 1);
    }
  }

  for (const task of plan.tasks) {
    const expected = expectedRows.get(task.taskId);
    if (expected === undefined) {
      throw new RangeError(
        `dataset finalization is missing trajectory ${task.taskId}`,
      );
    }
    if ((observedRows.get(task.taskId) ?? 0) !== expected) {
      throw new RangeError(
        `dataset row count for ${task.taskId} does not match finalization`,
      );
    }
    if (!terminalByTask.has(task.taskId)) {
      throw new TypeError(
        `dataset task ${task.taskId} has no terminal reason`,
      );
    }
  }

  return Object.freeze({
    terminationReasonCounts: freezeCountMap(terminations),
    inputNumericRanges: freezeRangeMap(inputRanges),
    targetNumericRanges: freezeRangeMap(targetRanges),
  });
}

interface MutableRange {
  minimum: number;
  maximum: number;
  count: number;
}

function collectNumericRanges(
  value: unknown,
  path: string,
  ranges: Map<string, MutableRange>,
): void {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(
        `dataset numeric value at ${path || "<root>"} must be finite`,
      );
    }
    const key = path || "<root>";
    let range = ranges.get(key);
    if (range === undefined) {
      if (ranges.size >= MAX_NUMERIC_RANGE_PATHS) {
        throw new RangeError(
          `dataset evidence exceeds compact numeric-range path cap ${MAX_NUMERIC_RANGE_PATHS}`,
        );
      }
      range = { minimum: value, maximum: value, count: 0 };
      ranges.set(key, range);
    }
    range.minimum = Math.min(range.minimum, value);
    range.maximum = Math.max(range.maximum, value);
    range.count += 1;
    return;
  }

  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      collectNumericRanges(item, `${path}[${index}]`, ranges);
    });
    return;
  }
  if (typeof value !== "object") {
    throw new TypeError(
      `dataset value at ${path || "<root>"} is not JSON-compatible`,
    );
  }

  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    const nestedPath = path.length === 0 ? key : `${path}.${key}`;
    collectNumericRanges(
      (value as Record<string, unknown>)[key],
      nestedPath,
      ranges,
    );
  }
}

function summarizeFailures(
  report: MechanisticSweepRunReport,
): MechanisticFailureEvidence[] {
  const grouped = new Map<string, MechanisticFailureEvidence>();
  for (const record of report.records) {
    if (record.status !== "failed") continue;
    const key = `${record.failure.name.length}:${record.failure.name}${record.failure.message.length}:${record.failure.message}`;
    const existing = grouped.get(key);
    grouped.set(
      key,
      Object.freeze({
        name: record.failure.name,
        message: record.failure.message,
        count: (existing?.count ?? 0) + 1,
      }),
    );
  }
  return [...grouped.values()].sort(
    (left, right) =>
      left.name.localeCompare(right.name) ||
      left.message.localeCompare(right.message),
  );
}

function validateFailure(failure: MechanisticTaskFailure): void {
  requireCanonicalText("failure name", failure.name);
  requireCanonicalText("failure message", failure.message);
}

function validateRuntimeMeasurement(
  runtime: MechanisticRuntimeMeasurement,
): MechanisticRuntimeMeasurement {
  requireFiniteNonNegative("runtime durationSeconds", runtime.durationSeconds);
  if (runtime.peakRssBytes !== undefined) {
    requireNonNegativeSafeInteger("runtime peakRssBytes", runtime.peakRssBytes);
  }
  if (runtime.logicalCpuCount !== undefined) {
    requirePositiveSafeInteger("runtime logicalCpuCount", runtime.logicalCpuCount);
  }
  if (runtime.workerCount !== undefined) {
    requirePositiveSafeInteger("runtime workerCount", runtime.workerCount);
  }
  return { ...runtime };
}

function freezeRangeMap(
  ranges: Map<string, MutableRange>,
): Readonly<Record<string, MechanisticNumericRangeEvidence>> {
  return Object.freeze(
    Object.fromEntries(
      [...ranges.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([path, range]) => [
          path,
          Object.freeze({
            minimum: range.minimum,
            maximum: range.maximum,
            count: range.count,
          }),
        ]),
    ),
  );
}

function freezeCountMap(
  counts: Map<string, number>,
): Readonly<Record<string, number>> {
  return Object.freeze(
    Object.fromEntries(
      [...counts.entries()].sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
  );
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function validateCommitIdentity(value: string): void {
  if (!/^[0-9a-f]{40}$/.test(value) && !/^[0-9a-f]{64}$/.test(value)) {
    throw new TypeError(
      "engineCommit must be an exact lowercase 40- or 64-hex commit identity",
    );
  }
}

function requireRecord(
  name: string,
  value: unknown,
): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireString(name: string, value: unknown): string {
  if (typeof value !== "string") {
    throw new TypeError(`${name} must be a string`);
  }
  return value;
}

function requireCanonicalText(name: string, value: unknown): string {
  const text = requireString(name, value);
  if (text.length === 0 || text !== text.trim()) {
    throw new TypeError(`${name} must be non-empty canonical text`);
  }
  return text;
}

function requireFiniteNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be finite and non-negative`);
  }
}

function requirePositiveSafeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
}

function requireNonNegativeSafeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const nested of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nested);
  }
  return Object.freeze(value);
}
