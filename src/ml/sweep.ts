import {
  DEFAULT_SPLIT_POLICY,
  assignDatasetSplit,
  splitGroupKey,
  trajectoryKey,
  validateSplitPolicy,
  type DatasetGroupIdentity,
  type DatasetSplit,
  type SplitPolicy,
  type TrajectoryIdentity,
} from "./dataset";

export interface SweepParameterPoint {
  readonly id: string;
  readonly parameterSetHash: string;
}

export interface SweepInterventionFamily {
  readonly id: string;
  readonly fingerprint: string;
}

export interface MechanisticSweepDefinition {
  readonly planVersion: string;
  readonly datasetVersion: string;
  readonly engineVersion: string;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly normalizationProfileId: string;
  readonly parameterPoints: readonly SweepParameterPoint[];
  readonly interventionFamilies: readonly SweepInterventionFamily[];
  readonly seeds: readonly string[];
  readonly maxTrajectories: number;
  readonly splitPolicy?: SplitPolicy;
}

export interface MechanisticSweepTask {
  readonly taskId: string;
  readonly datasetVersion: string;
  readonly normalizationProfileId: string;
  readonly parameterPointId: string;
  readonly interventionFamilyId: string;
  readonly split: DatasetSplit;
  readonly trajectory: TrajectoryIdentity;
  readonly splitGroupKey: string;
  readonly trajectoryKey: string;
}

export interface MechanisticSweepPlan {
  readonly planVersion: string;
  readonly datasetVersion: string;
  readonly engineVersion: string;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly normalizationProfileId: string;
  readonly splitPolicy: SplitPolicy;
  readonly groupCount: number;
  readonly trajectoryCount: number;
  readonly tasks: readonly MechanisticSweepTask[];
}

export interface SweepManifestTrajectory {
  readonly taskId: string;
  readonly split: DatasetSplit;
  readonly parameterPointId: string;
  readonly interventionFamilyId: string;
  readonly seed: string;
  readonly splitGroupKey: string;
  readonly trajectoryKey: string;
}

export interface MechanisticSweepManifest {
  readonly schemaVersion: "petra-ml-sweep-manifest-v1";
  readonly planVersion: string;
  readonly datasetVersion: string;
  readonly engineVersion: string;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly normalizationProfileId: string;
  readonly splitPolicyVersion: string;
  readonly groupCount: number;
  readonly trajectoryCount: number;
  readonly splitCounts: Readonly<Record<DatasetSplit, number>>;
  readonly trajectories: readonly SweepManifestTrajectory[];
}

/**
 * Plans future authoritative mechanistic trajectories for dataset generation.
 *
 * This function never produces biological samples and never runs a surrogate.
 * It only creates leakage-safe, reproducible work identities for a later
 * mechanistic runner. The parameter/intervention combination is the split
 * boundary; every seed replica in that group therefore stays in one split.
 */
export function planMechanisticSweep(
  definition: MechanisticSweepDefinition,
): MechanisticSweepPlan {
  validateSweepDefinition(definition);
  const splitPolicy = definition.splitPolicy ?? DEFAULT_SPLIT_POLICY;
  validateSplitPolicy(splitPolicy);

  const groupCount =
    definition.parameterPoints.length * definition.interventionFamilies.length;
  const trajectoryCount = groupCount * definition.seeds.length;

  if (!Number.isSafeInteger(trajectoryCount)) {
    throw new RangeError("mechanistic sweep trajectory count exceeds safe integer range");
  }
  if (trajectoryCount > definition.maxTrajectories) {
    throw new RangeError(
      `mechanistic sweep expands to ${trajectoryCount} trajectories, above maxTrajectories=${definition.maxTrajectories}`,
    );
  }

  const tasks: MechanisticSweepTask[] = [];

  for (const parameterPoint of definition.parameterPoints) {
    for (const interventionFamily of definition.interventionFamilies) {
      const group: DatasetGroupIdentity = {
        engineVersion: definition.engineVersion,
        parameterSetHash: parameterPoint.parameterSetHash,
        scenarioId: definition.scenarioId,
        scenarioVersion: definition.scenarioVersion,
        groupId: interventionGroupId(interventionFamily.fingerprint),
      };
      const split = assignDatasetSplit(group, splitPolicy);
      const groupKey = splitGroupKey(group);

      for (const seed of definition.seeds) {
        const trajectory: TrajectoryIdentity = {
          group,
          seed,
          interventionFingerprint: interventionFamily.fingerprint,
        };
        const key = trajectoryKey(trajectory);

        tasks.push({
          taskId: stableTaskId(definition.planVersion, key),
          datasetVersion: definition.datasetVersion,
          normalizationProfileId: definition.normalizationProfileId,
          parameterPointId: parameterPoint.id,
          interventionFamilyId: interventionFamily.id,
          split,
          trajectory,
          splitGroupKey: groupKey,
          trajectoryKey: key,
        });
      }
    }
  }

  return {
    planVersion: definition.planVersion,
    datasetVersion: definition.datasetVersion,
    engineVersion: definition.engineVersion,
    scenarioId: definition.scenarioId,
    scenarioVersion: definition.scenarioVersion,
    normalizationProfileId: definition.normalizationProfileId,
    splitPolicy,
    groupCount,
    trajectoryCount,
    tasks,
  };
}

