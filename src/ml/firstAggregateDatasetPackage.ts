import {
  createMechanisticExecutionDefinition,
  createMechanisticRunConditionExecutionDefinition,
  createNoInterventionExecutionDefinition,
  createNoInterventionSweepFamily,
  createSweepParameterPointForBinding,
  createSweepRunConditionForConfig,
  type MechanisticExecutionDefinition,
} from "./executionDefinition";
import {
  createMechanisticExecutionSchedule,
  validateMechanisticExecutionSchedule,
  type MechanisticExecutionSchedule,
} from "./executionSchedule";
import {
  planMechanisticSweep,
  type MechanisticSweepTask,
} from "./sweep";
import type {
  ComposedMechanisticTaskDefinition,
  ComposedTransitionProjectionContext,
} from "./runner";
import {
  NODE_MECHANISTIC_DATASET_PACKAGE_SCHEMA_VERSION,
  type NodeMechanisticDatasetPackage,
} from "./node/datasetRuntime";
import {
  buildFlagshipComposedRunPlan,
  type FlagshipRunInitialization,
} from "../sim/flagshipComposition";
import type { ComposedSimulationSnapshot } from "../sim/protocol";

export const FIRST_AGGREGATE_DATASET_PACKAGE_ID =
  "flagship-first-aggregate-no-intervention-v2" as const;
export const FIRST_AGGREGATE_DATASET_VERSION =
  "flagship-first-aggregate-mechanistic-v2" as const;
export const FIRST_AGGREGATE_EXECUTOR_DATA_SCHEMA_VERSION =
  "petra-first-aggregate-dataset-executor-v2" as const;
export const FIRST_AGGREGATE_INPUT_SCHEMA_VERSION =
  "flagship-aggregate-transition-source-v2" as const;
export const FIRST_AGGREGATE_TARGET_SCHEMA_VERSION =
  "flagship-aggregate-future-state-target-v2" as const;

const PARAMETER_POINT_ID = "flagship-established-engineering-parameters-v1";
const INTERVENTION_FAMILY_ID = "no-intervention";
const NORMALIZATION_PROFILE_ID = "identity-none-profile-v1";
const PLAN_VERSION = "flagship-first-heldout-aggregate-plan-v2";
const OUTPUT_BASE_NAME = "flagship-first-aggregate-mechanistic-v2";
const FOUNDER_LINEAGE_ID = "founder-wt";
const FOUNDER_X = 80;
const FOUNDER_Y = 80;
const BASELINE_RESOURCE_LEVEL = 8;
const BASELINE_FOUNDER_BIOMASS = 1;
const TOTAL_TICKS = 1024;
const SNAPSHOT_EVERY_TICKS = 64;
const MAX_TRAJECTORIES = 27;
const CANONICAL_SEEDS = Object.freeze([
  0x5eed1234,
  0x5eed1235,
  0x5eed1236,
] as const);

const HELD_OUT_SPLIT_POLICY = Object.freeze({
  version: "first-aggregate-equal-thirds-v1",
  trainFraction: 1 / 3,
  validationFraction: 1 / 3,
  testFraction: 1 / 3,
});

const HELD_OUT_COVERAGE_POLICY = Object.freeze({
  version: "first-aggregate-heldout-coverage-v1",
  requiredSplits: Object.freeze(["train", "validation", "test"] as const),
  minimumGroupsPerSplit: 1,
});

interface FirstAggregateRunConditionDescriptor {
  readonly id: string;
  readonly initialResourceLevel: number;
  readonly founderBiomass: number;
}

export interface FirstAggregateDatasetInput {
  readonly sourceSnapshotIndex: number;
  readonly sourceTick: number;
  readonly sourceTimeHours: number;
  readonly totalBiomass: number;
  readonly totalResource: number;
  readonly occupiedCells: number;
}

export interface FirstAggregateDatasetTarget {
  readonly targetSnapshotIndex: number;
  readonly targetTick: number;
  readonly targetTimeHours: number;
  readonly forecastHorizonTicks: number;
  readonly forecastHorizonHours: number;
  readonly totalBiomass: number;
  readonly totalResource: number;
  readonly occupiedCells: number;
}

