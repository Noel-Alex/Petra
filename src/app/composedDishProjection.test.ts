import { describe, expect, it } from "vitest";

import { resolveLineageVisualIdentity } from "../design/lineageIdentity";
import type { ComposedSimulationConfig } from "../sim/authoritative";
import { ComposedSimulationEngine } from "../sim/composedEngine";
import type { CuratedMutationGraph } from "../sim/evolution/graph";
import { createFixtureComposedParameterSetBinding } from "../sim/parameterSetBinding";
import {
  createRunIdentity,
  type SimulationSnapshot,
} from "../sim/protocol";
import {
  projectAuthoritativeComposedDishSnapshot,
  projectComposedDishSnapshot,
} from "./composedDishProjection";

const graph: CuratedMutationGraph = {
  scenarioId: "dish-projection-fixture",
  scenarioVersion: "1",
  genotypes: [
    { id: "WT", relativeFitness: 1, sourceOrder: 0 },
    { id: "VAR", relativeFitness: 0.9, sourceOrder: 1 },
  ],
  transitions: [],
};

const config: ComposedSimulationConfig = {
  width: 2,
  height: 2,
  mask: [1, 1, 1, 0],
  initialResource: [4, 2, 1, 0],
  ciprofloxacinConcentrationMgPerL: [0, 0, 0, 0],
  initialLineageBiomass: [
    [1, 0.5, 0, 0],
    [0.5, 0.25, 2, 0],
  ],
  growth: {
    maxDivisionRate: 0,
    halfSaturation: 1,
    biomassYield: 1,
    localCapacity: 10,
    spreadRate: 0,
  },
  lineages: [
    { id: "founder-wt", genotypeId: "WT", deathHazardPerHour: 0 },
    { id: "variant-a", genotypeId: "VAR", deathHazardPerHour: 0 },
  ],
  evolutionGraph: graph,
  evolutionScenario: {
    scenarioId: graph.scenarioId,
    scenarioVersion: graph.scenarioVersion,
  },
  ciprofloxacin: {
    policyId: "reference_pd_decrement_as_first_order_loss_v1",
    concentrationUnit: "mg/L",
    referencePharmacodynamics: {
      psiMaxLog10PerHour: 0.88,
      psiMinLog10PerHour: -6.5,
      zMic: 0.017,
      kappa: 1.1,
    },
    referenceMicMgPerL: 0.03,
    genotypeMicMgPerL: [
      { genotypeId: "WT", micMgPerL: 0.016 },
      { genotypeId: "VAR", micMgPerL: 0.38 },
    ],
  },
  samplingExecutionPolicy: null,
  populationAuthority: null,
  hoursPerTick: 0.01,
};

function composedEngine(seed = 17): ComposedSimulationEngine {
  const binding = createFixtureComposedParameterSetBinding(
    "fixture:dish-projection",
    "1",
    config,
  );
  const identity = createRunIdentity({
    scenarioId: graph.scenarioId,
    scenarioVersion: graph.scenarioVersion,
    parameterSetId: binding.parameterSetId,
    parameterSetVersion: binding.parameterSetVersion,
    parameterSetBinding: binding,
    seed,
  });
  return new ComposedSimulationEngine(identity, config);
}

function syntheticSnapshot(): SimulationSnapshot {
  return {
    traceHash: "synthetic-trace",
    events: [],
    checkpoint: {
      identity: createRunIdentity({
        scenarioId: "synthetic-fixture",
        scenarioVersion: "1",
        parameterSetId: "synthetic-fixture",
        parameterSetVersion: "1",
        seed: 4,
      }),
      tick: 0,
      simulationTimeHours: 0,
      commandCount: 0,
      syntheticPopulation: 10,
      rngState: [1, 2, 3, 4],
    },
  };
}

