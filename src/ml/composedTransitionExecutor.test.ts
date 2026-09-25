import { describe, expect, it } from "vitest";

import {
  composedConfigurationFingerprint,
  type ComposedSimulationConfig,
} from "../sim/authoritative";
import type { CuratedMutationGraph } from "../sim/evolution/graph";
import {
  COMPOSED_PARAMETER_SET_BINDING_SCHEMA_VERSION,
  type ComposedParameterSetBinding,
} from "../sim/parameterSetBinding";
import { ENGINE_VERSION } from "../sim/protocol";
import {
  createMechanisticExecutionDefinition,
  createMechanisticRunConditionExecutionDefinition,
  createNoInterventionExecutionDefinition,
  createNoInterventionSweepFamily,
  createSweepParameterPointForBinding,
  createSweepRunConditionForConfig,
} from "./executionDefinition";
import {
  createMechanisticExecutionSchedule,
  mechanisticExecutionScheduleIdentity,
  type MechanisticExecutionSchedule,
} from "./executionSchedule";
import { createComposedMechanisticTaskExecutor } from "./runner";
import {
  splitGroupKey,
  trajectoryKey,
  type DatasetGroupIdentity,
  type TrajectoryIdentity,
} from "./dataset";
import type { MechanisticSweepTask } from "./sweep";

const evolutionGraph: CuratedMutationGraph = {
  scenarioId: "ml-transition-fixture",
  scenarioVersion: "1",
  genotypes: [{ id: "WT", relativeFitness: 1, sourceOrder: 0 }],
  transitions: [],
};

const config: ComposedSimulationConfig = {
  width: 2,
  height: 1,
  mask: [1, 1],
  initialResource: [8, 8],
  ciprofloxacinConcentrationMgPerL: [0, 0],
  initialLineageBiomass: [[1, 0]],
  growth: {
    maxDivisionRate: 0.8,
    halfSaturation: 2,
    biomassYield: 0.5,
    localCapacity: 20,
    spreadRate: 0,
  },
  evolutionGraph,
  evolutionScenario: {
    scenarioId: evolutionGraph.scenarioId,
    scenarioVersion: evolutionGraph.scenarioVersion,
  },
  ciprofloxacin: null,
  samplingExecutionPolicy: null,
  dynamicLineageLossPolicy: null,
  populationAuthority: null,
  lineages: [{ id: "ancestor", genotypeId: "WT", deathHazardPerHour: 0 }],
  hoursPerTick: 0.01,
};

const binding: ComposedParameterSetBinding = {
  schemaVersion: COMPOSED_PARAMETER_SET_BINDING_SCHEMA_VERSION,
  authority: "provenance",
  parameterSetId: "ml-transition-fixture-parameters",
  parameterSetVersion: "1",
  configurationFingerprint: composedConfigurationFingerprint(config),
};

function taskFor(schedule: MechanisticExecutionSchedule): MechanisticSweepTask {
  const parameterPoint = createSweepParameterPointForBinding(
    "baseline",
    binding,
    config,
  );
  const runCondition = createSweepRunConditionForConfig(
    "baseline-condition",
    config,
  );
  const family = createNoInterventionSweepFamily("untreated");
  const group: DatasetGroupIdentity = {
    engineVersion: ENGINE_VERSION,
    parameterSetHash: parameterPoint.parameterSetHash,
    scenarioId: evolutionGraph.scenarioId,
    scenarioVersion: evolutionGraph.scenarioVersion,
    runConditionFingerprint: runCondition.fingerprint,
    groupId: "ml-transition-fixture-group",
  };
  const trajectory: TrajectoryIdentity = {
    group,
    seed: 7,
    interventionFingerprint: family.fingerprint,
  };

  return {
    taskId: "ml-transition-fixture-task",
    datasetVersion: "ml-transition-fixture-v1",
    normalizationProfileId: "identity-none",
    datasetSchema: {
      schemaVersion: "mechanistic-dataset-schema-v1",
      inputSchemaVersion: "transition-input-v1",
      targetSchemaVersion: "transition-target-v1",
    },
    executionSchedule: schedule,
    executionScheduleIdentity: mechanisticExecutionScheduleIdentity(schedule),
    parameterPointId: parameterPoint.id,
    runConditionId: runCondition.id,
    interventionFamilyId: family.id,
    split: "train",
    trajectory,
    splitGroupKey: splitGroupKey(group),
    trajectoryKey: trajectoryKey(trajectory),
  };
}