export interface FirstAggregateDatasetExecutorData {
  readonly schemaVersion:
    typeof FIRST_AGGREGATE_EXECUTOR_DATA_SCHEMA_VERSION;
  readonly allowedTaskIds: readonly string[];
  readonly executionSchedule: MechanisticExecutionSchedule;
  readonly conditions: readonly FirstAggregateRunConditionDescriptor[];
}

const CONDITION_DESCRIPTORS = Object.freeze(
  [0.5, 1, 2].flatMap((resourceScale) =>
    [0.5, 1, 2].map((biomassScale) =>
      Object.freeze({
        id:
          `resource-${scaleId(resourceScale)}__founder-biomass-${scaleId(
            biomassScale,
          )}`,
        initialResourceLevel: BASELINE_RESOURCE_LEVEL * resourceScale,
        founderBiomass: BASELINE_FOUNDER_BIOMASS * biomassScale,
      }),
    ),
  ),
);

export function createNodeMechanisticDatasetPackage(): NodeMechanisticDatasetPackage<FirstAggregateDatasetExecutorData> {
  const schedule = createMechanisticExecutionSchedule({
    totalTicks: TOTAL_TICKS,
    snapshotEveryTicks: SNAPSHOT_EVERY_TICKS,
  });
  const baseline = buildFlagshipComposedRunPlan(
    initialization(
      CANONICAL_SEEDS[0],
      BASELINE_RESOURCE_LEVEL,
      BASELINE_FOUNDER_BIOMASS,
    ),
  );
  const parameterPoint = createSweepParameterPointForBinding(
    PARAMETER_POINT_ID,
    baseline.parameterSetBinding,
    baseline.config,
  );
  const runConditions = CONDITION_DESCRIPTORS.map((condition) => {
    const run = buildFlagshipComposedRunPlan(
      initialization(
        CANONICAL_SEEDS[0],
        condition.initialResourceLevel,
        condition.founderBiomass,
      ),
    );
    return createSweepRunConditionForConfig(condition.id, run.config);
  });
  const interventionFamily =
    createNoInterventionSweepFamily(INTERVENTION_FAMILY_ID);

  const plan = planMechanisticSweep({
    planVersion: PLAN_VERSION,
    datasetVersion: FIRST_AGGREGATE_DATASET_VERSION,
    engineVersion: baseline.identity.engineVersion,
    scenarioId: baseline.identity.scenarioId,
    scenarioVersion: baseline.identity.scenarioVersion,
    normalizationProfileId: NORMALIZATION_PROFILE_ID,
    datasetSchema: {
      schemaVersion: "mechanistic-dataset-schema-v1",
      inputSchemaVersion: FIRST_AGGREGATE_INPUT_SCHEMA_VERSION,
      targetSchemaVersion: FIRST_AGGREGATE_TARGET_SCHEMA_VERSION,
    },
    executionSchedule: schedule,
    parameterPoints: [parameterPoint],
    runConditions,
    interventionFamilies: [interventionFamily],
    seeds: CANONICAL_SEEDS,
    maxTrajectories: MAX_TRAJECTORIES,
    splitPolicy: HELD_OUT_SPLIT_POLICY,
    splitCoveragePolicy: HELD_OUT_COVERAGE_POLICY,
  });

  if (
    plan.groupCount !== CONDITION_DESCRIPTORS.length ||
    plan.trajectoryCount !== MAX_TRAJECTORIES
  ) {
    throw new Error(
      "first aggregate dataset package must remain a 9-group / 27-trajectory bounded sweep",
    );
  }

  const executorData: FirstAggregateDatasetExecutorData = Object.freeze({
    schemaVersion: FIRST_AGGREGATE_EXECUTOR_DATA_SCHEMA_VERSION,
    allowedTaskIds: Object.freeze(plan.tasks.map((task) => task.taskId)),
    executionSchedule: Object.freeze({ ...schedule }),
    conditions: Object.freeze(
      CONDITION_DESCRIPTORS.map((condition) =>
        Object.freeze({ ...condition }),
      ),
    ),
  });

  return Object.freeze({
    schemaVersion: NODE_MECHANISTIC_DATASET_PACKAGE_SCHEMA_VERSION,
    packageId: FIRST_AGGREGATE_DATASET_PACKAGE_ID,
    plan,
    executorData,
    outputBaseName: OUTPUT_BASE_NAME,
    evidenceBoundary:
      "Engineering held-out coverage over exact authoritative 64-tick aggregate state transitions from the repository-owned flagship mechanism and explicit model-unit initial state. Targets are future checkpoint state, not interval-integrated ecology flux. This is not physical substrate/CFU calibration, biological validation, learned-model quality evidence, or model-promotion evidence.",
  });
}

