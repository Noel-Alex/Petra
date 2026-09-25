import flagshipScenario from "../../data/presets/ecoli_ciprofloxacin_v1.json";
import {
  FLAGSHIP_ECOLI_ORGANISM_PRESENTATION,
  type OrganismPresentationIdentity,
} from "../render/organismPresentationIdentity";
import type { RunIdentity } from "../sim/protocol";

export interface OrganismPresentationScenarioIdentity {
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly scientificName: string;
  readonly background: string;
}

export const FLAGSHIP_ORGANISM_PRESENTATION_SCENARIO =
  parseOrganismPresentationScenarioIdentity(flagshipScenario as unknown);

assertOrganismPresentationMatchesScenario(
  FLAGSHIP_ECOLI_ORGANISM_PRESENTATION,
  FLAGSHIP_ORGANISM_PRESENTATION_SCENARIO,
);

/**
 * Resolve coarse organism presentation evidence only for the exact runtime
 * scenario that owns the bundled record.
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
