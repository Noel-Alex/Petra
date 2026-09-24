import {
  assignDatasetSplit,
  splitGroupKey,
  trajectoryKey,
  validateMechanisticSample,
  type DatasetSplit,
  type MechanisticSample,
} from "./dataset";
import {
  validateSplitCoveragePolicy,
  type MechanisticSweepPlan,
  type MechanisticSweepTask,
} from "./sweep";

export const MECHANISTIC_DATASET_ARTIFACT_SCHEMA_VERSION =
  "petra-ml-dataset-artifact-v2" as const;
export const MECHANISTIC_DATASET_ROW_SCHEMA_VERSION =
  "petra-ml-dataset-row-v2" as const;

export interface MechanisticTrajectoryResult<TInput, TTarget> {
  readonly taskId: string;
  readonly samples: readonly MechanisticSample<TInput, TTarget>[];
}

export interface MechanisticDatasetRow<TInput, TTarget> {
  readonly schemaVersion: typeof MECHANISTIC_DATASET_ROW_SCHEMA_VERSION;
  readonly taskId: string;
  readonly parameterPointId: string;
  readonly interventionFamilyId: string;
  readonly split: DatasetSplit;
  readonly splitGroupKey: string;
  readonly trajectoryKey: string;
  readonly sample: MechanisticSample<TInput, TTarget>;
}

export interface MechanisticDatasetSummary {
  readonly schemaVersion: typeof MECHANISTIC_DATASET_ARTIFACT_SCHEMA_VERSION;
  readonly planVersion: string;
  readonly datasetVersion: string;
  readonly engineVersion: string;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly normalizationProfileId: string;
  readonly splitPolicyVersion: string;
  readonly splitCoveragePolicyVersion: string;
  readonly groupCount: number;
  readonly trajectoryCount: number;
  readonly sampleCount: number;
  readonly splitGroupCounts: Readonly<Record<DatasetSplit, number>>;
  readonly splitTrajectoryCounts: Readonly<Record<DatasetSplit, number>>;
  readonly splitSampleCounts: Readonly<Record<DatasetSplit, number>>;
}

export interface MechanisticDatasetArtifact<TInput, TTarget> {
  readonly summary: MechanisticDatasetSummary;
  readonly rows: readonly MechanisticDatasetRow<TInput, TTarget>[];
}

/**
 * Converts completed authoritative sweep results into a deterministic dataset
 * artifact. Results may arrive in any order; rows are emitted in the original
 * sweep-task order and then by contiguous snapshotIndex.
 *
 * A sweep plan is intentionally not evidence that simulation happened. This
 * function refuses missing, duplicate, partial, foreign, or malformed
 * trajectory results before an artifact can be produced.
 */