export function resolveNodeMechanisticDatasetTaskDefinition(
  task: MechanisticSweepTask,
  executorData: FirstAggregateDatasetExecutorData,
): ComposedMechanisticTaskDefinition<
  FirstAggregateDatasetInput,
  FirstAggregateDatasetTarget
> {
  validateExecutorData(executorData);
  if (!executorData.allowedTaskIds.includes(task.taskId)) {
    throw new RangeError(
      `first aggregate dataset package received unregistered task ${task.taskId}`,
    );
  }
  if (task.parameterPointId !== PARAMETER_POINT_ID) {
    throw new TypeError(
      "first aggregate dataset task references an unexpected mechanism parameter point",
    );
  }
  if (task.interventionFamilyId !== INTERVENTION_FAMILY_ID) {
    throw new TypeError(
      "first aggregate dataset task references an unexpected intervention family",
    );
  }

  const condition = executorData.conditions.find(
    (candidate) => candidate.id === task.runConditionId,
  );
  if (condition === undefined) {
    throw new RangeError(
      `first aggregate dataset task references unknown run condition ${task.runConditionId}`,
    );
  }

  const run = buildFlagshipComposedRunPlan(
    initialization(
      task.trajectory.seed,
      condition.initialResourceLevel,
      condition.founderBiomass,
    ),
  );
  const runCondition = createMechanisticRunConditionExecutionDefinition(
    condition.id,
    run.config,
  );
  const executionDefinition: MechanisticExecutionDefinition =
    createMechanisticExecutionDefinition({
      parameterSetBinding: run.parameterSetBinding,
      runCondition,
      executionSchedule: executorData.executionSchedule,
      intervention:
        createNoInterventionExecutionDefinition(INTERVENTION_FAMILY_ID),
    });

  return Object.freeze({
    executionDefinition,
    config: structuredClone(run.config),
    projectTransition: projectFirstAggregateTransition,
    terminationReason: "first-aggregate-heldout-horizon-complete",
  });
}

export function projectFirstAggregateTransition(
  sourceSnapshot: ComposedSimulationSnapshot,
  targetSnapshot: ComposedSimulationSnapshot,
  context: ComposedTransitionProjectionContext,
): {
  readonly input: FirstAggregateDatasetInput;
  readonly target: FirstAggregateDatasetTarget;
} {
  if (
    sourceSnapshot.checkpoint.authority !== "composed" ||
    targetSnapshot.checkpoint.authority !== "composed"
  ) {
    throw new TypeError(
      "first aggregate dataset transition requires composed source and target checkpoints",
    );
  }
  if (
    context.targetSnapshotIndex !== context.sourceSnapshotIndex + 1 ||
    context.snapshotIndex !== context.sourceSnapshotIndex
  ) {
    throw new RangeError(
      "first aggregate dataset transition requires consecutive authoritative observation identity",
    );
  }
  const forecastHorizonTicks = context.targetTick - context.sourceTick;
  if (!Number.isSafeInteger(forecastHorizonTicks) || forecastHorizonTicks < 1) {
    throw new RangeError(
      "first aggregate dataset transition requires a positive exact tick horizon",
    );
  }

  const sourceTimeHours = sourceSnapshot.checkpoint.simulationTimeHours;
  const targetTimeHours = targetSnapshot.checkpoint.simulationTimeHours;
  const forecastHorizonHours = targetTimeHours - sourceTimeHours;
  if (!Number.isFinite(forecastHorizonHours) || forecastHorizonHours <= 0) {
    throw new RangeError(
      "first aggregate dataset transition must advance biological time",
    );
  }

  const sourceMetrics = sourceSnapshot.checkpoint.metrics;
  const targetMetrics = targetSnapshot.checkpoint.metrics;
  return Object.freeze({
    input: Object.freeze({
      sourceSnapshotIndex: context.sourceSnapshotIndex,
      sourceTick: context.sourceTick,
      sourceTimeHours,
      totalBiomass: sourceMetrics.totalBiomass,
      totalResource: sourceMetrics.totalResource,
      occupiedCells: sourceMetrics.occupiedCells,
    }),
    target: Object.freeze({
      targetSnapshotIndex: context.targetSnapshotIndex,
      targetTick: context.targetTick,
      targetTimeHours,
      forecastHorizonTicks,
      forecastHorizonHours,
      totalBiomass: targetMetrics.totalBiomass,
      totalResource: targetMetrics.totalResource,
      occupiedCells: targetMetrics.occupiedCells,
    }),
  });
}

