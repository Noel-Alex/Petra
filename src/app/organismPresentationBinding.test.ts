import { describe, expect, it } from "vitest";

import flagshipScenario from "../../data/presets/ecoli_ciprofloxacin_v1.json";
import {
  FLAGSHIP_ECOLI_ORGANISM_PRESENTATION,
  type OrganismPresentationIdentity,
} from "../render/organismPresentationIdentity";
import { createRunIdentity } from "../sim/protocol";
import {
  FLAGSHIP_ORGANISM_PRESENTATION_SCENARIO,
  assertOrganismPresentationMatchesScenario,
  parseOrganismPresentationScenarioIdentity,
  resolveOrganismPresentationForRun,
} from "./organismPresentationBinding";

function runIdentity(
  scenarioId = flagshipScenario.id,
  scenarioVersion = flagshipScenario.version,
) {
  return createRunIdentity({
    scenarioId,
    scenarioVersion,
    parameterSetId: "fixture:organism-presentation-binding",
    parameterSetVersion: "1",
    seed: 7,
  });
}

describe("organism presentation runtime binding", () => {
  it("resolves presentation evidence only for the exact current flagship scenario", () => {
    expect(resolveOrganismPresentationForRun(runIdentity())).toBe(
      FLAGSHIP_ECOLI_ORGANISM_PRESENTATION,
    );
    expect(resolveOrganismPresentationForRun(null)).toBeNull();
    expect(
      resolveOrganismPresentationForRun(
        runIdentity("foreign-scenario", flagshipScenario.version),
      ),
    ).toBeNull();
    expect(
      resolveOrganismPresentationForRun(
        runIdentity(flagshipScenario.id, "stale-scenario-version"),
      ),
    ).toBeNull();
  });

  it("pins the binding to exact bundled scenario organism metadata", () => {
    expect(FLAGSHIP_ORGANISM_PRESENTATION_SCENARIO).toEqual({
      scenarioId: flagshipScenario.id,
      scenarioVersion: flagshipScenario.version,
      scientificName: flagshipScenario.organism.name,
      background: flagshipScenario.organism.genotypeBackground,
    });
    expect(FLAGSHIP_ECOLI_ORGANISM_PRESENTATION.scientificName).toBe(
      flagshipScenario.organism.name,
    );
    expect(FLAGSHIP_ECOLI_ORGANISM_PRESENTATION.background).toBe(
      flagshipScenario.organism.genotypeBackground,
    );
  });

  it("fails visibly when a presentation record drifts from scenario organism authority", () => {
    const wrongName = {
      ...FLAGSHIP_ECOLI_ORGANISM_PRESENTATION,
      scientificName: "Other species",
    } as OrganismPresentationIdentity;
    expect(() =>
      assertOrganismPresentationMatchesScenario(
        wrongName,
        FLAGSHIP_ORGANISM_PRESENTATION_SCENARIO,
      ),
    ).toThrow(/scientific name does not match/);

    const wrongBackground = {
      ...FLAGSHIP_ECOLI_ORGANISM_PRESENTATION,
      background: "other-background",
    } as OrganismPresentationIdentity;
    expect(() =>
      assertOrganismPresentationMatchesScenario(
        wrongBackground,
        FLAGSHIP_ORGANISM_PRESENTATION_SCENARIO,
      ),
    ).toThrow(/background does not match/);
  });

  it("rejects malformed scenario identity metadata rather than guessing", () => {
    const malformed = structuredClone(flagshipScenario) as Record<string, unknown>;
    const organism = malformed.organism as Record<string, unknown>;
    organism.genotypeBackground = " ";
    expect(() =>
      parseOrganismPresentationScenarioIdentity(malformed),
    ).toThrow(/canonical non-empty string/);
  });
});
