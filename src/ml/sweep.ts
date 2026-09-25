import {
  DEFAULT_SPLIT_POLICY,
  assignDatasetSplit,
  mechanisticDatasetSchemaKey,
  splitGroupKey,
  trajectoryKey,
  validateMechanisticDatasetSchemaIdentity,
  validateSplitPolicy,
  type DatasetGroupIdentity,
  type MechanisticDatasetSchemaIdentity,
  type DatasetSplit,
  type SplitPolicy,
  type TrajectoryIdentity,
} from "./dataset";
import { assertSimulationSeed } from "../sim/seed";
import {
  mechanisticExecutionScheduleIdentity,
  validateMechanisticExecutionSchedule,
  type MechanisticExecutionSchedule,
} from "./executionSchedule";

export interface SweepParameterPoint {
  readonly id: string;
  readonly parameterSetHash: string;
}

export interface SweepRunCondition {
  readonly id: string;
  readonly fingerprint: string;
}

export interface SweepInterventionFamily {
  readonly id: string;
  readonly fingerprint: string;
}

export interface SplitCoveragePolicy {
  readonly version: string;
  readonly requiredSplits: readonly DatasetSplit[];
  readonly minimumGroupsPerSplit: number;
}

export const DEFAULT_SPLIT_COVERAGE_POLICY: SplitCoveragePolicy = Object.freeze({
  version: "held-out-group-coverage-v1",
  requiredSplits: Object.freeze(["train", "validation", "test"] as const),
  minimumGroupsPerSplit: 1,
});

export interface SplitCoverageGap {
  readonly split: DatasetSplit;
  readonly requiredGroups: number;
  readonly observedGroups: number;
  readonly observedTrajectories: number;
}

export class SweepSplitCoverageError extends RangeError {
  readonly code = "insufficient-split-coverage";
  readonly policyVersion: string;
  readonly gaps: readonly SplitCoverageGap[];
  readonly groupCounts: Readonly<Record<DatasetSplit, number>>;
  readonly trajectoryCounts: Readonly<Record<DatasetSplit, number>>;

  constructor(args: {
    readonly policyVersion: string;
    readonly gaps: readonly SplitCoverageGap[];
    readonly groupCounts: Readonly<Record<DatasetSplit, number>>;
    readonly trajectoryCounts: Readonly<Record<DatasetSplit, number>>;
  }) {
    const summary = args.gaps
      .map(
        (gap) =>
          `${gap.split}: ${gap.observedGroups}/${gap.requiredGroups} groups (${gap.observedTrajectories} trajectories)`,
      )
      .join(", ");
    super(
      `mechanistic sweep refused by split coverage policy ${args.policyVersion}: ${summary}. Enlarge or change the declared sweep, or use a separately versioned split/coverage policy; do not move individual seeds or frames between splits.`,
    );
    this.name = "SweepSplitCoverageError";
    this.policyVersion = args.policyVersion;
    this.gaps = Object.freeze([...args.gaps]);
    this.groupCounts = Object.freeze({ ...args.groupCounts });
    this.trajectoryCounts = Object.freeze({ ...args.trajectoryCounts });
  }
}

export interface MechanisticSweepDefinition {
  readonly planVersion: string;
  readonly datasetVersion: string;
  readonly engineVersion: string;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly normalizationProfileId: string;
  readonly datasetSchema: MechanisticDatasetSchemaIdentity;
  readonly executionSchedule: MechanisticExecutionSchedule;
  readonly parameterPoints: readonly SweepParameterPoint[];
  readonly runConditions: readonly SweepRunCondition[];
  readonly interventionFamilies: readonly SweepInterventionFamily[];
  readonly seeds: readonly number[];
  readonly maxTrajectories: number;
  readonly splitPolicy?: SplitPolicy;
  readonly splitCoveragePolicy?: SplitCoveragePolicy;
}

