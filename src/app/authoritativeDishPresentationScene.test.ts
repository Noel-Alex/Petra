import { describe, expect, it } from "vitest";

import type { ComposedSimulationConfig } from "../sim/authoritative";
import { ComposedSimulationEngine } from "../sim/composedEngine";
import type { CuratedMutationGraph } from "../sim/evolution/graph";
import { createAspergillusNo10SurfaceCheckpoint } from "../sim/fungi/aspergillusNo10Surface";
import { createFixtureComposedParameterSetBinding } from "../sim/parameterSetBinding";
import { createRunIdentity, type SimulationSnapshot } from "../sim/protocol";
import {
  AUTHORITATIVE_DISH_PRESENTATION_SCENE_SCHEMA_VERSION,
  projectAuthoritativeDishPresentationScene,
} from "./authoritativeDishPresentationScene";

const graph: CuratedMutationGraph = {
  scenarioId: "heterogeneous-render-scene-fixture",
  scenarioVersion: "1",
  genotypes: [{ id: "WT", relativeFitness: 1, sourceOrder: 0 }],
  transitions: [],
};

const config: ComposedSimulationConfig = {
  width: 1,
  height: 1,
  mask: [1],
  initialResource: [2],
  ciprofloxacinConcentrationMgPerL: [0],
  initialLineageBiomass: [[1]],
  growth: {
    maxDivisionRate: 0,
    halfSaturation: 1,
    biomassYield: 1,
    localCapacity: 10,
    spreadRate: 0,
  },
  lineages: [
    { id: "founder", genotypeId: "WT", deathHazardPerHour: 0 },
  ],
  evolutionGraph: graph,
  evolutionScenario: {
    scenarioId: graph.scenarioId,
    scenarioVersion: graph.scenarioVersion,
  },
  ciprofloxacin: null,
  samplingExecutionPolicy: null,
  dynamicLineageLossPolicy: null,
  populationAuthority: null,
  hoursPerTick: 0.01,
};

function composedSnapshot(): SimulationSnapshot {
  const binding = createFixtureComposedParameterSetBinding(
    "fixture:heterogeneous-render-scene",
    "1",
    config,
  );
  const identity = createRunIdentity({
    scenarioId: graph.scenarioId,
    scenarioVersion: graph.scenarioVersion,
    parameterSetId: binding.parameterSetId,
    parameterSetVersion: binding.parameterSetVersion,
    parameterSetBinding: binding,
    seed: 17,
  });
  return new ComposedSimulationEngine(identity, config).snapshot();
}

describe("authoritative heterogeneous dish presentation scene", () => {
  it("projects the live composed runtime through the existing admitted dish projector", () => {
    const scene = projectAuthoritativeDishPresentationScene({
      composedRuntime: {
        snapshot: composedSnapshot(),
        runBranchIdentity: "fixture-branch-0",
      },
    });

    expect(scene).not.toBeNull();
    expect(scene).toMatchObject({
      schemaVersion: AUTHORITATIVE_DISH_PRESENTATION_SCENE_SCHEMA_VERSION,
      kind: "composed-runtime",
      authorityScope: "accepted-composed-runtime",
      biologicalTimeHours: 0,
      fungalFront: null,
    });
    if (scene?.kind !== "composed-runtime") {
      throw new Error("expected composed runtime dish scene");
    }
    expect(scene.dish.samplingIdentity).toBe("runtime-branch:fixture-branch-0");
    expect([...scene.dish.biomass]).toEqual([1]);
    expect(scene.dish.fields.map((field) => field.id)).toEqual([
      "authoritative-resource",
      "authoritative-ciprofloxacin",
      "authoritative-biomass",
    ]);
    expect(Object.isFrozen(scene)).toBe(true);
  });

  it("projects the supported fungal checkpoint only as standalone source-validation authority", () => {
    const checkpoint = createAspergillusNo10SurfaceCheckpoint(70);
    const scene = projectAuthoritativeDishPresentationScene({
      fungalSourceValidationCheckpoint: checkpoint,
    });

    expect(scene).not.toBeNull();
    expect(scene).toMatchObject({
      schemaVersion: AUTHORITATIVE_DISH_PRESENTATION_SCENE_SCHEMA_VERSION,
      kind: "fungal-source-validation",
      authorityScope: "source-validation-only",
      biologicalTimeHours: 0,
      dish: null,
    });
    if (scene?.kind !== "fungal-source-validation") {
      throw new Error("expected fungal source-validation dish scene");
    }
    expect(scene.fungalFront.treatmentId).toBe(checkpoint.treatmentId);
    expect(scene.fungalFront.front.radiusUm).toBe(0);
    expect(scene.fungalFront.unsupportedScientificSemantics).toContain(
      "spatial-density",
    );
    expect(scene.fungalFront.unsupportedScientificSemantics).toContain(
      "bacteria-fungus-interaction",
    );
    expect(Object.isFrozen(scene)).toBe(true);
  });

  it("refuses equal-time bacterial and fungal authority without a shared runtime transaction", () => {
    const runtime = composedSnapshot();
    const fungal = createAspergillusNo10SurfaceCheckpoint(70);

    expect(runtime.checkpoint.simulationTimeHours).toBe(0);
    expect(fungal.biologicalTimeHours).toBe(0);

    expect(() =>
      projectAuthoritativeDishPresentationScene({
        composedRuntime: {
          snapshot: runtime,
          runBranchIdentity: "fixture-branch-equal-time",
        },
        fungalSourceValidationCheckpoint: fungal,
      }),
    ).toThrow(/shared accepted runtime transaction/);
  });

  it("fails closed when composed-runtime mode is given synthetic authority", () => {
    const synthetic: SimulationSnapshot = {
      traceHash: "synthetic-trace",
      events: [],
      checkpoint: {
        identity: createRunIdentity({
          scenarioId: "synthetic",
          scenarioVersion: "1",
          parameterSetId: "synthetic",
          parameterSetVersion: "1",
          seed: 1,
        }),
        tick: 0,
        simulationTimeHours: 0,
        commandCount: 0,
        syntheticPopulation: 1,
        rngState: [1, 2, 3, 4],
      },
    };

    expect(() =>
      projectAuthoritativeDishPresentationScene({
        composedRuntime: {
          snapshot: synthetic,
          runBranchIdentity: "synthetic-branch",
        },
      }),
    ).toThrow(/authoritative composed simulation snapshot/);
  });

  it("returns no authoritative scene when neither scientific source exists", () => {
    expect(projectAuthoritativeDishPresentationScene({})).toBeNull();
  });
});
