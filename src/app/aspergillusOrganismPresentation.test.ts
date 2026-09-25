import { describe, expect, it } from "vitest";

import {
  ASPERGILLUS_NO10_ORGANISM_PRESENTATION,
} from "../render/organismPresentationIdentity";
import {
  ASPERGILLUS_NO10_TAXON,
  ASPERGILLUS_NO10_TAXON_REGISTRY,
} from "../sim/fungi/aspergillusNo10Surface";
import {
  createOrganismPresentationTaxonCatalog,
  resolveOrganismPresentationForTaxon,
} from "./lineageOrganismPresentation";

describe("Aspergillus no. 10 presentation binding", () => {
  it("binds the measured coarse morphology only to the exact fungal taxon content revision", () => {
    const catalog = createOrganismPresentationTaxonCatalog({
      taxonRegistry: ASPERGILLUS_NO10_TAXON_REGISTRY,
      bindings: [
        {
          taxonId: ASPERGILLUS_NO10_TAXON.id,
          taxonContentVersion: ASPERGILLUS_NO10_TAXON.contentVersion,
          presentation: ASPERGILLUS_NO10_ORGANISM_PRESENTATION,
        },
      ],
    });

    expect(
      resolveOrganismPresentationForTaxon(
        catalog,
        ASPERGILLUS_NO10_TAXON_REGISTRY,
        ASPERGILLUS_NO10_TAXON.id,
        ASPERGILLUS_NO10_TAXON.contentVersion,
      ),
    ).toEqual(ASPERGILLUS_NO10_ORGANISM_PRESENTATION);
  });

  it("fails closed when the biological content revision does not match the morphology evidence binding", () => {
    expect(() =>
      createOrganismPresentationTaxonCatalog({
        taxonRegistry: ASPERGILLUS_NO10_TAXON_REGISTRY,
        bindings: [
          {
            taxonId: ASPERGILLUS_NO10_TAXON.id,
            taxonContentVersion: "aspergillus-no10:stale-presentation-fixture",
            presentation: ASPERGILLUS_NO10_ORGANISM_PRESENTATION,
          },
        ],
      }),
    ).toThrow(/taxon content version mismatch/);
  });
});
