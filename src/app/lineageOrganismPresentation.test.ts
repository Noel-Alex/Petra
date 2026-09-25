import { describe, expect, it } from "vitest";

import {
  FLAGSHIP_ECOLI_ORGANISM_PRESENTATION,
  parseOrganismPresentationIdentity,
  type OrganismPresentationIdentity,
} from "../render/organismPresentationIdentity";
import {
  AUTHORITATIVE_TAXON_IDENTITY_SCHEMA_VERSION,
  createAuthoritativeTaxonRegistry,
  createRuntimeLineageTaxonMap,
  type AuthoritativeTaxonIdentity,
} from "../sim/taxonIdentity";
import {
  createOrganismPresentationTaxonCatalog,
  projectLineageOrganismPresentations,
  resolveOrganismPresentationForTaxon,
} from "./lineageOrganismPresentation";

const primaryTaxon: AuthoritativeTaxonIdentity = {
  schemaVersion: AUTHORITATIVE_TAXON_IDENTITY_SCHEMA_VERSION,
  id: "ecoli-k12-mg1655",
  contentVersion: "ecoli-k12-mg1655:v1",
  scientificName: FLAGSHIP_ECOLI_ORGANISM_PRESENTATION.scientificName,
  background: FLAGSHIP_ECOLI_ORGANISM_PRESENTATION.background,
  microbialGroup: "bacterium",
  provenance: {
    sourceKeys: ["fixture:ecoli-k12-mg1655-taxonomy"],
    context: "Test fixture for exact biological identity mapping.",
  },
};

const alternateBackground = "K-12 alternate test background";
const alternateTaxon: AuthoritativeTaxonIdentity = {
  schemaVersion: AUTHORITATIVE_TAXON_IDENTITY_SCHEMA_VERSION,
  id: "ecoli-k12-alternate",
  contentVersion: "ecoli-k12-alternate:v1",
  scientificName: "Escherichia coli",
  background: alternateBackground,
  microbialGroup: "bacterium",
  provenance: {
    sourceKeys: ["fixture:ecoli-k12-alternate-taxonomy"],
    context: "Test-only alternate E. coli background.",
    limitation: "Not a Petra science content pack.",
  },
};

const fungusTaxon: AuthoritativeTaxonIdentity = {
  schemaVersion: AUTHORITATIVE_TAXON_IDENTITY_SCHEMA_VERSION,
  id: "fungus-unbound-fixture",
  contentVersion: "fungus-unbound-fixture:v1",
  scientificName: "Example fungus",
  background: "test-only isolate",
  microbialGroup: "fungus",
  provenance: {
    sourceKeys: ["fixture:fungus-taxonomy"],
    context: "Test-only unbound fungal identity.",
    limitation: "No morphology evidence is registered.",
  },
};

function alternatePresentation(): OrganismPresentationIdentity {
  const raw = structuredClone(
    FLAGSHIP_ECOLI_ORGANISM_PRESENTATION,
  ) as unknown as Record<string, unknown>;
  raw.id = "ecoli-k12-alternate-representative-morphology-test";
  raw.background = alternateBackground;
  const provenance = raw.provenance as Record<string, unknown>;
  provenance.context =
    "Test-only coarse E. coli rod presentation for catalog separation coverage.";
  provenance.transferNote =
    "Test fixture reuses E. coli-level rod evidence only for a coarse silhouette.";
  provenance.limitation =
    "Test-only presentation fixture; not a biological parameter or science pack.";
  return parseOrganismPresentationIdentity(raw);
}

function fixtureRegistry() {
  return createAuthoritativeTaxonRegistry([
    primaryTaxon,
    alternateTaxon,
    fungusTaxon,
  ]);
}

function binding(
  taxon: AuthoritativeTaxonIdentity,
  presentation: OrganismPresentationIdentity,
) {
  return {
    taxonId: taxon.id,
    taxonContentVersion: taxon.contentVersion,
    presentation,
  };
}