describe("authoritative composed dish projection", () => {
  it("projects exact authoritative spatial channels into presentation arrays", () => {
    const simulation = composedEngine().snapshot();
    if (simulation.checkpoint.authority !== "composed") {
      throw new Error("expected composed snapshot");
    }

    const dish = projectAuthoritativeComposedDishSnapshot(
      simulation,
      "fixture-branch-0",
    );

    expect([...dish.dishMask]).toEqual([1, 1, 1, 0]);
    expect([...dish.biomass]).toEqual([1.5, 0.75, 2, 0]);
    expect(dish.simulationTimeHours).toBe(
      simulation.checkpoint.simulationTimeHours,
    );
    expect(dish.snapshotId).toBe(`composed-trace:${simulation.traceHash}`);
    expect(dish.samplingIdentity).toBe("runtime-branch:fixture-branch-0");
    expect(dish.events).toEqual([]);

    const resource = dish.fields.find(
      (field) => field.id === "authoritative-resource",
    );
    expect(resource).toMatchObject({
      kind: "nutrient",
      label: "Limiting resource",
      unit: "model-resource",
      rangeMode: "snapshot-extrema",
      minimum: 1,
      maximum: 4,
    });
    expect(resource === undefined ? null : [...resource.values]).toEqual([
      4, 2, 1, 0,
    ]);

    const drug = dish.fields.find(
      (field) => field.id === "authoritative-ciprofloxacin",
    );
    expect(drug).toMatchObject({
      kind: "antibiotic",
      label: "Ciprofloxacin",
      unit: "mg/L",
      rangeMode: "snapshot-extrema",
      minimum: 0,
      maximum: 0,
    });

    const biomass = dish.fields.find(
      (field) => field.id === "authoritative-biomass",
    );
    expect(biomass).toMatchObject({
      kind: "biomass",
      label: "Total biomass",
      unit: "model-biomass",
      rangeMode: "snapshot-extrema",
      minimum: 0.75,
      maximum: 2,
    });
  });

  it("uses deterministic neutral lineage presentation identity without phenotype inference", () => {
    const simulation = composedEngine().snapshot();
    if (simulation.checkpoint.authority !== "composed") {
      throw new Error("expected composed snapshot");
    }
    const dish = projectAuthoritativeComposedDishSnapshot(
      simulation,
      "fixture-branch-0",
    );

    expect(dish.lineages).toHaveLength(2);
    for (const lineage of dish.lineages) {
      const expected = resolveLineageVisualIdentity(lineage.id);
      expect(lineage.label).toBe(lineage.id);
      expect(lineage.appearanceToken).toBe(expected.appearanceToken);
      expect(lineage.patternToken).toBe(expected.patternToken);
    }
    expect([...dish.lineages[0]!.density]).toEqual([1, 0.5, 0, 0]);
    expect([...dish.lineages[1]!.density]).toEqual([0.5, 0.25, 2, 0]);
  });

  it("keeps sampling stable within one runtime branch and rotates it across history generations", () => {
    const engine = composedEngine();
    const firstSimulation = engine.snapshot();
    if (firstSimulation.checkpoint.authority !== "composed") {
      throw new Error("expected composed snapshot");
    }
    const first = projectAuthoritativeComposedDishSnapshot(
      firstSimulation,
      "fixture-branch-0",
    );

    engine.execute({ id: "advance-one", type: "advance", ticks: 1 });
    const secondSimulation = engine.snapshot();
    if (secondSimulation.checkpoint.authority !== "composed") {
      throw new Error("expected composed snapshot");
    }
    const second = projectAuthoritativeComposedDishSnapshot(
      secondSimulation,
      "fixture-branch-0",
    );
    const forked = projectAuthoritativeComposedDishSnapshot(
      secondSimulation,
      "fixture-branch-1",
    );

    expect(second.samplingIdentity).toBe(first.samplingIdentity);
    expect(forked.samplingIdentity).not.toBe(second.samplingIdentity);
    expect(second.snapshotId).not.toBe(first.snapshotId);
    expect(second.simulationTimeHours).toBe(0.01);
  });

  it("projects the current mutable ciprofloxacin field after real intervention acceptance", () => {
    const engine = composedEngine();
    engine.execute({
      id: "dose",
      type: "apply-ciprofloxacin",
      intervention: {
        schemaVersion: 1,
        concentrationMgPerL: 0.125,
        concentrationUnit: "mg/L",
        blendMode: "set",
        geometry: { kind: "global" },
      },
    });
    const simulation = engine.snapshot();
    if (simulation.checkpoint.authority !== "composed") {
      throw new Error("expected composed snapshot");
    }
    const dish = projectAuthoritativeComposedDishSnapshot(
      simulation,
      "fixture-branch-0",
    );
    const drug = dish.fields.find(
      (field) => field.id === "authoritative-ciprofloxacin",
    );

    expect(drug).toMatchObject({
      rangeMode: "snapshot-extrema",
      minimum: 0.125,
      maximum: 0.125,
    });
    expect(drug === undefined ? null : [...drug.values]).toEqual([
      0.125, 0.125, 0.125, 0,
    ]);
    expect(dish.simulationTimeHours).toBe(0);
  });


  it("rejects cross-channel checkpoint drift before publishing render data", () => {
    const simulation = composedEngine().snapshot();
    if (simulation.checkpoint.authority !== "composed") {
      throw new Error("expected composed snapshot");
    }

    const totalBiomassDrift = {
      ...structuredClone(simulation),
      checkpoint: {
        ...structuredClone(simulation.checkpoint),
        metrics: {
          ...structuredClone(simulation.checkpoint.metrics),
          totalBiomass: simulation.checkpoint.metrics.totalBiomass + 0.25,
        },
      },
    };
    expect(() =>
      projectAuthoritativeComposedDishSnapshot(
        totalBiomassDrift,
        "fixture-branch-0",
      ),
    ).toThrow(/total biomass metric does not match spatial state/);

    const totalResourceDrift = {
      ...structuredClone(simulation),
      checkpoint: {
        ...structuredClone(simulation.checkpoint),
        metrics: {
          ...structuredClone(simulation.checkpoint.metrics),
          totalResource: simulation.checkpoint.metrics.totalResource + 1,
        },
      },
    };
    expect(() =>
      projectAuthoritativeComposedDishSnapshot(
        totalResourceDrift,
        "fixture-branch-0",
      ),
    ).toThrow(/total resource metric does not match spatial state/);

    const occupiedCellDrift = {
      ...structuredClone(simulation),
      checkpoint: {
        ...structuredClone(simulation.checkpoint),
        metrics: {
          ...structuredClone(simulation.checkpoint.metrics),
          occupiedCells: 0,
        },
      },
    };
    expect(() =>
      projectAuthoritativeComposedDishSnapshot(
        occupiedCellDrift,
        "fixture-branch-0",
      ),
    ).toThrow(/occupied-cell metric does not match spatial state/);

    const lineageMetricDrift = {
      ...structuredClone(simulation),
      checkpoint: {
        ...structuredClone(simulation.checkpoint),
        metrics: {
          ...structuredClone(simulation.checkpoint.metrics),
          lineageBiomass: {
            ...structuredClone(simulation.checkpoint.metrics.lineageBiomass),
            "founder-wt":
              simulation.checkpoint.metrics.lineageBiomass["founder-wt"]! + 0.25,
          },
        },
      },
    };
    expect(() =>
      projectAuthoritativeComposedDishSnapshot(
        lineageMetricDrift,
        "fixture-branch-0",
      ),
    ).toThrow(/lineage "founder-wt" biomass metric does not match spatial state/);

    const lineageIdentityDrift = {
      ...structuredClone(simulation),
      checkpoint: {
        ...structuredClone(simulation.checkpoint),
        metrics: {
          ...structuredClone(simulation.checkpoint.metrics),
          lineageBiomass: {
            ...structuredClone(simulation.checkpoint.metrics.lineageBiomass),
            foreign: 0,
          },
        },
      },
    };
    expect(() =>
      projectAuthoritativeComposedDishSnapshot(
        lineageIdentityDrift,
        "fixture-branch-0",
      ),
    ).toThrow(/metrics must exactly match authoritative lineage identity/);

    const malformedGenotype = structuredClone(simulation);
    malformedGenotype.checkpoint.composedState.genotypeIds[0] = " WT";
    expect(() =>
      projectAuthoritativeComposedDishSnapshot(
        malformedGenotype,
        "fixture-branch-0",
      ),
    ).toThrow(/genotype id must be canonical non-empty text/);
  });

  it("rejects malformed authoritative spatial state instead of rendering it", () => {
    const simulation = composedEngine().snapshot();
    if (simulation.checkpoint.authority !== "composed") {
      throw new Error("expected composed snapshot");
    }

    const offMaskResource = structuredClone(simulation);
    offMaskResource.checkpoint.composedState.resource[3] = Number.MIN_VALUE;
    expect(() =>
      projectAuthoritativeComposedDishSnapshot(
        offMaskResource,
        "fixture-branch-0",
      ),
    ).toThrow(/resource must be zero outside the dish mask/);

    const nonBinaryMask = structuredClone(simulation);
    nonBinaryMask.checkpoint.composedState.mask[0] = 256;
    expect(() =>
      projectAuthoritativeComposedDishSnapshot(
        nonBinaryMask,
        "fixture-branch-0",
      ),
    ).toThrow(/binary dish mask/);

    expect(() =>
      projectAuthoritativeComposedDishSnapshot(simulation, " "),
    ).toThrow(/canonical runtime branch identity/);
  });

  it("fails closed to no dish projection for synthetic or absent authority", () => {
    expect(projectComposedDishSnapshot(null, "fixture-branch-0")).toBeNull();
    expect(
      projectComposedDishSnapshot(syntheticSnapshot(), "fixture-branch-0"),
    ).toBeNull();
  });

});
