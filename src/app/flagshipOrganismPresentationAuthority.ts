import flagshipScenario from "../../data/presets/ecoli_ciprofloxacin_v1.json";
import {
  FLAGSHIP_ECOLI_ORGANISM_PRESENTATION,
} from "../render/organismPresentationIdentity";
import type { FlagshipComposedRunPlan } from "../sim/flagshipComposition";
import {
  createAuthoritativeTaxonRegistry,
  type AuthoritativeTaxonIdentity,
} from "../sim/taxonIdentity";
import type { ComposedDishOrganismPresentationAuthority } from "./composedDishProjection";
import {
  createOrganismPresentationTaxonCatalog,
} from "./lineageOrganismPresentation";
import {
  FLAGSHIP_ORGANISM_PRESENTATION_SCENARIO,
} from "./organismPresentationBinding";

const FLAGSHIP_PRESENTATION_TAXON = parseFlagshipPresentationTaxon(
  flagshipScenario as unknown,
);

/**
 * Assemble presentation-only organism authority for the exact bundled flagship.
 *
 * Biological taxon identity remains simulation/config authority. This helper
 * only binds the already-reviewed coarse morphology record to that exact
 * taxonId + contentVersion for the render projection. It never selects
 * morphology from lineage/genotype labels, scientific-name text, density, or
 * microbialGroup alone.
 */
export function createFlagshipDishOrganismPresentationAuthority(
  plan: FlagshipComposedRunPlan,
): ComposedDishOrganismPresentationAuthority {
  if (
    plan.identity.scenarioId !==
      FLAGSHIP_ORGANISM_PRESENTATION_SCENARIO.scenarioId ||
    plan.identity.scenarioVersion !==
      FLAGSHIP_ORGANISM_PRESENTATION_SCENARIO.scenarioVersion
  ) {
    throw new Error(
      "flagship organism presentation authority requires the exact bundled scenario identity",
    );
  }

  const taxonRegistry = plan.config.taxonRegistry;
  if (taxonRegistry === undefined) {
    throw new Error(
      "flagship organism presentation authority requires simulation-owned taxon authority",
    );
  }

  const exactTaxon = taxonRegistry.taxa.find(
    (taxon) => taxon.id === FLAGSHIP_PRESENTATION_TAXON.id,
  );
  if (
    exactTaxon === undefined ||
    exactTaxon.contentVersion !== FLAGSHIP_PRESENTATION_TAXON.contentVersion
  ) {
    throw new Error(
      "flagship organism presentation authority requires the exact scenario-owned taxon revision",
    );
  }

  const presentationCatalog = createOrganismPresentationTaxonCatalog({
    taxonRegistry,
    bindings: [
      {
        taxonId: FLAGSHIP_PRESENTATION_TAXON.id,
        taxonContentVersion: FLAGSHIP_PRESENTATION_TAXON.contentVersion,
        presentation: FLAGSHIP_ECOLI_ORGANISM_PRESENTATION,
      },
    ],
  });

  return Object.freeze({
    taxonRegistry,
    presentationCatalog,
  });
}

function parseFlagshipPresentationTaxon(
  value: unknown,
): AuthoritativeTaxonIdentity {
  const scenario = requireRecord(value, "flagship scenario");
  const organism = requireRecord(
    scenario.organism,
    "flagship scenario organism",
  );
  const authoritativeTaxon = requireRecord(
    organism.authoritativeTaxon,
    "flagship scenario authoritativeTaxon",
  );
  const registry = createAuthoritativeTaxonRegistry([
    authoritativeTaxon as unknown as AuthoritativeTaxonIdentity,
  ]);
  const taxon = registry.taxa[0];
  if (taxon === undefined) {
    throw new Error("flagship scenario authoritative taxon is missing");
  }
  return taxon;
}

function requireRecord(
  value: unknown,
  name: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}