export interface MechanisticSweepTask {
  readonly taskId: string;
  readonly datasetVersion: string;
  readonly normalizationProfileId: string;
  readonly datasetSchema: MechanisticDatasetSchemaIdentity;
  readonly executionSchedule: MechanisticExecutionSchedule;
  readonly executionScheduleIdentity: string;
  readonly parameterPointId: string;
  readonly runConditionId: string;
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
  readonly datasetSchema: MechanisticDatasetSchemaIdentity;
  readonly executionSchedule: MechanisticExecutionSchedule;
  readonly executionScheduleIdentity: string;
  readonly splitPolicy: SplitPolicy;
  readonly splitCoveragePolicy: SplitCoveragePolicy;
  readonly groupCount: number;
  readonly trajectoryCount: number;
  readonly splitGroupCounts: Readonly<Record<DatasetSplit, number>>;
  readonly splitTrajectoryCounts: Readonly<Record<DatasetSplit, number>>;
  readonly tasks: readonly MechanisticSweepTask[];
}

export interface SweepManifestTrajectory {
  readonly taskId: string;
  readonly split: DatasetSplit;
  readonly parameterPointId: string;
  readonly runConditionId: string;
  readonly runConditionFingerprint: string;
  readonly executionScheduleIdentity: string;
  readonly interventionFamilyId: string;
  readonly seed: number;
  readonly splitGroupKey: string;
  readonly trajectoryKey: string;
}

export interface MechanisticSweepManifest {
  readonly schemaVersion: "petra-ml-sweep-manifest-v6";
  readonly planVersion: string;
  readonly datasetVersion: string;
  readonly engineVersion: string;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly normalizationProfileId: string;
  readonly datasetSchema: MechanisticDatasetSchemaIdentity;
  readonly executionSchedule: MechanisticExecutionSchedule;
  readonly executionScheduleIdentity: string;
  readonly splitPolicyVersion: string;
  readonly splitCoveragePolicyVersion: string;
  readonly groupCount: number;
  readonly trajectoryCount: number;
  readonly splitGroupCounts: Readonly<Record<DatasetSplit, number>>;
  readonly splitCounts: Readonly<Record<DatasetSplit, number>>;
  readonly trajectories: readonly SweepManifestTrajectory[];
}

/**
 * Plans future authoritative mechanistic trajectories for dataset generation.
 *
 * This function never produces biological samples and never runs a surrogate.
 * It only creates leakage-safe, reproducible work identities for a later
 * mechanistic runner. Mechanism parameters, run condition and intervention
 * schedule form the split boundary; every seed replica in that group therefore
 * stays in one split.
 */
