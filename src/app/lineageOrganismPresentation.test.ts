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

describe("lineage organism presentation mapping", () => {
  it("maps exact ordered runtime lineage→taxon authority to explicit presentation evidence", () => {
    const registry = fixtureRegistry();
    const catalog = createOrganismPresentationTaxonCatalog({
      taxonRegistry: registry,
      bindings: [
        {
          taxonId: primaryTaxon.id,
          presentation: FLAGSHIP_ECOLI_ORGANISM_PRESENTATION,
        },
        {
          taxonId: alternateTaxon.id,
          presentation: alternatePresentation(),
        },
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
        entry.presentation?.id,
      ]),
    ).toEqual([
      [
        "L1",
        primaryTaxon.id,
        FLAGSHIP_ECOLI_ORGANISM_PRESENTATION.id,
      ],
      [
        "L2",
        primaryTaxon.id,
        FLAGSHIP_ECOLI_ORGANISM_PRESENTATION.id,
      ],
      [
        "L3",
        alternateTaxon.id,
        "ecoli-k12-alternate-representative-morphology-test",
      ],
    ]);
    expect(Object.isFrozen(projection)).toBe(true);
    expect(Object.isFrozen(projection.lineages)).toBe(true);
    expect(projection.lineages.every(Object.isFrozen)).toBe(true);
  });

  it("leaves known taxa morphology-neutral when no explicit evidence binding exists", () => {
    const registry = fixtureRegistry();
    const catalog = createOrganismPresentationTaxonCatalog({
      taxonRegistry: registry,
      bindings: [
        {
          taxonId: primaryTaxon.id,
          presentation: FLAGSHIP_ECOLI_ORGANISM_PRESENTATION,
        },
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
      presentation: null,
    });
    expect(
      resolveOrganismPresentationForTaxon(
        catalog,
        registry,
        fungusTaxon.id,
      ),
    ).toBeNull();
  });

  it("fails closed when presentation evidence disagrees with biological taxon identity", () => {
    const registry = fixtureRegistry();
    expect(() =>
      createOrganismPresentationTaxonCatalog({
        taxonRegistry: registry,
        bindings: [
          {
            taxonId: alternateTaxon.id,
            presentation: FLAGSHIP_ECOLI_ORGANISM_PRESENTATION,
          },
        ],
      }),
    ).toThrow(/background does not match authoritative taxon identity/);
  });

  it("rejects duplicate or unknown taxon bindings instead of aliasing evidence", () => {
    const registry = fixtureRegistry();

    expect(() =>
      createOrganismPresentationTaxonCatalog({
        taxonRegistry: registry,
        bindings: [
          {
            taxonId: primaryTaxon.id,
            presentation: FLAGSHIP_ECOLI_ORGANISM_PRESENTATION,
          },
          {
            taxonId: primaryTaxon.id,
            presentation: FLAGSHIP_ECOLI_ORGANISM_PRESENTATION,
          },
        ],
      }),
    ).toThrow(/duplicate organism presentation binding/);

    expect(() =>
      createOrganismPresentationTaxonCatalog({
        taxonRegistry: registry,
        bindings: [
          {
            taxonId: "unknown-taxon",
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
        {
          taxonId: primaryTaxon.id,
          presentation: FLAGSHIP_ECOLI_ORGANISM_PRESENTATION,
        },
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
    const catalog = createOrganismPresentationTaxonCatalog({
      taxonRegistry: registry,
      bindings: [{ taxonId: primaryTaxon.id, presentation: mutable }],
    });

    (mutable as unknown as { id: string }).id = "mutated-after-binding";
    expect(catalog.bindings[0]!.presentation.id).toBe(
      FLAGSHIP_ECOLI_ORGANISM_PRESENTATION.id,
    );
  });
});
