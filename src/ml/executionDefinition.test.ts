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
  assertTaskMatchesMechanisticExecutionDefinition,
  createMechanisticExecutionDefinition,
  createNoInterventionExecutionDefinition,
  createNoInterventionSweepFamily,
  createSweepParameterPointForBinding,
  mechanisticInterventionFingerprint,
  mechanisticParameterSetHash,
  type NoInterventionExecutionDefinition,
} from "./executionDefinition";
import { createComposedMechanisticTaskExecutor } from "./runner";
import type { MechanisticSweepTask } from "./sweep";

const evolutionGraph: CuratedMutationGraph = {
  scenarioId: "ml-execution-fixture",
  scenarioVersion: "1",
  genotypes: [
    { id: "WT", relativeFitness: 1, sourceOrder: 0 },
    { id: "VAR", relativeFitness: 0.9, sourceOrder: 1 },
  ],
  transitions: [],
};

const config: ComposedSimulationConfig = {
  width: 2,
  height: 1,
  mask: [1, 1],
  initialResource: [8, 8],
  initialLineageBiomass: [[1, 0], [2, 0]],
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
  lineages: [
    { id: "ancestor", genotypeId: "WT", deathHazardPerHour: 0 },
    { id: "variant", genotypeId: "VAR", deathHazardPerHour: 0.1 },
  ],
  hoursPerTick: 0.01,
};

const binding: ComposedParameterSetBinding = {
  schemaVersion: COMPOSED_PARAMETER_SET_BINDING_SCHEMA_VERSION,
  authority: "provenance",
  parameterSetId: "ml-execution-fixture-parameters",
  parameterSetVersion: "1",
  configurationFingerprint: composedConfigurationFingerprint(config),
};

function makeTask(args?: {
  parameterSetHash?: string;
  interventionFamilyId?: string;
  interventionFingerprint?: string;
}): MechanisticSweepTask {
  const parameterPoint = createSweepParameterPointForBinding("baseline", binding);
  const family = createNoInterventionSweepFamily("untreated");
  const parameterSetHash = args?.parameterSetHash ?? parameterPoint.parameterSetHash;
  const interventionFamilyId = args?.interventionFamilyId ?? family.id;
  const interventionFingerprint =
    args?.interventionFingerprint ?? family.fingerprint;

  return {
    taskId: "ml-execution-fixture-task",
    datasetVersion: "fixture-dataset-v1",
    normalizationProfileId: "fixture-normalization-v1",
    datasetSchema: {
      schemaVersion: "mechanistic-dataset-schema-v1",
      inputSchemaVersion: "fixture-input-v1",
      targetSchemaVersion: "fixture-target-v1",
    },
    parameterPointId: parameterPoint.id,
    interventionFamilyId,
    split: "train",
    trajectory: {
      group: {
        engineVersion: ENGINE_VERSION,
        parameterSetHash,
        scenarioId: evolutionGraph.scenarioId,
        scenarioVersion: evolutionGraph.scenarioVersion,
        groupId: `intervention:${interventionFingerprint.length}:${interventionFingerprint}`,
      },
      seed: 7,
      interventionFingerprint,
    },
    splitGroupKey: "fixture-group-key",
    trajectoryKey: "fixture-trajectory-key",
  };
}

function executionDefinition(familyId = "untreated") {
  return createMechanisticExecutionDefinition({
    parameterSetBinding: binding,
    intervention: createNoInterventionExecutionDefinition(familyId),
  });
}

