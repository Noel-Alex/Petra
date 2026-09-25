import {
  MECHANISTIC_DATASET_ARTIFACT_SCHEMA_VERSION,
  MECHANISTIC_DATASET_ROW_SCHEMA_VERSION,
  canonicalJson,
  validatePlanForCollection,
  validateTrajectoryResult,
  type MechanisticDatasetRow,
  type MechanisticDatasetSummary,
  type MechanisticTrajectoryResult,
} from "./generator";
import type { DatasetSplit, MechanisticSample } from "./dataset";
import type { MechanisticSweepPlan, MechanisticSweepTask } from "./sweep";

export const MECHANISTIC_INCREMENTAL_STAGE_SCHEMA_VERSION =
  "petra-ml-incremental-stage-v1" as const;
export const MECHANISTIC_INCREMENTAL_FINALIZATION_SCHEMA_VERSION =
  "petra-ml-incremental-finalization-v1" as const;
export const MECHANISTIC_INCREMENTAL_DIGEST_ALGORITHM =
  "fnv1a64-utf8-v1" as const;

export interface MechanisticStagedTrajectoryRecord {
  readonly schemaVersion: typeof MECHANISTIC_INCREMENTAL_STAGE_SCHEMA_VERSION;
  readonly planDigest: string;
  readonly taskId: string;
  readonly trajectoryKey: string;
  readonly split: DatasetSplit;
  readonly rowCount: number;
  readonly rowDigest: string;
}

export interface MechanisticTrajectoryStageWriter {
  /** Writes one canonical JSON row without a trailing newline. */
  writeRow(line: string): void;
  /** Atomically makes the staged trajectory visible to listCommitted(). */
  commit(record: MechanisticStagedTrajectoryRecord): void;
  /** Discards transient rows; it must not create a committed record. */
  abort(): void;
}

/**
 * Storage boundary for local/backend runners. Implementations may use files,
 * object storage, a database, or another durable medium. The core collector
 * deliberately has no Node/browser storage dependency.
 */
export interface MechanisticIncrementalStagingStore {
  listCommitted(): readonly MechanisticStagedTrajectoryRecord[];
  beginTrajectory(taskId: string): MechanisticTrajectoryStageWriter;
  readRows(taskId: string): Iterable<string>;
}

export interface MechanisticDatasetFinalization {
  readonly schemaVersion: typeof MECHANISTIC_INCREMENTAL_FINALIZATION_SCHEMA_VERSION;
  readonly planDigest: string;
  readonly digestAlgorithm: typeof MECHANISTIC_INCREMENTAL_DIGEST_ALGORITHM;
  readonly datasetDigest: string;
  readonly summary: MechanisticDatasetSummary;
  readonly trajectories: readonly MechanisticStagedTrajectoryRecord[];
}

export interface MechanisticDatasetFinalOutput {
  /** Starts a fresh non-final target. Never append to a prior partial target. */
  begin(planDigest: string): void;
  /** Writes one canonical JSON row without a trailing newline. */
  writeRow(line: string): void;
  /** Publishes the completion record last; only then is output promotable. */
  commit(finalization: MechanisticDatasetFinalization): void;
  /** Leaves no completion record behind after a failed finalization. */
  abort(): void;
}

export interface MechanisticIncrementalProgress {
  readonly plannedTrajectoryCount: number;
  readonly stagedTrajectoryCount: number;
  readonly complete: boolean;
}

/**
 * Bounded-memory collector for large mechanistic sweeps.
 *
 * A completed trajectory is validated and streamed into injected staging one
 * row at a time. Only small per-task integrity records are retained in memory.
 * On resume, committed staging records are reloaded and checked against the
 * exact sweep-plan digest. Finalization rereads staged rows in canonical plan
 * order, verifies every staged count/digest, and publishes the completion
 * record only after the final row has been written.
 */
export class IncrementalMechanisticDatasetCollector<TInput, TTarget> {
  readonly planDigest: string;

