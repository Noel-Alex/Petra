import flagshipScenario from "../../data/presets/ecoli_ciprofloxacin_v1.json";
import {
  FLAGSHIP_ECOLI_ORGANISM_PRESENTATION,
  type OrganismPresentationIdentity,
} from "../render/organismPresentationIdentity";
import type { RunIdentity } from "../sim/protocol";
import {
  AUTHORITATIVE_TAXON_IDENTITY_SCHEMA_VERSION,
  createAuthoritativeTaxonRegistry,
  type AuthoritativeTaxonIdentity,
} from "../sim/taxonIdentity";
import type { ComposedDishOrganismPresentationAuthority } from "./composedDishProjection";
import { createOrganismPresentationTaxonCatalog } from "./lineageOrganismPresentation";

export interface OrganismPresentationScenarioIdentity {
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly scientificName: string;
  readonly background: string;
}

export const FLAGSHIP_ORGANISM_PRESENTATION_SCENARIO =
  parseOrganismPresentationScenarioIdentity(flagshipScenario as unknown);

export interface FlagshipComposedOrganismPresentationBinding {
  readonly scenario: OrganismPresentationScenarioIdentity;
  readonly parameterSetId: string;
  readonly parameterSetVersion: string;
  readonly authority: ComposedDishOrganismPresentationAuthority;
}

export const FLAGSHIP_COMPOSED_ORGANISM_PRESENTATION_BINDING =
  parseFlagshipComposedOrganismPresentationBinding(flagshipScenario as unknown);

assertOrganismPresentationMatchesScenario(
  FLAGSHIP_ECOLI_ORGANISM_PRESENTATION,
  FLAGSHIP_ORGANISM_PRESENTATION_SCENARIO,
);

/**
 * Resolve the exact bundled presentation authority that is allowed to populate
 * per-lineage render morphology for an authoritative composed run.
 *
 * Scenario identity alone is intentionally insufficient here. The biological
 * taxon binding is part of composed parameter-set/fingerprint authority, so a
 * stale or foreign parameter set remains morphology-neutral instead of
 * borrowing the current flagship catalog.
 */
export function resolveComposedDishOrganismPresentationAuthority(
  identity: RunIdentity | null,
): ComposedDishOrganismPresentationAuthority | null {
  if (identity === null) return null;
  const binding = FLAGSHIP_COMPOSED_ORGANISM_PRESENTATION_BINDING;
  if (
    identity.scenarioId !== binding.scenario.scenarioId ||
    identity.scenarioVersion !== binding.scenario.scenarioVersion ||
    identity.parameterSetId !== binding.parameterSetId ||
    identity.parameterSetVersion !== binding.parameterSetVersion
  ) {
    return null;
  }
  return binding.authority;
}

/**
 * Resolve coarse organism presentation evidence only for the exact runtime
 * scenario that owns the bundled record.
 *
 * This is the legacy run-wide fallback used only when a render snapshot has no
 * per-lineage presentation carrier at all. Authoritative composed snapshots
 * should use resolveComposedDishOrganismPresentationAuthority(...) so missing
 * evidence for one lineage stays neutral instead of inheriting another
 * lineage's morphology.
 *
 * This does not infer morphology from scenario organism text. The morphology is
 * already explicit in the validated #816 record; this function only decides
 * whether that record is eligible for the supplied authoritative run identity.
 */
export function resolveOrganismPresentationForRun(
  identity: RunIdentity | null,
): OrganismPresentationIdentity | null {
  if (identity === null) return null;
  if (
    identity.scenarioId !==
      FLAGSHIP_ORGANISM_PRESENTATION_SCENARIO.scenarioId ||
    identity.scenarioVersion !==
      FLAGSHIP_ORGANISM_PRESENTATION_SCENARIO.scenarioVersion
  ) {
    return null;
  }
  return FLAGSHIP_ECOLI_ORGANISM_PRESENTATION;
}

export function assertOrganismPresentationMatchesScenario(
  presentation: OrganismPresentationIdentity,
  scenario: OrganismPresentationScenarioIdentity,
): void {
  if (presentation.scientificName !== scenario.scientificName) {
    throw new Error(
      "organism presentation scientific name does not match scenario authority",
    );
  }
  if (presentation.background !== scenario.background) {
    throw new Error(
      "organism presentation background does not match scenario authority",
    );
  }
}