export function buildMechanisticSweepManifest(
  plan: MechanisticSweepPlan,
): MechanisticSweepManifest {
  const splitCounts: Record<DatasetSplit, number> = {
    train: 0,
    validation: 0,
    test: 0,
  };

  for (const task of plan.tasks) {
    splitCounts[task.split] += 1;
  }

  return {
    schemaVersion: "petra-ml-sweep-manifest-v1",
    planVersion: plan.planVersion,
    datasetVersion: plan.datasetVersion,
    engineVersion: plan.engineVersion,
    scenarioId: plan.scenarioId,
    scenarioVersion: plan.scenarioVersion,
    normalizationProfileId: plan.normalizationProfileId,
    splitPolicyVersion: plan.splitPolicy.version,
    groupCount: plan.groupCount,
    trajectoryCount: plan.trajectoryCount,
    splitCounts,
    trajectories: plan.tasks.map((task) => ({
      taskId: task.taskId,
      split: task.split,
      parameterPointId: task.parameterPointId,
      interventionFamilyId: task.interventionFamilyId,
      seed: task.trajectory.seed,
      splitGroupKey: task.splitGroupKey,
      trajectoryKey: task.trajectoryKey,
    })),
  };
}

function validateSweepDefinition(definition: MechanisticSweepDefinition): void {
  requireNonEmpty("planVersion", definition.planVersion);
  requireNonEmpty("datasetVersion", definition.datasetVersion);
  requireNonEmpty("engineVersion", definition.engineVersion);
  requireNonEmpty("scenarioId", definition.scenarioId);
  requireNonEmpty("scenarioVersion", definition.scenarioVersion);
  requireNonEmpty("normalizationProfileId", definition.normalizationProfileId);

  if (!Number.isSafeInteger(definition.maxTrajectories) || definition.maxTrajectories < 1) {
    throw new RangeError("maxTrajectories must be a positive safe integer");
  }

  if (definition.parameterPoints.length === 0) {
    throw new RangeError("mechanistic sweep requires at least one parameter point");
  }
  if (definition.interventionFamilies.length === 0) {
    throw new RangeError("mechanistic sweep requires at least one intervention family");
  }
  if (definition.seeds.length === 0) {
    throw new RangeError("mechanistic sweep requires at least one seed");
  }

  assertUnique(
    definition.parameterPoints,
    (point) => {
      requireNonEmpty("parameter point id", point.id);
      return point.id;
    },
    "parameter point id",
  );
  assertUnique(
    definition.parameterPoints,
    (point) => {
      requireNonEmpty("parameterSetHash", point.parameterSetHash);
      return point.parameterSetHash;
    },
    "parameterSetHash",
  );
  assertUnique(
    definition.interventionFamilies,
    (family) => {
      requireNonEmpty("intervention family id", family.id);
      return family.id;
    },
    "intervention family id",
  );
  assertUnique(
    definition.interventionFamilies,
    (family) => {
      requireNonEmpty("intervention fingerprint", family.fingerprint);
      return family.fingerprint;
    },
    "intervention fingerprint",
  );
  assertUnique(
    definition.seeds,
    (seed) => {
      requireNonEmpty("seed", seed);
      return seed;
    },
    "seed",
  );
}

function assertUnique<T>(
  values: readonly T[],
  key: (value: T) => string,
  label: string,
): void {
  const seen = new Set<string>();
  for (const value of values) {
    const current = key(value);
    if (seen.has(current)) {
      throw new RangeError(`duplicate ${label}: ${current}`);
    }
    seen.add(current);
  }
}

function interventionGroupId(fingerprint: string): string {
  return `intervention:${fingerprint.length}:${fingerprint}`;
}

function stableTaskId(planVersion: string, key: string): string {
  return `sweep:${encodePart(planVersion)}:${encodePart(key)}`;
}

function encodePart(value: string): string {
  return `${value.length}:${value}`;
}

function requireNonEmpty(name: string, value: string): void {
  if (value.trim().length === 0) {
    throw new TypeError(`${name} must be non-empty`);
  }
}