describe("mechanistic execution-definition provenance", () => {
  it("derives sweep parameter identity from the exact composed binding", () => {
    const hash = mechanisticParameterSetHash(binding);
    expect(createSweepParameterPointForBinding("baseline", binding)).toEqual({
      id: "baseline",
      parameterSetHash: hash,
    });

    expect(
      mechanisticParameterSetHash({
        ...binding,
        parameterSetVersion: "2",
      }),
    ).not.toBe(hash);
    expect(
      mechanisticParameterSetHash({
        ...binding,
        configurationFingerprint:
          binding.configurationFingerprint + "-different",
      }),
    ).not.toBe(hash);
  });

  it("keeps no-intervention biology independent of presentation family naming", () => {
    const untreated = createNoInterventionExecutionDefinition("untreated");
    const control = createNoInterventionExecutionDefinition("control");

    expect(mechanisticInterventionFingerprint(untreated)).toBe(
      mechanisticInterventionFingerprint(control),
    );
    expect(createNoInterventionSweepFamily("untreated").fingerprint).toBe(
      createNoInterventionSweepFamily("control").fingerprint,
    );
  });

  it("accepts a task only when parameter and intervention identities match authority", () => {
    expect(() =>
      assertTaskMatchesMechanisticExecutionDefinition(
        makeTask(),
        executionDefinition(),
        config,
      ),
    ).not.toThrow();

    expect(() =>
      assertTaskMatchesMechanisticExecutionDefinition(
        makeTask({ parameterSetHash: "opaque-wrong-hash" }),
        executionDefinition(),
        config,
      ),
    ).toThrow(/parameterSetHash/);

    expect(() =>
      assertTaskMatchesMechanisticExecutionDefinition(
        makeTask({ interventionFamilyId: "renamed-display-family" }),
        executionDefinition(),
        config,
      ),
    ).toThrow(/interventionFamilyId/);

    expect(() =>
      assertTaskMatchesMechanisticExecutionDefinition(
        makeTask({ interventionFingerprint: "opaque-wrong-fingerprint" }),
        executionDefinition(),
        config,
      ),
    ).toThrow(/intervention fingerprint/);
  });

  it("refuses a binding/config mismatch before composed execution", () => {
    const driftedConfig: ComposedSimulationConfig = {
      ...config,
      growth: {
        ...config.growth,
        maxDivisionRate: config.growth.maxDivisionRate + 0.01,
      },
    };

    expect(() =>
      assertTaskMatchesMechanisticExecutionDefinition(
        makeTask(),
        executionDefinition(),
        driftedConfig,
      ),
    ).toThrow(/configuration fingerprint/);
  });

  it("refuses command-bearing intervention metadata until composed authority exposes typed commands", () => {
    const invalid = {
      schemaVersion: "petra-ml-intervention-schedule-v1",
      familyId: "dose",
      scheduleVersion: "no-intervention-v1",
      commands: [{ type: "dose", value: 1 }],
    } as unknown as NoInterventionExecutionDefinition;

    expect(() => mechanisticInterventionFingerprint(invalid)).toThrow(
      /explicitly empty intervention command schedule/,
    );
  });

  it("makes the composed executor fail identity mismatch before projection", async () => {
    let projected = false;
    const executor = createComposedMechanisticTaskExecutor(() => ({
      executionDefinition: executionDefinition(),
      config,
      totalTicks: 0,
      snapshotEveryTicks: 1,
      project: () => {
        projected = true;
        return {
          input: { biomass: 0 },
          target: { futureBiomass: 0 },
        };
      },
    }));

    await expect(
      executor.execute(makeTask({ parameterSetHash: "wrong-before-engine" })),
    ).rejects.toThrow(/parameterSetHash/);
    expect(projected).toBe(false);
  });

  it("executes the explicit no-intervention composed definition when identities match", async () => {
    const executor = createComposedMechanisticTaskExecutor(() => ({
      executionDefinition: executionDefinition(),
      config,
      totalTicks: 0,
      snapshotEveryTicks: 1,
      project: (snapshot) => ({
        input: { biomass: snapshot.checkpoint.metrics.totalBiomass },
        target: { resource: snapshot.checkpoint.metrics.totalResource },
      }),
    }));

    const result = await executor.execute(makeTask());
    expect(result.taskId).toBe("ml-execution-fixture-task");
    expect(result.samples).toHaveLength(1);
    expect(result.samples[0]).toMatchObject({
      snapshotIndex: 0,
      terminationReason: "completed-horizon",
      input: { biomass: 3 },
      target: { resource: 16 },
    });
  });
});