  private readonly taskById: ReadonlyMap<string, MechanisticSweepTask>;
  private readonly stagedByTaskId = new Map<
    string,
    MechanisticStagedTrajectoryRecord
  >();

  constructor(
    private readonly plan: MechanisticSweepPlan,
    private readonly staging: MechanisticIncrementalStagingStore,
  ) {
    this.taskById = validatePlanForCollection(plan);
    this.planDigest = mechanisticIncrementalPlanDigest(plan);

    for (const record of staging.listCommitted()) {
      this.registerCommittedRecord(record);
    }
  }

  get progress(): MechanisticIncrementalProgress {
    return Object.freeze({
      plannedTrajectoryCount: this.plan.tasks.length,
      stagedTrajectoryCount: this.stagedByTaskId.size,
      complete: this.stagedByTaskId.size === this.plan.tasks.length,
    });
  }

  /** True only after this exact plan's committed stage record was validated. */
  hasStagedTrajectory(taskId: string): boolean {
    return this.stagedByTaskId.has(taskId);
  }

  stageTrajectory(
    result: MechanisticTrajectoryResult<TInput, TTarget>,
  ): MechanisticStagedTrajectoryRecord {
    const task = this.taskById.get(result.taskId);
    if (task === undefined) {
      throw new RangeError(
        `trajectory result references unknown task ${result.taskId}`,
      );
    }
    validateTrajectoryResult(task, result.samples);

    const existing = this.stagedByTaskId.get(task.taskId);
    if (existing !== undefined) {
      const observed = streamTrajectoryRows(task, result.samples);
      if (
        observed.rowCount !== existing.rowCount ||
        observed.rowDigest !== existing.rowDigest
      ) {
        throw new RangeError(
          `trajectory ${task.taskId} is already staged with different content`,
        );
      }
      return existing;
    }

    const writer = this.staging.beginTrajectory(task.taskId);
    try {
      const observed = streamTrajectoryRows(task, result.samples, (line) => {
        writer.writeRow(line);
      });
      const record = freezeStageRecord({
        schemaVersion: MECHANISTIC_INCREMENTAL_STAGE_SCHEMA_VERSION,
        planDigest: this.planDigest,
        taskId: task.taskId,
        trajectoryKey: task.trajectoryKey,
        split: task.split,
        rowCount: observed.rowCount,
        rowDigest: observed.rowDigest,
      });
      writer.commit(record);
      this.stagedByTaskId.set(task.taskId, record);
      return record;
    } catch (error) {
      try {
        writer.abort();
      } catch {
        // Preserve the authority-validation/write error; storage cleanup can be
        // retried by the runner and must not make a failed stage look committed.
      }
      throw error;
    }
  }

