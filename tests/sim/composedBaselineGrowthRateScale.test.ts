import { describe, expect, it } from "vitest";

import {
  composedConfigurationFingerprint,
  createComposedState,
  stepComposedStateDetailed,
  type ComposedSimulationConfig,
} from "../../src/sim/authoritative";
import type { CuratedMutationGraph } from "../../src/sim/evolution/graph";
import { LineageRegistry } from "../../src/sim/evolution/lineage";

const graph: CuratedMutationGraph = {
  scenarioId: "baseline-growth-scale-fixture",
  scenarioVersion: "1",
  genotypes: [
    { id: "A", relativeFitness: 1, sourceOrder: 0 },
    { id: "B", relativeFitness: 1, sourceOrder: 1 },
  ],
  transitions: [],
};

function twoFounderConfig(): ComposedSimulationConfig {
  return {
    width: 1,
    height: 1,
    mask: [1],
    initialResource: [100],
    ciprofloxacinConcentrationMgPerL: [0],
    initialLineageBiomass: [[1], [1]],
    growth: {
      maxDivisionRate: 1,
      halfSaturation: 0.001,
      biomassYield: 100,
      localCapacity: 1_000,
      spreadRate: 0,
    },
    lineages: [
      {
        id: "fast-founder",
        genotypeId: "A",
        baselineGrowthRateScale: 1,
        deathHazardPerHour: 0,
      },
      {
        id: "slow-founder",
        genotypeId: "A",
        baselineGrowthRateScale: 0.5,
        deathHazardPerHour: 0,
      },
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
    hoursPerTick: 0.1,
  };
}

function childInheritanceConfig(): ComposedSimulationConfig {
  return {
    ...twoFounderConfig(),
    initialLineageBiomass: [[1]],
    lineages: [
      {
        id: "taxon-founder",
        genotypeId: "A",
        baselineGrowthRateScale: 0.25,
        deathHazardPerHour: 0,
      },
    ],
    dynamicLineageLossPolicy: {
      schemaVersion: 1,
      id: "fixture-child-loss",
      rule: "explicit-genotype-table-v1",
      entries: [
        {
          genotypeId: "B",
          deathHazardPerHour: 0,
          provenance: {
            classification: "engineering",
            sourceKeys: [],
            context: "Numerical fixture for baseline growth-scale inheritance.",
            limitation: "No biological loss value is claimed.",
          },
        },
      ],
    },
  };
}

describe("composed baseline lineage growth-rate scale", () => {
  it("keeps organism-level growth scaling separate from genotype fitness", () => {
    const config = twoFounderConfig();
    const state = createComposedState(config);
    const result = stepComposedStateDetailed(state, config);

    const fast = result.ecologyObservation.divisionBiomassByLineage[0]![0]!;
    const slow = result.ecologyObservation.divisionBiomassByLineage[1]![0]!;

    expect(fast / slow).toBeCloseTo(2, 6);
    expect(state.genotypeIds).toEqual(["A", "A"]);
  });

  it("binds an explicit baseline scale into composed configuration identity", () => {
    const explicit = twoFounderConfig();
    const legacyNeutral: ComposedSimulationConfig = {
      ...explicit,
      lineages: explicit.lineages.map((lineage) => ({
        id: lineage.id,
        genotypeId: lineage.genotypeId,
        deathHazardPerHour: lineage.deathHazardPerHour,
      })),
    };

    expect(composedConfigurationFingerprint(explicit)).not.toBe(
      composedConfigurationFingerprint(legacyNeutral),
    );

    const legacyState = createComposedState(legacyNeutral);
    const legacy = stepComposedStateDetailed(legacyState, legacyNeutral);
    expect(
      legacy.ecologyObservation.divisionBiomassByLineage[0]![0],
    ).toBeCloseTo(
      legacy.ecologyObservation.divisionBiomassByLineage[1]![0]!,
      6,
    );
  });

  it("inherits the configured founder scale through runtime lineage ancestry", () => {
    const config = childInheritanceConfig();
    const founderState = createComposedState(config);
    const registry = LineageRegistry.restore(founderState.lineageRegistry);
    const child = registry.create({
      parentLineageId: founderState.lineageIds[0]!,
      genotypeId: "B",
      createdAtHours: 0,
      originCellIndex: 0,
      mutationClass: "fixture-child",
    });

    const state = {
      ...founderState,
      lineageIds: [...founderState.lineageIds, child.lineageId],
      genotypeIds: [...founderState.genotypeIds, child.genotypeId],
      baselineDeathHazardPerHour: [
        ...founderState.baselineDeathHazardPerHour,
        0,
      ],
      lineageRegistry: registry.checkpoint(),
      lineageBiomass: [...founderState.lineageBiomass, [1]],
    };

    const result = stepComposedStateDetailed(state, config);
    const founderDivision =
      result.ecologyObservation.divisionBiomassByLineage[0]![0]!;
    const childDivision =
      result.ecologyObservation.divisionBiomassByLineage[1]![0]!;

    expect(child.genotypeId).toBe("B");
    expect(founderDivision).toBeCloseTo(childDivision, 6);
  });
});