export function buildMechanisticDatasetArtifact<TInput, TTarget>(
  plan: MechanisticSweepPlan,
  results: readonly MechanisticTrajectoryResult<TInput, TTarget>[],
): MechanisticDatasetArtifact<TInput, TTarget> {
  const taskById = validatePlanForCollection(plan);

  if (results.length !== plan.tasks.length) {
    throw new RangeError(
      `mechanistic dataset requires exactly ${plan.tasks.length} completed trajectory results, received ${results.length}`,
    );
  }

  const resultByTaskId = new Map<
    string,
    readonly MechanisticSample<TInput, TTarget>[]
  >();

  for (const result of results) {
    requireNonEmpty("trajectory result taskId", result.taskId);
    if (resultByTaskId.has(result.taskId)) {
      throw new RangeError(`duplicate trajectory result for task ${result.taskId}`);
    }
    if (!taskById.has(result.taskId)) {
      throw new RangeError(`trajectory result references unknown task ${result.taskId}`);
    }
    resultByTaskId.set(result.taskId, result.samples);
  }

  const splitSampleCounts = emptySplitCounts();
  const rows: MechanisticDatasetRow<TInput, TTarget>[] = [];

  for (const task of plan.tasks) {
    const samples = resultByTaskId.get(task.taskId);
    if (samples === undefined) {
      throw new RangeError(`missing trajectory result for task ${task.taskId}`);
    }

    validateTrajectoryResult(task, samples);

    for (const sample of samples) {
      const row: MechanisticDatasetRow<TInput, TTarget> = {
        schemaVersion: MECHANISTIC_DATASET_ROW_SCHEMA_VERSION,
        taskId: task.taskId,
        parameterPointId: task.parameterPointId,
        interventionFamilyId: task.interventionFamilyId,
        split: task.split,
        splitGroupKey: task.splitGroupKey,
        trajectoryKey: task.trajectoryKey,
        sample: structuredClone(sample),
      };
      // Fail before returning an artifact if a runner emitted a payload that
      // cannot be represented losslessly in the stable JSONL interchange.
      canonicalJson(row);
      rows.push(deepFreezeJson(row));
      splitSampleCounts[task.split] += 1;
    }
  }

  const summary: MechanisticDatasetSummary = {
    schemaVersion: MECHANISTIC_DATASET_ARTIFACT_SCHEMA_VERSION,
    planVersion: plan.planVersion,
    datasetVersion: plan.datasetVersion,
    engineVersion: plan.engineVersion,
    scenarioId: plan.scenarioId,
    scenarioVersion: plan.scenarioVersion,
    normalizationProfileId: plan.normalizationProfileId,
    splitPolicyVersion: plan.splitPolicy.version,
    splitCoveragePolicyVersion: plan.splitCoveragePolicy.version,
    groupCount: plan.groupCount,
    trajectoryCount: plan.trajectoryCount,
    sampleCount: rows.length,
    splitGroupCounts: Object.freeze({ ...plan.splitGroupCounts }),
    splitTrajectoryCounts: Object.freeze({ ...plan.splitTrajectoryCounts }),
    splitSampleCounts: Object.freeze({ ...splitSampleCounts }),
  };

  canonicalJson(summary);

  return {
    summary: Object.freeze(summary),
    rows: Object.freeze(rows),
  };
}

/**
 * Streams canonical JSONL records without constructing one giant export
 * string. Callers can write each yielded line to disk/object storage.
 */
export function* iterateMechanisticDatasetJsonl<TInput, TTarget>(
  artifact: MechanisticDatasetArtifact<TInput, TTarget>,
): Generator<string, void, undefined> {
  for (const row of artifact.rows) {
    yield canonicalJson(row);
  }
}

/** Convenience serializer for tests and small aggregate datasets. */
export function serializeMechanisticDatasetJsonl<TInput, TTarget>(
  artifact: MechanisticDatasetArtifact<TInput, TTarget>,
): string {
  if (artifact.rows.length === 0) return "";
  return `${[...iterateMechanisticDatasetJsonl(artifact)].join("\n")}\n`;
}

/** Stable provenance sidecar for the JSONL dataset. */
export function serializeMechanisticDatasetSummary(
  artifact: MechanisticDatasetArtifact<unknown, unknown>,
): string {
  return `${canonicalJson(artifact.summary)}\n`;
}