  finalize(output: MechanisticDatasetFinalOutput): MechanisticDatasetFinalization {
    if (this.stagedByTaskId.size !== this.plan.tasks.length) {
      const missing = this.plan.tasks
        .filter((task) => !this.stagedByTaskId.has(task.taskId))
        .map((task) => task.taskId);
      throw new RangeError(
        `incremental dataset is incomplete: ${missing.length} planned trajectories are not staged`,
      );
    }

    const datasetHasher = new Fnv1a64Utf8();
    const splitSampleCounts = emptySplitCounts();
    const canonicalRecords: MechanisticStagedTrajectoryRecord[] = [];
    let sampleCount = 0;
    let began = false;

    try {
      output.begin(this.planDigest);
      began = true;

      for (const task of this.plan.tasks) {
        const expected = this.stagedByTaskId.get(task.taskId);
        if (expected === undefined) {
          throw new RangeError(`missing staged trajectory ${task.taskId}`);
        }

        const taskHasher = new Fnv1a64Utf8();
        let rowCount = 0;
        for (const line of this.staging.readRows(task.taskId)) {
          validateStoredLine(task.taskId, line);
          rowCount += 1;
          if (!Number.isSafeInteger(rowCount) || rowCount > expected.rowCount) {
            throw new RangeError(
              `staged trajectory ${task.taskId} row count exceeds committed metadata`,
            );
          }
          taskHasher.updateLine(line);
          datasetHasher.updateLine(line);
          output.writeRow(line);
        }

        if (rowCount !== expected.rowCount) {
          throw new RangeError(
            `staged trajectory ${task.taskId} row count mismatch: expected ${expected.rowCount}, received ${rowCount}`,
          );
        }
        const rowDigest = taskHasher.digest();
        if (rowDigest !== expected.rowDigest) {
          throw new RangeError(
            `staged trajectory ${task.taskId} digest mismatch; staging is truncated or corrupted`,
          );
        }

        sampleCount = safeAdd(
          sampleCount,
          rowCount,
          "incremental dataset sample count",
        );
        splitSampleCounts[task.split] = safeAdd(
          splitSampleCounts[task.split],
          rowCount,
          `incremental ${task.split} sample count`,
        );
        canonicalRecords.push(expected);
      }

      const summary = buildDatasetSummary(
        this.plan,
        splitSampleCounts,
        sampleCount,
      );
      const finalization: MechanisticDatasetFinalization = Object.freeze({
        schemaVersion: MECHANISTIC_INCREMENTAL_FINALIZATION_SCHEMA_VERSION,
        planDigest: this.planDigest,
        digestAlgorithm: MECHANISTIC_INCREMENTAL_DIGEST_ALGORITHM,
        datasetDigest: datasetHasher.digest(),
        summary,
        trajectories: Object.freeze([...canonicalRecords]),
      });
      canonicalJson(finalization);
      output.commit(finalization);
      return finalization;
    } catch (error) {
      if (began) {
        try {
          output.abort();
        } catch {
          // A cleanup failure must not replace the deterministic integrity error.
        }
      }
      throw error;
    }
  }

  private registerCommittedRecord(
    candidate: MechanisticStagedTrajectoryRecord,
  ): void {
    const record = validateStageRecord(candidate, this.planDigest, this.taskById);
    if (this.stagedByTaskId.has(record.taskId)) {
      throw new RangeError(
        `incremental staging contains duplicate committed task ${record.taskId}`,
      );
    }
    this.stagedByTaskId.set(record.taskId, record);
  }
}

/**
 * Verifies a completed JSONL row stream against its final completion record.
 * This is an accidental-corruption/truncation check, not a cryptographic
 * authenticity mechanism.
 */
export function verifyMechanisticDatasetFinalization(
  lines: Iterable<string>,
  finalization: MechanisticDatasetFinalization,
): void {
  if (
    finalization.schemaVersion !==
    MECHANISTIC_INCREMENTAL_FINALIZATION_SCHEMA_VERSION
  ) {
    throw new RangeError("unsupported incremental dataset finalization version");
  }
  if (finalization.digestAlgorithm !== MECHANISTIC_INCREMENTAL_DIGEST_ALGORITHM) {
    throw new RangeError("unsupported incremental dataset digest algorithm");
  }
  validateDigest("planDigest", finalization.planDigest);
  validateDigest("datasetDigest", finalization.datasetDigest);

  const hasher = new Fnv1a64Utf8();
  let rowCount = 0;
  for (const line of lines) {
    validateStoredLine("final dataset", line);
    rowCount += 1;
    if (!Number.isSafeInteger(rowCount)) {
      throw new RangeError("final dataset row count exceeds safe integer range");
    }
    hasher.updateLine(line);
  }

  if (rowCount !== finalization.summary.sampleCount) {
    throw new RangeError(
      `final dataset row count mismatch: expected ${finalization.summary.sampleCount}, received ${rowCount}`,
    );
  }
  if (hasher.digest() !== finalization.datasetDigest) {
    throw new RangeError(
      "final dataset digest mismatch; output is truncated or corrupted",
    );
  }
}

