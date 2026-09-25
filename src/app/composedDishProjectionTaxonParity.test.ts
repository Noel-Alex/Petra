import { describe, expect, it } from "vitest";

import {
  FLAGSHIP_ECOLI_ORGANISM_PRESENTATION,
  parseOrganismPresentationIdentity,
  type OrganismPresentationIdentity,
} from "../render/organismPresentationIdentity";
import type { ComposedSimulationConfig } from "../sim/authoritative";
import { ComposedSimulationEngine } from "../sim/composedEngine";
import type { CuratedMutationGraph } from "../sim/evolution/graph";
import { createFixtureComposedParameterSetBinding } from "../sim/parameterSetBinding";
import { createRunIdentity } from "../sim/protocol";
import {
  AUTHORITATIVE_TAXON_IDENTITY_SCHEMA_VERSION,
  createAuthoritativeTaxonRegistry,
  type AuthoritativeTaxonIdentity,
} from "../sim/taxonIdentity";
import { projectAuthoritativeComposedDishSnapshot } from "./composedDishProjection";
import { createOrganismPresentationTaxonCatalog } from "./lineageOrganismPresentation";

const graph: CuratedMutationGraph = {
  scenarioId: "dish-projection-mixed-taxon-parity-fixture",
  scenarioVersion: "1",
  genotypes: [
    { id: "WT", relativeFitness: 1, sourceOrder: 0 },
    { id: "VAR", relativeFitness: 0.9, sourceOrder: 1 },
  ],
  transitions: [],
};

const PRIMARY_TAXON: AuthoritativeTaxonIdentity = {
  schemaVersion: AUTHORITATIVE_TAXON_IDENTITY_SCHEMA_VERSION,
  id: "fixture-ecoli-primary",
  contentVersion: "fixture-ecoli-primary:v1",
  scientificName: FLAGSHIP_ECOLI_ORGANISM_PRESENTATION.scientificName,
  background: FLAGSHIP_ECOLI_ORGANISM_PRESENTATION.background,
  microbialGroup: "bacterium",
  provenance: {
    sourceKeys: ["fixture:ecoli-primary"],
    context: "Projection-only exact taxon identity fixture.",
    limitation: "Test fixture only; not a Petra science content pack.",
  },
};

const ALTERNATE_BACKGROUND = "K-12 alternate projection test background";
const ALTERNATE_TAXON: AuthoritativeTaxonIdentity = {
  schemaVersion: AUTHORITATIVE_TAXON_IDENTITY_SCHEMA_VERSION,
  id: "fixture-ecoli-alternate",
  contentVersion: "fixture-ecoli-alternate:v1",
  scientificName: "Escherichia coli",
  background: ALTERNATE_BACKGROUND,
  microbialGroup: "bacterium",
  provenance: {
    sourceKeys: ["fixture:ecoli-alternate"],
    context: "Projection-only alternate taxon identity fixture.",
    limitation: "Test fixture only; not a Petra science content pack.",
  },
};

function alternatePresentation(): OrganismPresentationIdentity {
  const raw = structuredClone(
    FLAGSHIP_ECOLI_ORGANISM_PRESENTATION,
  ) as unknown as Record<string, unknown>;
  raw.id = "fixture-ecoli-alternate-presentation";
  raw.background = ALTERNATE_BACKGROUND;
  const provenance = raw.provenance as Record<string, unknown>;
  provenance.context =
    "Projection test-only coarse rod evidence for exact-version join coverage.";
  provenance.transferNote =
    "Test fixture reuses coarse E. coli rod presentation only for identity-join coverage.";
  provenance.limitation =
    "Test-only presentation fixture; not a biological parameter or content pack.";
  return parseOrganismPresentationIdentity(raw);
}