function initialization(
  seed: number,
  initialResourceLevel: number,
  founderBiomass: number,
): FlagshipRunInitialization {
  return Object.freeze({
    seed,
    initialResourceLevel,
    inocula: Object.freeze([
      Object.freeze({
        lineageId: FOUNDER_LINEAGE_ID,
        x: FOUNDER_X,
        y: FOUNDER_Y,
        biomass: founderBiomass,
      }),
    ]),
  });
}

function validateExecutorData(
  data: FirstAggregateDatasetExecutorData,
): void {
  if (
    data === null ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    data.schemaVersion !== FIRST_AGGREGATE_EXECUTOR_DATA_SCHEMA_VERSION
  ) {
    throw new TypeError(
      "unsupported first aggregate dataset executor data",
    );
  }
  validateMechanisticExecutionSchedule(data.executionSchedule);
  if (
    data.executionSchedule.totalTicks !== TOTAL_TICKS ||
    data.executionSchedule.snapshotEveryTicks !== SNAPSHOT_EVERY_TICKS
  ) {
    throw new TypeError(
      "first aggregate dataset execution schedule does not match package authority",
    );
  }
  if (
    !Array.isArray(data.allowedTaskIds) ||
    data.allowedTaskIds.length !== MAX_TRAJECTORIES ||
    new Set(data.allowedTaskIds).size !== data.allowedTaskIds.length
  ) {
    throw new TypeError(
      "first aggregate dataset executor must carry the exact unique task allowlist",
    );
  }
  for (const taskId of data.allowedTaskIds) {
    requireCanonicalText("first aggregate task id", taskId);
  }

  if (
    !Array.isArray(data.conditions) ||
    data.conditions.length !== CONDITION_DESCRIPTORS.length
  ) {
    throw new TypeError(
      "first aggregate dataset executor must carry all nine engineering run conditions",
    );
  }
  const expectedById = new Map(
    CONDITION_DESCRIPTORS.map((condition) => [condition.id, condition] as const),
  );
  const seen = new Set<string>();
  for (const condition of data.conditions) {
    if (
      condition === null ||
      typeof condition !== "object" ||
      Array.isArray(condition)
    ) {
      throw new TypeError(
        "first aggregate dataset run condition must be an object",
      );
    }
    requireCanonicalText("first aggregate run condition id", condition.id);
    if (seen.has(condition.id)) {
      throw new RangeError(
        `duplicate first aggregate run condition id: ${condition.id}`,
      );
    }
    seen.add(condition.id);
    const expected = expectedById.get(condition.id);
    if (
      expected === undefined ||
      condition.initialResourceLevel !== expected.initialResourceLevel ||
      condition.founderBiomass !== expected.founderBiomass
    ) {
      throw new TypeError(
        `first aggregate run condition ${condition.id} does not match package-owned engineering state`,
      );
    }
  }
}

function scaleId(value: number): string {
  if (value === 0.5) return "0p5x";
  if (value === 1) return "1x";
  if (value === 2) return "2x";
  throw new RangeError("unsupported first aggregate engineering scale");
}

function requireCanonicalText(name: string, value: unknown): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value !== value.trim()
  ) {
    throw new TypeError(`${name} must be a canonical non-empty string`);
  }
}