function validatePlanForCollection(
  plan: MechanisticSweepPlan,
): ReadonlyMap<string, MechanisticSweepTask> {
  requireNonEmpty("planVersion", plan.planVersion);
  requireNonEmpty("datasetVersion", plan.datasetVersion);
  requireNonEmpty("engineVersion", plan.engineVersion);
  requireNonEmpty("scenarioId", plan.scenarioId);
  requireNonEmpty("scenarioVersion", plan.scenarioVersion);
  requireNonEmpty("normalizationProfileId", plan.normalizationProfileId);
  validateSplitCoveragePolicy(plan.splitCoveragePolicy);

  if (!Number.isSafeInteger(plan.groupCount) || plan.groupCount < 1) {
    throw new RangeError("mechanistic sweep groupCount must be a positive safe integer");
  }

  if (
    !Number.isSafeInteger(plan.trajectoryCount) ||
    plan.trajectoryCount < 1 ||
    plan.trajectoryCount !== plan.tasks.length
  ) {
    throw new RangeError(
      "mechanistic sweep trajectoryCount must match a non-empty task list",
    );
  }

  const taskById = new Map<string, MechanisticSweepTask>();
  const trajectoryKeys = new Set<string>();
  const groupSplits = new Map<string, DatasetSplit>();
  const observedGroupCounts = emptySplitCounts();
  const observedSplitCounts = emptySplitCounts();

  for (const task of plan.tasks) {
    requireNonEmpty("taskId", task.taskId);
    requireNonEmpty("parameterPointId", task.parameterPointId);
    requireNonEmpty("interventionFamilyId", task.interventionFamilyId);
    if (taskById.has(task.taskId)) {
      throw new RangeError(`duplicate planned task id: ${task.taskId}`);
    }
    taskById.set(task.taskId, task);

    if (task.datasetVersion !== plan.datasetVersion) {
      throw new TypeError(
        `task ${task.taskId} datasetVersion does not match its sweep plan`,
      );
    }
    if (task.normalizationProfileId !== plan.normalizationProfileId) {
      throw new TypeError(
        `task ${task.taskId} normalizationProfileId does not match its sweep plan`,
      );
    }

    const group = task.trajectory.group;
    if (
      group.engineVersion !== plan.engineVersion ||
      group.scenarioId !== plan.scenarioId ||
      group.scenarioVersion !== plan.scenarioVersion
    ) {
      throw new TypeError(
        `task ${task.taskId} trajectory identity does not match its sweep plan`,
      );
    }

    const expectedGroupKey = splitGroupKey(group);
    if (task.splitGroupKey !== expectedGroupKey) {
      throw new TypeError(
        `task ${task.taskId} splitGroupKey does not match its trajectory identity`,
      );
    }

    const expectedTrajectoryKey = trajectoryKey(task.trajectory);
    if (task.trajectoryKey !== expectedTrajectoryKey) {
      throw new TypeError(
        `task ${task.taskId} trajectoryKey does not match its trajectory identity`,
      );
    }
    if (trajectoryKeys.has(expectedTrajectoryKey)) {
      throw new RangeError(
        `duplicate planned trajectory identity: ${expectedTrajectoryKey}`,
      );
    }
    trajectoryKeys.add(expectedTrajectoryKey);

    const expectedSplit = assignDatasetSplit(group, plan.splitPolicy);
    if (task.split !== expectedSplit) {
      throw new TypeError(
        `task ${task.taskId} split does not match the plan's split policy`,
      );
    }

    const existingGroupSplit = groupSplits.get(expectedGroupKey);
    if (existingGroupSplit === undefined) {
      groupSplits.set(expectedGroupKey, task.split);
      observedGroupCounts[task.split] += 1;
    } else if (existingGroupSplit !== task.split) {
      throw new TypeError(
        `planned group ${expectedGroupKey} spans multiple dataset splits`,
      );
    }
    observedSplitCounts[task.split] += 1;
  }

  if (groupSplits.size !== plan.groupCount) {
    throw new RangeError(
      "mechanistic sweep groupCount does not match planned group identities",
    );
  }

  for (const split of plan.splitCoveragePolicy.requiredSplits) {
    if (
      observedGroupCounts[split] <
      plan.splitCoveragePolicy.minimumGroupsPerSplit
    ) {
      throw new RangeError(
        `planned ${split} group coverage does not satisfy policy ${plan.splitCoveragePolicy.version}`,
      );
    }
  }

  for (const split of DATASET_SPLITS) {
    if (observedGroupCounts[split] !== plan.splitGroupCounts[split]) {
      throw new RangeError(
        `planned ${split} group count does not match task identities`,
      );
    }
    if (observedSplitCounts[split] !== plan.splitTrajectoryCounts[split]) {
      throw new RangeError(
        `planned ${split} trajectory count does not match task identities`,
      );
    }
  }

  return taskById;
}

