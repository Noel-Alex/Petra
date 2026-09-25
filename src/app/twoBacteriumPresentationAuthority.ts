import {
  BACILLUS_168_SIGE_ORGANISM_PRESENTATION,
  FLAGSHIP_ECOLI_ORGANISM_PRESENTATION,
} from "../render/organismPresentationIdentity";
import type { TwoBacteriumComposedRunPlan } from "../sim/twoBacteriumComposition";
import type { ComposedDishOrganismPresentationAuthority } from "./composedDishProjection";
import { createOrganismPresentationTaxonCatalog } from "./lineageOrganismPresentation";

const ECOLI_TAXON_ID = "ecoli-k12-mg1655";
const ECOLI_TAXON_CONTENT_VERSION = "lacroix-2015-growth-context-v1";
const BACILLUS_TAXON_ID = "bsubtilis-168-trp-plus-sige-minus";
const BACILLUS_TAXON_CONTENT_VERSION = "tannler-2008-growth-context-v1";

/**
 * Bind the first named two-bacterium run to exact-version presentation evidence.
 *
 * This is deliberately scenario-specific and fail-closed. The biological taxon
 * registry remains simulation authority; this adapter only supplies reviewed
 * presentation evidence for the exact content revisions above. A content-pack
 * revision must be reviewed/rebound explicitly rather than inheriting a
 * morphology from scientific name, microbial group, lineage order, or color.
 */
export function buildTwoBacteriumDishOrganismPresentationAuthority(
  runPlan: Pick<TwoBacteriumComposedRunPlan, "taxonRegistry">,
): ComposedDishOrganismPresentationAuthority {
  const presentationCatalog = createOrganismPresentationTaxonCatalog({
    taxonRegistry: runPlan.taxonRegistry,
    bindings: [
      {
        taxonId: ECOLI_TAXON_ID,
        taxonContentVersion: ECOLI_TAXON_CONTENT_VERSION,
        presentation: FLAGSHIP_ECOLI_ORGANISM_PRESENTATION,
      },
      {
        taxonId: BACILLUS_TAXON_ID,
        taxonContentVersion: BACILLUS_TAXON_CONTENT_VERSION,
        presentation: BACILLUS_168_SIGE_ORGANISM_PRESENTATION,
      },
    ],
  });

  return Object.freeze({
    taxonRegistry: runPlan.taxonRegistry,
    presentationCatalog,
  });
}
