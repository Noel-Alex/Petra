import {
  BACILLUS_168_SIGE_ORGANISM_PRESENTATION,
  FLAGSHIP_ECOLI_ORGANISM_PRESENTATION,
} from "../render/organismPresentationIdentity";
import {
  assertComposedParameterSetBinding,
  sameComposedParameterSetBinding,
} from "../sim/parameterSetBinding";
import type { TwoBacteriumComposedRunPlan } from "../sim/twoBacteriumComposition";
import type { ComposedDishOrganismPresentationAuthority } from "./composedDishProjection";
import { createOrganismPresentationTaxonCatalog } from "./lineageOrganismPresentation";

const TWO_BACTERIUM_SCENARIO_ID = "ecoli-bsubtilis-shared-resource";
const TWO_BACTERIUM_SCENARIO_VERSION = "1.0.0-experimental";
const TWO_BACTERIUM_PARAMETER_SET_ID =
  "ecoli-bsubtilis-shared-resource-composed";
const TWO_BACTERIUM_PARAMETER_SET_VERSION = "1.0.0";

const ECOLI_TAXON_ID = "ecoli-k12-mg1655";
const ECOLI_TAXON_CONTENT_VERSION = "lacroix-2015-growth-context-v1";
const BACILLUS_TAXON_ID = "bsubtilis-168-trp-plus-sige-minus";
const BACILLUS_TAXON_CONTENT_VERSION = "tannler-2008-growth-context-v1";

/**
 * Assemble presentation-only organism authority for the exact first named
 * two-bacterium run.
 *
 * Biological taxon identity remains simulation/config authority. This adapter
 * binds only already-reviewed coarse morphology evidence to exact taxon
 * revisions after the run identity proves the expected scenario and composed
 * parameter set. A foreign scenario or later content revision must be reviewed
 * and rebound explicitly rather than inheriting morphology by name/group/order.
 */
export function createTwoBacteriumDishOrganismPresentationAuthority(
  plan: TwoBacteriumComposedRunPlan,
): ComposedDishOrganismPresentationAuthority {
  if (
    plan.identity.scenarioId !== TWO_BACTERIUM_SCENARIO_ID ||
    plan.identity.scenarioVersion !== TWO_BACTERIUM_SCENARIO_VERSION ||
    plan.identity.parameterSetId !== TWO_BACTERIUM_PARAMETER_SET_ID ||
    plan.identity.parameterSetVersion !== TWO_BACTERIUM_PARAMETER_SET_VERSION
  ) {
    throw new Error(
      "two-bacterium organism presentation authority requires the exact bundled run identity",
    );
  }

  assertComposedParameterSetBinding(plan.identity, plan.config);
  if (
    !sameComposedParameterSetBinding(
      plan.identity.parameterSetBinding,
      plan.parameterSetBinding,
    )
  ) {
    throw new Error(
      "two-bacterium organism presentation authority requires the plan parameter-set binding to match run identity",
    );
  }

  const taxonRegistry = plan.config.taxonRegistry;
  if (taxonRegistry === undefined) {
    throw new Error(
      "two-bacterium organism presentation authority requires simulation-owned taxon authority",
    );
  }

  const presentationCatalog = createOrganismPresentationTaxonCatalog({
    taxonRegistry,
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
    taxonRegistry,
    presentationCatalog,
  });
}
