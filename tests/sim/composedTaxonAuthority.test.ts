import { describe, expect, it } from "vitest";

import {
  composedConfigurationFingerprint,
  createComposedState,
  validateComposedStateAgainstConfig,
  type ComposedSimulationConfig,
} from "../../src/sim/authoritative";
import type { CuratedMutationGraph } from "../../src/sim/evolution/graph";
import {
  AUTHORITATIVE_TAXON_IDENTITY_SCHEMA_VERSION,
  createAuthoritativeTaxonRegistry,
} from "../../src/sim/taxonIdentity";

const graph: CuratedMutationGraph = {
  scenarioId: "composed-taxon-fixture",
  scenarioVersion: "1",
  genotypes: [{ id: "WT", relativeFitness: 1, sourceOrder: 0 }],
  transitions: [],
};

function config(contentVersion = "1.0.0"): ComposedSimulationConfig {
  const taxonRegistry = createAuthoritativeTaxonRegistry([
    {
      schemaVersion: AUTHORITATIVE_TAXON_IDENTITY_SCHEMA_VERSION,
      id: "fixture-bacterium",
      contentVersion,
      scientificName: "Fixture bacterium",
      background: "test strain",
      microbialGroup: "bacterium",
      provenance: {
        sourceKeys: ["fixture:taxon"],
        context: "Test-only composed taxon authority.",
        limitation: "Not a scientific Petra content pack.",
      },
    },
  ]);

  return {
    width: 1,
    height: 1,
    mask: [1],
    initialResource: [1],
    ciprofloxacinConcentrationMgPerL: [0],
    initialLineageBiomass: [[0.25]],
    growth: {
      maxDivisionRate: 1,
      halfSaturation: 1,
      biomassYield: 1,
      localCapacity: 1,
      spreadRate: 0,
    },
    lineages: [
      {
        id: "founder",
        genotypeId: "WT",
        taxonId: "fixture-bacterium",
        taxonContentVersion: contentVersion,
        deathHazardPerHour: 0,
      },
    ],
    taxonRegistry,
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

describe("composed taxon authority", () => {
  it("persists an exact ordered lineage-to-taxon map in composed checkpoint state", () => {
    const authority = config();
    const state = createComposedState(authority);

    expect(state.lineageTaxonMap).toMatchObject({
      lineageIds: ["L1"],
      taxonIds: ["fixture-bacterium"],
      taxonContentVersions: ["1.0.0"],
    });
    expect(() =>
      validateComposedStateAgainstConfig(state, authority),
    ).not.toThrow();
  });

  it("binds exact taxon content revision into composed configuration identity", () => {
    expect(composedConfigurationFingerprint(config("1.0.0"))).not.toBe(
      composedConfigurationFingerprint(config("2.0.0")),
    );
  });

  it("fails closed on missing, unknown, or stale checkpoint taxon authority", () => {
    const authority = config();
    const state = createComposedState(authority);

    const { lineageTaxonMap: _omittedTaxonMap, ...missingTaxonMap } = state;
    expect(() =>
      validateComposedStateAgainstConfig(missingTaxonMap, authority),
    ).toThrow(/requires a runtime lineage taxon map/);

    expect(() =>
      validateComposedStateAgainstConfig(
        {
          ...state,
          lineageTaxonMap: {
            ...state.lineageTaxonMap!,
            taxonIds: ["unknown"],
          },
        },
        authority,
      ),
    ).toThrow(/unknown taxon/);

    const revised = config("2.0.0");
    expect(() =>
      validateComposedStateAgainstConfig(state, revised),
    ).toThrow(/configuration fingerprint mismatch|content version mismatch/);
  });

  it("does not accept taxon references without the matching caller registry", () => {
    const authority = config();
    const { taxonRegistry: _omittedRegistry, ...withoutRegistry } = authority;

    expect(() => createComposedState(withoutRegistry)).toThrow(
      /requires an authoritative taxon registry/,
    );
  });
});