export function planMechanisticSweep(
  definition: MechanisticSweepDefinition,
): MechanisticSweepPlan {
  validateSweepDefinition(definition);
  const splitPolicy = definition.splitPolicy ?? DEFAULT_SPLIT_POLICY;
  const splitCoveragePolicy =
    definition.splitCoveragePolicy ?? DEFAULT_SPLIT_COVERAGE_POLICY;
  validateSplitPolicy(splitPolicy);
  validateSplitCoveragePolicy(splitCoveragePolicy);
  const datasetSchema = Object.freeze({ ...definition.datasetSchema });
  const datasetSchemaIdentityKey = mechanisticDatasetSchemaKey(datasetSchema);
  const executionSchedule = Object.freeze({ ...definition.executionSchedule });
  validateMechanisticExecutionSchedule(executionSchedule);
  const executionScheduleIdentity = mechanisticExecutionScheduleIdentity(executionSchedule);

  const groupCount =
    definition.parameterPoints.length *
    definition.runConditions.length *
    definition.interventionFamilies.length;
  const trajectoryCount = groupCount * definition.seeds.length;

  if (!Number.isSafeInteger(trajectoryCount)) {
    throw new RangeError("mechanistic sweep trajectory count exceeds safe integer range");
  }
  if (trajectoryCount > definition.maxTrajectories) {
    throw new RangeError(
      `mechanistic sweep expands to ${trajectoryCount} trajectories, above maxTrajectories=${definition.maxTrajectories}`,
    );
  }

  const splitGroupCounts = emptySplitCounts();
  const splitTrajectoryCounts = emptySplitCounts();
  const groups: Array<{
    readonly parameterPoint: SweepParameterPoint;
    readonly runCondition: SweepRunCondition;
    readonly interventionFamily: SweepInterventionFamily;
    readonly group: DatasetGroupIdentity;
    readonly split: DatasetSplit;
    readonly groupKey: string;
  }> = [];

  for (const parameterPoint of definition.parameterPoints) {
    for (const runCondition of definition.runConditions) {
      for (const interventionFamily of definition.interventionFamilies) {
        const group: DatasetGroupIdentity = {
          engineVersion: definition.engineVersion,
          parameterSetHash: parameterPoint.parameterSetHash,
          scenarioId: definition.scenarioId,
          scenarioVersion: definition.scenarioVersion,
          runConditionFingerprint: runCondition.fingerprint,
          groupId: interventionGroupId(interventionFamily.fingerprint),
        };
        const split = assignDatasetSplit(group, splitPolicy);
        const groupKey = splitGroupKey(group);
        splitGroupCounts[split] += 1;
        splitTrajectoryCounts[split] += definition.seeds.length;
        groups.push({
          parameterPoint,
          runCondition,
          interventionFamily,
          group,
          split,
          groupKey,
        });
      }
    }
  }

  enforceSplitCoverage({
    policy: splitCoveragePolicy,
    groupCounts: splitGroupCounts,
    trajectoryCounts: splitTrajectoryCounts,
  });

  const tasks: MechanisticSweepTask[] = [];

  for (const plannedGroup of groups) {
    const {
      parameterPoint,
      runCondition,
      interventionFamily,
      group,
      split,
      groupKey,
    } = plannedGroup;

    for (const seed of definition.seeds) {
      const trajectory: TrajectoryIdentity = {
        group,
        seed,
        interventionFingerprint: interventionFamily.fingerprint,
      };
      const key = trajectoryKey(trajectory);

      tasks.push({
        taskId: stableTaskId(
          definition.planVersion,
          datasetSchemaIdentityKey,
          executionScheduleIdentity,
          key,
        ),
        datasetVersion: definition.datasetVersion,
        normalizationProfileId: definition.normalizationProfileId,
        datasetSchema,
        executionSchedule,
        executionScheduleIdentity,
        parameterPointId: parameterPoint.id,
        runConditionId: runCondition.id,
        interventionFamilyId: interventionFamily.id,
        split,
        trajectory,
        splitGroupKey: groupKey,
        trajectoryKey: key,
      });
    }
  }

  return {
    planVersion: definition.planVersion,
    datasetVersion: definition.datasetVersion,
    engineVersion: definition.engineVersion,
    scenarioId: definition.scenarioId,
    scenarioVersion: definition.scenarioVersion,
    normalizationProfileId: definition.normalizationProfileId,
    datasetSchema,
    executionSchedule,
    executionScheduleIdentity,
    splitPolicy,
    splitCoveragePolicy,
    groupCount,
    trajectoryCount,
    splitGroupCounts: Object.freeze({ ...splitGroupCounts }),
    splitTrajectoryCounts: Object.freeze({ ...splitTrajectoryCounts }),
    tasks,
  };
}

export function buildMechanisticSweepManifest(
  plan: MechanisticSweepPlan,
): MechanisticSweepManifest {
  const splitCounts = { ...plan.splitTrajectoryCounts };

  return {
    schemaVersion: "petra-ml-sweep-manifest-v6",
    planVersion: plan.planVersion,
    datasetVersion: plan.datasetVersion,
    engineVersion: plan.engineVersion,
    scenarioId: plan.scenarioId,
    scenarioVersion: plan.scenarioVersion,
    normalizationProfileId: plan.normalizationProfileId,
    datasetSchema: { ...plan.datasetSchema },
    executionSchedule: { ...plan.executionSchedule },
    executionScheduleIdentity: plan.executionScheduleIdentity,
    splitPolicyVersion: plan.splitPolicy.version,
    splitCoveragePolicyVersion: plan.splitCoveragePolicy.version,
    groupCount: plan.groupCount,
    trajectoryCount: plan.trajectoryCount,
    splitGroupCounts: { ...plan.splitGroupCounts },
    splitCounts,
    trajectories: plan.tasks.map((task) => ({
      taskId: task.taskId,
      split: task.split,
      parameterPointId: task.parameterPointId,
      runConditionId: task.runConditionId,
      runConditionFingerprint: task.trajectory.group.runConditionFingerprint,
      executionScheduleIdentity: task.executionScheduleIdentity,
      interventionFamilyId: task.interventionFamilyId,
      seed: task.trajectory.seed,
      splitGroupKey: task.splitGroupKey,
      trajectoryKey: task.trajectoryKey,
    })),
  };
}