function taxonAwareComposedEngine(seed = 23) {
  const taxonRegistry = createAuthoritativeTaxonRegistry([
    PRIMARY_TAXON,
    ALTERNATE_TAXON,
  ]);
  const presentationCatalog = createOrganismPresentationTaxonCatalog({
    taxonRegistry,
    bindings: [
      {
        taxonId: PRIMARY_TAXON.id,
        taxonContentVersion: PRIMARY_TAXON.contentVersion,
        presentation: FLAGSHIP_ECOLI_ORGANISM_PRESENTATION,
      },
      {
        taxonId: ALTERNATE_TAXON.id,
        taxonContentVersion: ALTERNATE_TAXON.contentVersion,
        presentation: alternatePresentation(),
      },
    ],
  });
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
      {
        id: "founder-wt",
        genotypeId: "WT",
        taxonId: PRIMARY_TAXON.id,
        taxonContentVersion: PRIMARY_TAXON.contentVersion,
        deathHazardPerHour: 0,
      },
      {
        id: "variant-a",
        genotypeId: "VAR",
        taxonId: ALTERNATE_TAXON.id,
        taxonContentVersion: ALTERNATE_TAXON.contentVersion,
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
    hoursPerTick: 0.01,
  };
  const binding = createFixtureComposedParameterSetBinding(
    "fixture:dish-projection-mixed-taxa",
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
  return {
    engine: new ComposedSimulationEngine(identity, config),
    organismPresentationAuthority: { taxonRegistry, presentationCatalog },
  };
}

describe("composed dish mixed-taxon presentation parity", () => {
  it("resolves distinct exact taxon presentations without changing scientific arrays", () => {
    const { engine, organismPresentationAuthority } = taxonAwareComposedEngine();
    const simulation = engine.snapshot();
    if (simulation.checkpoint.authority !== "composed") {
      throw new Error("expected composed snapshot");
    }

    const neutral = projectAuthoritativeComposedDishSnapshot(
      simulation,
      "fixture-branch-0",
    );
    const resolved = projectAuthoritativeComposedDishSnapshot(
      simulation,
      "fixture-branch-0",
      null,
      organismPresentationAuthority,
    );

    expect(
      resolved.lineages.map((lineage) => lineage.organismPresentation?.id),
    ).toEqual([
      FLAGSHIP_ECOLI_ORGANISM_PRESENTATION.id,
      "fixture-ecoli-alternate-presentation",
    ]);
    expect([...resolved.dishMask]).toEqual([...neutral.dishMask]);
    expect([...resolved.biomass]).toEqual([...neutral.biomass]);
    expect(
      resolved.lineages.map((lineage) => [...lineage.density]),
    ).toEqual(neutral.lineages.map((lineage) => [...lineage.density]));
    expect(
      resolved.fields.map((field) => [
        field.id,
        field.unit,
        field.minimum,
        field.maximum,
        [...field.values],
      ]),
    ).toEqual(
      neutral.fields.map((field) => [
        field.id,
        field.unit,
        field.minimum,
        field.maximum,
        [...field.values],
      ]),
    );
  });

  it("fails closed on reordered or stale runtime taxon authority", () => {
    const { engine, organismPresentationAuthority } = taxonAwareComposedEngine();
    const simulation = engine.snapshot();
    if (simulation.checkpoint.authority !== "composed") {
      throw new Error("expected composed snapshot");
    }
    const mapping = simulation.checkpoint.composedState.lineageTaxonMap;
    if (mapping === undefined) {
      throw new Error("expected taxon-authoritative state");
    }

    const reordered = {
      ...structuredClone(simulation),
      checkpoint: {
        ...structuredClone(simulation.checkpoint),
        composedState: {
          ...structuredClone(simulation.checkpoint.composedState),
          lineageTaxonMap: {
            ...mapping,
            lineageIds: [mapping.lineageIds[1]!, mapping.lineageIds[0]!],
          },
        },
      },
    };
    expect(() =>
      projectAuthoritativeComposedDishSnapshot(
        reordered,
        "fixture-branch-0",
        null,
        organismPresentationAuthority,
      ),
    ).toThrow(/taxon order mismatch/i);

    const stale = {
      ...structuredClone(simulation),
      checkpoint: {
        ...structuredClone(simulation.checkpoint),
        composedState: {
          ...structuredClone(simulation.checkpoint.composedState),
          lineageTaxonMap: {
            ...mapping,
            taxonContentVersions: [
              PRIMARY_TAXON.contentVersion + ":stale",
              mapping.taxonContentVersions[1]!,
            ],
          },
        },
      },
    };
    expect(() =>
      projectAuthoritativeComposedDishSnapshot(
        stale,
        "fixture-branch-0",
        null,
        organismPresentationAuthority,
      ),
    ).toThrow(/taxon content version mismatch/i);
  });
});