export function parseOrganismPresentationScenarioIdentity(
  value: unknown,
): OrganismPresentationScenarioIdentity {
  const scenario = requireRecord(value, "presentation scenario");
  const organism = requireRecord(
    scenario.organism,
    "presentation scenario organism",
  );
  return Object.freeze({
    scenarioId: canonicalNonEmptyString(scenario.id, "scenario id"),
    scenarioVersion: canonicalNonEmptyString(
      scenario.version,
      "scenario version",
    ),
    scientificName: canonicalNonEmptyString(
      organism.name,
      "scenario organism name",
    ),
    background: canonicalNonEmptyString(
      organism.genotypeBackground,
      "scenario organism background",
    ),
  });
}

export function parseFlagshipComposedOrganismPresentationBinding(
  value: unknown,
): FlagshipComposedOrganismPresentationBinding {
  const scenario = requireRecord(value, "presentation scenario");
  const scenarioIdentity = parseOrganismPresentationScenarioIdentity(value);
  const organism = requireRecord(
    scenario.organism,
    "presentation scenario organism",
  );
  const taxonRecord = requireRecord(
    organism.authoritativeTaxon,
    "presentation scenario authoritative taxon",
  );
  const provenanceRecord = requireRecord(
    taxonRecord.provenance,
    "presentation scenario authoritative taxon provenance",
  );
  const parameterSet = requireRecord(
    scenario.composedParameterSet,
    "presentation scenario composed parameter set",
  );

  if (
    taxonRecord.schemaVersion !== AUTHORITATIVE_TAXON_IDENTITY_SCHEMA_VERSION
  ) {
    throw new RangeError(
      "presentation scenario authoritative taxon has an unsupported schema version",
    );
  }
  const microbialGroup = canonicalNonEmptyString(
    taxonRecord.microbialGroup,
    "presentation scenario authoritative taxon microbial group",
  );
  if (microbialGroup !== "bacterium" && microbialGroup !== "fungus") {
    throw new RangeError(
      "presentation scenario authoritative taxon has an unsupported microbial group",
    );
  }
  const sourceKeys = canonicalStringArray(
    provenanceRecord.sourceKeys,
    "presentation scenario authoritative taxon provenance sourceKeys",
  );
  const limitation =
    provenanceRecord.limitation === undefined
      ? undefined
      : canonicalNonEmptyString(
          provenanceRecord.limitation,
          "presentation scenario authoritative taxon provenance limitation",
        );

  const taxon: AuthoritativeTaxonIdentity = Object.freeze({
    schemaVersion: AUTHORITATIVE_TAXON_IDENTITY_SCHEMA_VERSION,
    id: canonicalNonEmptyString(
      taxonRecord.id,
      "presentation scenario authoritative taxon id",
    ),
    contentVersion: canonicalNonEmptyString(
      taxonRecord.contentVersion,
      "presentation scenario authoritative taxon content version",
    ),
    scientificName: canonicalNonEmptyString(
      taxonRecord.scientificName,
      "presentation scenario authoritative taxon scientific name",
    ),
    background: canonicalNonEmptyString(
      taxonRecord.background,
      "presentation scenario authoritative taxon background",
    ),
    microbialGroup,
    provenance: Object.freeze({
      sourceKeys: Object.freeze(sourceKeys),
      context: canonicalNonEmptyString(
        provenanceRecord.context,
        "presentation scenario authoritative taxon provenance context",
      ),
      ...(limitation === undefined ? {} : { limitation }),
    }),
  });
  const taxonRegistry = createAuthoritativeTaxonRegistry([taxon]);
  const presentationCatalog = createOrganismPresentationTaxonCatalog({
    taxonRegistry,
    bindings: [
      {
        taxonId: taxon.id,
        taxonContentVersion: taxon.contentVersion,
        presentation: FLAGSHIP_ECOLI_ORGANISM_PRESENTATION,
      },
    ],
  });

  return Object.freeze({
    scenario: scenarioIdentity,
    parameterSetId: canonicalNonEmptyString(
      parameterSet.id,
      "presentation scenario composed parameter set id",
    ),
    parameterSetVersion: canonicalNonEmptyString(
      parameterSet.version,
      "presentation scenario composed parameter set version",
    ),
    authority: Object.freeze({
      taxonRegistry,
      presentationCatalog,
    }),
  });
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

function canonicalNonEmptyString(value: unknown, name: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value
  ) {
    throw new TypeError(`${name} must be a canonical non-empty string`);
  }
  return value;
}

function canonicalStringArray(value: unknown, name: string): string[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${name} must be an array`);
  }
  const result: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    if (!(index in value)) {
      throw new TypeError(`${name} must be dense`);
    }
    result.push(canonicalNonEmptyString(value[index], `${name}[${index}]`));
  }
  return result;
}