function definitionFor(schedule: MechanisticExecutionSchedule) {
  return {
    executionDefinition: createMechanisticExecutionDefinition({
      parameterSetBinding: binding,
      runCondition: createMechanisticRunConditionExecutionDefinition(
        "baseline-condition",
        config,
      ),
      executionSchedule: schedule,
      intervention: createNoInterventionExecutionDefinition("untreated"),
    }),
    config,
  };
}

describe("composed transition projector", () => {
  it("pairs each exact pre-advance state with its accepted post-advance state", async () => {
    const schedule = createMechanisticExecutionSchedule({
      totalTicks: 4,
      snapshotEveryTicks: 2,
    });
    const task = taskFor(schedule);
    const observed: Array<{
      sourceTick: number;
      targetTick: number;
      sourceTimeHours: number;
      targetTimeHours: number;
    }> = [];

    const executor = createComposedMechanisticTaskExecutor(() => ({
      ...definitionFor(schedule),
      projectTransition: (source, target, context) => {
        observed.push({
          sourceTick: context.sourceTick,
          targetTick: context.targetTick,
          sourceTimeHours: source.checkpoint.simulationTimeHours,
          targetTimeHours: target.checkpoint.simulationTimeHours,
        });
        return {
          input: {
            sourceTick: context.sourceTick,
            totalBiomass: source.checkpoint.metrics.totalBiomass,
          },
          target: {
            targetTick: context.targetTick,
            totalBiomass: target.checkpoint.metrics.totalBiomass,
          },
        };
      },
      terminationReason: "transition-horizon-complete",
    }));

    const result = await executor.execute(task);

    expect(observed).toEqual([
      {
        sourceTick: 0,
        targetTick: 2,
        sourceTimeHours: 0,
        targetTimeHours: 0.02,
      },
      {
        sourceTick: 2,
        targetTick: 4,
        sourceTimeHours: 0.02,
        targetTimeHours: 0.04,
      },
    ]);
    expect(result.samples).toHaveLength(2);
    expect(result.samples[0]).toMatchObject({
      snapshotIndex: 0,
      simulationTimeHours: 0,
      input: { sourceTick: 0 },
      target: { targetTick: 2 },
    });
    expect(result.samples[0]!.terminationReason).toBeUndefined();
    expect(result.samples[1]).toMatchObject({
      snapshotIndex: 1,
      simulationTimeHours: 0.02,
      input: { sourceTick: 2 },
      target: { targetTick: 4 },
      terminationReason: "transition-horizon-complete",
    });
  });

  it("refuses a transition projector when no authoritative advance exists", async () => {
    const schedule = createMechanisticExecutionSchedule({
      totalTicks: 0,
      snapshotEveryTicks: 1,
    });
    const task = taskFor(schedule);
    const executor = createComposedMechanisticTaskExecutor(() => ({
      ...definitionFor(schedule),
      projectTransition: () => ({
        input: { sourceTick: 0 },
        target: { targetTick: 0 },
      }),
    }));

    await expect(executor.execute(task)).rejects.toThrow(
      /requires at least one authoritative advance/,
    );
  });

  it("refuses ambiguous definitions with both projection modes", async () => {
    const schedule = createMechanisticExecutionSchedule({
      totalTicks: 2,
      snapshotEveryTicks: 1,
    });
    const task = taskFor(schedule);
    const executor = createComposedMechanisticTaskExecutor(() => ({
      ...definitionFor(schedule),
      project: () => ({
        input: { value: 1 },
        target: { value: 1 },
      }),
      projectTransition: () => ({
        input: { value: 1 },
        target: { value: 2 },
      }),
    }));

    await expect(executor.execute(task)).rejects.toThrow(
      /exactly one of project or projectTransition/,
    );
  });
});