/** Stable identity for the exact collection plan used by resume/finalization. */
export function mechanisticIncrementalPlanDigest(
  plan: MechanisticSweepPlan,
): string {
  validatePlanForCollection(plan);
  return digestCanonicalValue({
    planVersion: plan.planVersion,
    datasetVersion: plan.datasetVersion,
    engineVersion: plan.engineVersion,
    scenarioId: plan.scenarioId,
    scenarioVersion: plan.scenarioVersion,
    normalizationProfileId: plan.normalizationProfileId,
    datasetSchema: plan.datasetSchema,
    executionSchedule: plan.executionSchedule,
    executionScheduleIdentity: plan.executionScheduleIdentity,
    splitPolicy: plan.splitPolicy,
    splitCoveragePolicy: plan.splitCoveragePolicy,
    groupCount: plan.groupCount,
    trajectoryCount: plan.trajectoryCount,
    splitGroupCounts: plan.splitGroupCounts,
    splitTrajectoryCounts: plan.splitTrajectoryCounts,
    tasks: plan.tasks.map((task) => ({
      taskId: task.taskId,
      datasetVersion: task.datasetVersion,
      normalizationProfileId: task.normalizationProfileId,
      datasetSchema: task.datasetSchema,
      executionSchedule: task.executionSchedule,
      executionScheduleIdentity: task.executionScheduleIdentity,
      parameterPointId: task.parameterPointId,
      runConditionId: task.runConditionId,
      interventionFamilyId: task.interventionFamilyId,
      split: task.split,
      trajectory: task.trajectory,
      splitGroupKey: task.splitGroupKey,
      trajectoryKey: task.trajectoryKey,
    })),
  });
}

function streamTrajectoryRows<TInput, TTarget>(
  task: MechanisticSweepTask,
  samples: readonly MechanisticSample<TInput, TTarget>[],
  onLine?: (line: string) => void,
): { readonly rowCount: number; readonly rowDigest: string } {
  const hasher = new Fnv1a64Utf8();
  let rowCount = 0;

  for (const sample of samples) {
    const row: MechanisticDatasetRow<TInput, TTarget> = {
      schemaVersion: MECHANISTIC_DATASET_ROW_SCHEMA_VERSION,
      taskId: task.taskId,
      parameterPointId: task.parameterPointId,
      runConditionId: task.runConditionId,
      interventionFamilyId: task.interventionFamilyId,
      split: task.split,
      splitGroupKey: task.splitGroupKey,
      trajectoryKey: task.trajectoryKey,
      sample: structuredClone(sample),
    };
    const line = canonicalJson(row);
    hasher.updateLine(line);
    onLine?.(line);
    rowCount += 1;
  }

  return Object.freeze({ rowCount, rowDigest: hasher.digest() });
}

function validateStageRecord(
  candidate: MechanisticStagedTrajectoryRecord,
  planDigest: string,
  taskById: ReadonlyMap<string, MechanisticSweepTask>,
): MechanisticStagedTrajectoryRecord {
  if (
    candidate === null ||
    typeof candidate !== "object" ||
    Array.isArray(candidate)
  ) {
    throw new TypeError(
      "committed incremental trajectory record must be an object",
    );
  }
  if (candidate.schemaVersion !== MECHANISTIC_INCREMENTAL_STAGE_SCHEMA_VERSION) {
    throw new RangeError("unsupported incremental trajectory stage version");
  }
  if (candidate.planDigest !== planDigest) {
    throw new TypeError(
      "committed incremental trajectory belongs to a different sweep plan",
    );
  }
  validateDigest("staged planDigest", candidate.planDigest);
  validateDigest("staged rowDigest", candidate.rowDigest);

  const task = taskById.get(candidate.taskId);
  if (task === undefined) {
    throw new RangeError(
      `committed incremental trajectory references unknown task ${candidate.taskId}`,
    );
  }
  if (candidate.trajectoryKey !== task.trajectoryKey) {
    throw new TypeError(
      `committed incremental trajectory ${task.taskId} has the wrong trajectoryKey`,
    );
  }
  if (candidate.split !== task.split) {
    throw new TypeError(
      `committed incremental trajectory ${task.taskId} has the wrong split`,
    );
  }
  if (!Number.isSafeInteger(candidate.rowCount) || candidate.rowCount < 1) {
    throw new RangeError(
      `committed incremental trajectory ${task.taskId} rowCount must be a positive safe integer`,
    );
  }

  return freezeStageRecord(candidate);
}