describe("lineage organism presentation mapping", () => {
  it("maps exact ordered runtime lineage→taxon revisions to explicit presentation evidence", () => {
    const registry = fixtureRegistry();
    const catalog = createOrganismPresentationTaxonCatalog({
      taxonRegistry: registry,
      bindings: [
        binding(primaryTaxon, FLAGSHIP_ECOLI_ORGANISM_PRESENTATION),
        binding(alternateTaxon, alternatePresentation()),
      ],
    });
    const mapping = createRuntimeLineageTaxonMap({
      lineageIds: ["L1", "L2", "L3"],
      taxonIds: [primaryTaxon.id, primaryTaxon.id, alternateTaxon.id],
      registry,
    });

    const projection = projectLineageOrganismPresentations({
      taxonRegistry: registry,
      lineageTaxonMap: mapping,
      presentationCatalog: catalog,
      expectedRuntimeLineageIds: ["L1", "L2", "L3"],
    });

    expect(projection.schemaVersion).toBe(1);
    expect(
      projection.lineages.map((entry) => [
        entry.lineageId,
        entry.taxonId,
        entry.taxonContentVersion,
        entry.presentation?.id,
      ]),
    ).toEqual([
      [
        "L1",
        primaryTaxon.id,
        primaryTaxon.contentVersion,
        FLAGSHIP_ECOLI_ORGANISM_PRESENTATION.id,
      ],
      [
        "L2",
        primaryTaxon.id,
        primaryTaxon.contentVersion,
        FLAGSHIP_ECOLI_ORGANISM_PRESENTATION.id,
      ],
      [
        "L3",
        alternateTaxon.id,
        alternateTaxon.contentVersion,
        "ecoli-k12-alternate-representative-morphology-test",
      ],
    ]);
    expect(Object.isFrozen(projection)).toBe(true);
    expect(Object.isFrozen(projection.lineages)).toBe(true);
    expect(projection.lineages.every(Object.isFrozen)).toBe(true);
  });

  it("leaves known exact taxon revisions morphology-neutral when no explicit evidence binding exists", () => {
    const registry = fixtureRegistry();
    const catalog = createOrganismPresentationTaxonCatalog({
      taxonRegistry: registry,
      bindings: [
        binding(primaryTaxon, FLAGSHIP_ECOLI_ORGANISM_PRESENTATION),
      ],
    });
    const mapping = createRuntimeLineageTaxonMap({
      lineageIds: ["L1", "L2"],
      taxonIds: [primaryTaxon.id, fungusTaxon.id],
      registry,
    });

    const projection = projectLineageOrganismPresentations({
      taxonRegistry: registry,
      lineageTaxonMap: mapping,
      presentationCatalog: catalog,
      expectedRuntimeLineageIds: mapping.lineageIds,
    });

    expect(projection.lineages[0]!.presentation).toBe(
      catalog.bindings[0]!.presentation,
    );
    expect(projection.lineages[1]).toEqual({
      lineageId: "L2",
      taxonId: fungusTaxon.id,
      taxonContentVersion: fungusTaxon.contentVersion,
      presentation: null,
    });
    expect(
      resolveOrganismPresentationForTaxon(
        catalog,
        registry,
        fungusTaxon.id,
        fungusTaxon.contentVersion,
      ),
    ).toBeNull();
  });

  it("fails closed when presentation evidence disagrees with biological taxon identity", () => {
    const registry = fixtureRegistry();
    expect(() =>
      createOrganismPresentationTaxonCatalog({
        taxonRegistry: registry,
        bindings: [
          binding(alternateTaxon, FLAGSHIP_ECOLI_ORGANISM_PRESENTATION),
        ],
      }),
    ).toThrow(/background does not match authoritative taxon identity/);
  });

  it("rejects a presentation binding for the wrong biological content revision", () => {
    const registry = fixtureRegistry();
    expect(() =>
      createOrganismPresentationTaxonCatalog({
        taxonRegistry: registry,
        bindings: [
          {
            taxonId: primaryTaxon.id,
            taxonContentVersion: "ecoli-k12-mg1655:v0",
            presentation: FLAGSHIP_ECOLI_ORGANISM_PRESENTATION,
          },
        ],
      }),
    ).toThrow(/taxon content version mismatch/);
  });

  it("rejects stale morphology evidence when the same taxon id advances to a new content revision", () => {
    const originalRegistry = fixtureRegistry();
    const catalog = createOrganismPresentationTaxonCatalog({
      taxonRegistry: originalRegistry,
      bindings: [
        binding(primaryTaxon, FLAGSHIP_ECOLI_ORGANISM_PRESENTATION),
      ],
    });
    const revisedPrimaryTaxon: AuthoritativeTaxonIdentity = {
      ...primaryTaxon,
      contentVersion: "ecoli-k12-mg1655:v2",
      provenance: {
        ...primaryTaxon.provenance,
        context: "Test fixture with a revised biological content identity.",
      },
    };
    const revisedRegistry = createAuthoritativeTaxonRegistry([
      revisedPrimaryTaxon,
      alternateTaxon,
      fungusTaxon,
    ]);

    expect(() =>
      resolveOrganismPresentationForTaxon(
        catalog,
        revisedRegistry,
        revisedPrimaryTaxon.id,
        revisedPrimaryTaxon.contentVersion,
      ),
    ).toThrow(/taxon content version mismatch/);
  });

  it("rejects duplicate or unknown taxon-revision bindings instead of aliasing evidence", () => {
    const registry = fixtureRegistry();

    expect(() =>
      createOrganismPresentationTaxonCatalog({
        taxonRegistry: registry,
        bindings: [
          binding(primaryTaxon, FLAGSHIP_ECOLI_ORGANISM_PRESENTATION),
          binding(primaryTaxon, FLAGSHIP_ECOLI_ORGANISM_PRESENTATION),
        ],
      }),
    ).toThrow(/duplicate organism presentation binding/);

    expect(() =>
      createOrganismPresentationTaxonCatalog({
        taxonRegistry: registry,
        bindings: [
          {
            taxonId: "unknown-taxon",
            taxonContentVersion: "unknown-taxon:v1",
            presentation: FLAGSHIP_ECOLI_ORGANISM_PRESENTATION,
          },
        ],
      }),
    ).toThrow(/unknown taxon/);
  });

  it("requires the runtime taxon map to match the exact authoritative lineage order", () => {
    const registry = fixtureRegistry();
    const catalog = createOrganismPresentationTaxonCatalog({
      taxonRegistry: registry,
      bindings: [
        binding(primaryTaxon, FLAGSHIP_ECOLI_ORGANISM_PRESENTATION),
      ],
    });
    const mapping = createRuntimeLineageTaxonMap({
      lineageIds: ["L1", "L2"],
      taxonIds: [primaryTaxon.id, primaryTaxon.id],
      registry,
    });

    expect(() =>
      projectLineageOrganismPresentations({
        taxonRegistry: registry,
        lineageTaxonMap: mapping,
        presentationCatalog: catalog,
        expectedRuntimeLineageIds: ["L2", "L1"],
      }),
    ).toThrow(/taxon order mismatch/);
  });

  it("detaches catalog evidence from caller mutation", () => {
    const registry = fixtureRegistry();
    const mutable = structuredClone(
      FLAGSHIP_ECOLI_ORGANISM_PRESENTATION,
    ) as OrganismPresentationIdentity;
    const mutableBinding = {
      taxonId: primaryTaxon.id,
      taxonContentVersion: primaryTaxon.contentVersion,
      presentation: mutable,
    };
    const catalog = createOrganismPresentationTaxonCatalog({
      taxonRegistry: registry,
      bindings: [mutableBinding],
    });

    (mutable as unknown as { id: string }).id = "mutated-after-binding";
    (
      mutableBinding as unknown as { taxonContentVersion: string }
    ).taxonContentVersion = "mutated-after-binding";
    expect(catalog.bindings[0]!.presentation.id).toBe(
      FLAGSHIP_ECOLI_ORGANISM_PRESENTATION.id,
    );
    expect(catalog.bindings[0]!.taxonContentVersion).toBe(
      primaryTaxon.contentVersion,
    );
  });
});