function validateTrajectoryResult<TInput, TTarget>(
  task: MechanisticSweepTask,
  samples: readonly MechanisticSample<TInput, TTarget>[],
): void {
  if (samples.length === 0) {
    throw new RangeError(
      `trajectory result for task ${task.taskId} must contain at least one sample`,
    );
  }

  let previousTime = -Infinity;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    if (sample === undefined) {
      throw new RangeError(
        `trajectory result for task ${task.taskId} contains a sparse sample slot`,
      );
    }

    validateMechanisticSample(sample);

    if (sample.datasetVersion !== task.datasetVersion) {
      throw new TypeError(
        `sample ${index} for task ${task.taskId} has the wrong datasetVersion`,
      );
    }
    if (sample.normalizationProfileId !== task.normalizationProfileId) {
      throw new TypeError(
        `sample ${index} for task ${task.taskId} has the wrong normalizationProfileId`,
      );
    }
    if (trajectoryKey(sample.trajectory) !== task.trajectoryKey) {
      throw new TypeError(
        `sample ${index} for task ${task.taskId} belongs to another trajectory`,
      );
    }
    if (sample.snapshotIndex !== index) {
      throw new RangeError(
        `task ${task.taskId} snapshots must be contiguous from index 0; expected ${index}, received ${sample.snapshotIndex}`,
      );
    }
    if (sample.simulationTimeHours < previousTime) {
      throw new RangeError(
        `task ${task.taskId} simulation time must be monotonic`,
      );
    }
    previousTime = sample.simulationTimeHours;

    const isFinal = index === samples.length - 1;
    if (isFinal) {
      if (
        sample.terminationReason === undefined ||
        sample.terminationReason.trim().length === 0
      ) {
        throw new TypeError(
          `final sample for task ${task.taskId} must declare a non-empty terminationReason`,
        );
      }
    } else if (sample.terminationReason !== undefined) {
      throw new TypeError(
        `only the final sample for task ${task.taskId} may declare terminationReason`,
      );
    }
  }
}

const DATASET_SPLITS = ["train", "validation", "test"] as const;

function emptySplitCounts(): Record<DatasetSplit, number> {
  return { train: 0, validation: 0, test: 0 };
}

function requireNonEmpty(name: string, value: string): void {
  if (value.trim().length === 0) {
    throw new TypeError(`${name} must be non-empty`);
  }
}

function canonicalJson(value: unknown): string {
  return canonicalJsonValue(value, "$", new Set<object>());
}

function canonicalJsonValue(
  value: unknown,
  path: string,
  ancestors: Set<object>,
): string {
  if (value === null) return "null";

  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(`${path} contains a non-finite number`);
    }
    if (Object.is(value, -0)) return "-0";
    return JSON.stringify(value);
  }

  if (typeof value !== "object") {
    throw new TypeError(
      `${path} contains a non-JSON value of type ${typeof value}`,
    );
  }

  if (ancestors.has(value)) {
    throw new TypeError(`${path} contains a circular reference`);
  }
  ancestors.add(value);

  try {
    if (Array.isArray(value)) {
      const encoded: string[] = [];
      const expectedKeys = new Set<string>();
      for (let index = 0; index < value.length; index += 1) {
        const key = String(index);
        expectedKeys.add(key);
        if (!Object.prototype.hasOwnProperty.call(value, index)) {
          throw new TypeError(`${path} contains a sparse array slot at ${index}`);
        }
        encoded.push(
          canonicalJsonValue(value[index], `${path}[${index}]`, ancestors),
        );
      }
      for (const key of Object.keys(value)) {
        if (!expectedKeys.has(key)) {
          throw new TypeError(
            `${path} contains a non-index array property ${JSON.stringify(key)}`,
          );
        }
      }
      return `[${encoded.join(",")}]`;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(
        `${path} contains a non-plain object that cannot enter stable JSONL`,
      );
    }

    const object = value as Record<string, unknown>;
    const encoded = Object.keys(object)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalJsonValue(
            object[key],
            `${path}.${key}`,
            ancestors,
          )}`,
      );
    return `{${encoded.join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

function deepFreezeJson<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }

  for (const nested of Object.values(value as Record<string, unknown>)) {
    deepFreezeJson(nested);
  }
  return Object.freeze(value);
}