export function validateSplitCoveragePolicy(
  policy: SplitCoveragePolicy,
): void {
  requireNonEmpty("split coverage policy version", policy.version);
  if (
    !Number.isSafeInteger(policy.minimumGroupsPerSplit) ||
    policy.minimumGroupsPerSplit < 1
  ) {
    throw new RangeError(
      "split coverage minimumGroupsPerSplit must be a positive safe integer",
    );
  }
  if (policy.requiredSplits.length === 0) {
    throw new RangeError("split coverage policy requires at least one split");
  }

  const seen = new Set<DatasetSplit>();
  for (const split of policy.requiredSplits) {
    if (split !== "train" && split !== "validation" && split !== "test") {
      throw new RangeError(`unknown required dataset split: ${String(split)}`);
    }
    if (seen.has(split)) {
      throw new RangeError(`duplicate required dataset split: ${split}`);
    }
    seen.add(split);
  }
}

function enforceSplitCoverage(args: {
  readonly policy: SplitCoveragePolicy;
  readonly groupCounts: Readonly<Record<DatasetSplit, number>>;
  readonly trajectoryCounts: Readonly<Record<DatasetSplit, number>>;
}): void {
  const gaps: SplitCoverageGap[] = [];
  for (const split of args.policy.requiredSplits) {
    const observedGroups = args.groupCounts[split];
    if (observedGroups < args.policy.minimumGroupsPerSplit) {
      gaps.push({
        split,
        requiredGroups: args.policy.minimumGroupsPerSplit,
        observedGroups,
        observedTrajectories: args.trajectoryCounts[split],
      });
    }
  }

  if (gaps.length > 0) {
    throw new SweepSplitCoverageError({
      policyVersion: args.policy.version,
      gaps,
      groupCounts: args.groupCounts,
      trajectoryCounts: args.trajectoryCounts,
    });
  }
}

function emptySplitCounts(): Record<DatasetSplit, number> {
  return {
    train: 0,
    validation: 0,
    test: 0,
  };
}

function validateSweepDefinition(definition: MechanisticSweepDefinition): void {
  requireNonEmpty("planVersion", definition.planVersion);
  requireNonEmpty("datasetVersion", definition.datasetVersion);
  requireNonEmpty("engineVersion", definition.engineVersion);
  requireNonEmpty("scenarioId", definition.scenarioId);
  requireNonEmpty("scenarioVersion", definition.scenarioVersion);
  requireNonEmpty("normalizationProfileId", definition.normalizationProfileId);
  validateMechanisticDatasetSchemaIdentity(definition.datasetSchema);
  validateMechanisticExecutionSchedule(definition.executionSchedule);

  if (!Number.isSafeInteger(definition.maxTrajectories) || definition.maxTrajectories < 1) {
    throw new RangeError("maxTrajectories must be a positive safe integer");
  }

  if (definition.parameterPoints.length === 0) {
    throw new RangeError("mechanistic sweep requires at least one parameter point");
  }
  if (definition.runConditions.length === 0) {
    throw new RangeError("mechanistic sweep requires at least one run condition");
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
    definition.runConditions,
    (condition) => {
      requireNonEmpty("run condition id", condition.id);
      return condition.id;
    },
    "run condition id",
  );
  assertUnique(
    definition.runConditions,
    (condition) => {
      requireNonEmpty("run condition fingerprint", condition.fingerprint);
      return condition.fingerprint;
    },
    "run condition fingerprint",
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
    (seed) => String(assertSimulationSeed(seed)),
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

function stableTaskId(
  planVersion: string,
  datasetSchemaKey: string,
  executionScheduleIdentity: string,
  key: string,
): string {
  return `sweep:${encodePart(planVersion)}:${encodePart(datasetSchemaKey)}:${encodePart(executionScheduleIdentity)}:${encodePart(key)}`;
}

function encodePart(value: string): string {
  return `${value.length}:${value}`;
}

function requireNonEmpty(name: string, value: string): void {
  if (value.trim().length === 0) {
    throw new TypeError(`${name} must be non-empty`);
  }
}