function freezeStageRecord(
  record: MechanisticStagedTrajectoryRecord,
): MechanisticStagedTrajectoryRecord {
  return Object.freeze({ ...record });
}

function buildDatasetSummary(
  plan: MechanisticSweepPlan,
  splitSampleCounts: Readonly<Record<DatasetSplit, number>>,
  sampleCount: number,
): MechanisticDatasetSummary {
  const summary: MechanisticDatasetSummary = {
    schemaVersion: MECHANISTIC_DATASET_ARTIFACT_SCHEMA_VERSION,
    planVersion: plan.planVersion,
    datasetVersion: plan.datasetVersion,
    engineVersion: plan.engineVersion,
    scenarioId: plan.scenarioId,
    scenarioVersion: plan.scenarioVersion,
    normalizationProfileId: plan.normalizationProfileId,
    datasetSchema: Object.freeze({ ...plan.datasetSchema }),
    executionSchedule: Object.freeze({ ...plan.executionSchedule }),
    executionScheduleIdentity: plan.executionScheduleIdentity,
    splitPolicyVersion: plan.splitPolicy.version,
    splitCoveragePolicyVersion: plan.splitCoveragePolicy.version,
    groupCount: plan.groupCount,
    trajectoryCount: plan.trajectoryCount,
    sampleCount,
    splitGroupCounts: Object.freeze({ ...plan.splitGroupCounts }),
    splitTrajectoryCounts: Object.freeze({ ...plan.splitTrajectoryCounts }),
    splitSampleCounts: Object.freeze({ ...splitSampleCounts }),
  };
  canonicalJson(summary);
  return Object.freeze(summary);
}

function emptySplitCounts(): Record<DatasetSplit, number> {
  return { train: 0, validation: 0, test: 0 };
}

function safeAdd(left: number, right: number, label: string): number {
  const value = left + right;
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} exceeds safe integer range`);
  }
  return value;
}

function validateStoredLine(context: string, line: string): void {
  if (typeof line !== "string" || line.length === 0) {
    throw new TypeError(`${context} contains an empty/non-string staged row`);
  }
  if (line.includes("\n") || line.includes("\r")) {
    throw new TypeError(
      `${context} staged rows must not contain literal newlines`,
    );
  }
}

function digestCanonicalValue(value: unknown): string {
  const hasher = new Fnv1a64Utf8();
  hasher.update(canonicalJson(value));
  return hasher.digest();
}

function validateDigest(name: string, value: string): void {
  const prefix = `${MECHANISTIC_INCREMENTAL_DIGEST_ALGORITHM}:`;
  if (
    !value.startsWith(prefix) ||
    !/^[0-9a-f]{16}$/.test(value.slice(prefix.length))
  ) {
    throw new TypeError(
      `${name} must be a ${MECHANISTIC_INCREMENTAL_DIGEST_ALGORITHM} digest`,
    );
  }
}

class Fnv1a64Utf8 {
  private value = 0xcbf29ce484222325n;
  private static readonly prime = 0x100000001b3n;
  private static readonly encoder = new TextEncoder();

  update(text: string): void {
    for (const byte of Fnv1a64Utf8.encoder.encode(text)) {
      this.value ^= BigInt(byte);
      this.value = BigInt.asUintN(64, this.value * Fnv1a64Utf8.prime);
    }
  }

  updateLine(line: string): void {
    this.update(line);
    this.update("\n");
  }

  digest(): string {
    return `${MECHANISTIC_INCREMENTAL_DIGEST_ALGORITHM}:${this.value
      .toString(16)
      .padStart(16, "0")}`;
  }
}
