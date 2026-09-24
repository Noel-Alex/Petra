import flagshipScenario from "../../data/presets/ecoli_ciprofloxacin_v1.json";
import {
  evaluateScenarioScienceAdmission,
  type ScenarioScienceAdmission,
} from "./scienceModeAdmission";

export interface BundledScenarioDiscoveryEntry {
  readonly id: string;
  readonly version: string;
  readonly title: string;
  readonly scienceAdmission: ScenarioScienceAdmission;
  readonly educationalScienceSelectable: boolean;
  readonly referenceScienceModeSelectable: boolean;
}

/**
 * Product-neutral discovery over bundled scenarios.
 *
 * This is intentionally tiny today because Petra currently ships one bundled
 * scenario. Sandbox/route UI may consume these entries, but must not invent a
 * different maturity label or bypass the admission result.
 */
export function discoverBundledScenarios(): readonly BundledScenarioDiscoveryEntry[] {
  return [flagshipScenario].map((scenario) => {
    const scienceAdmission = evaluateScenarioScienceAdmission(scenario);
    return {
      id: scenario.id,
      version: scenario.version,
      title: scenario.title,
      scienceAdmission,
      educationalScienceSelectable:
        scienceAdmission.availability === "educational-only" ||
        scienceAdmission.availability === "reference",
      referenceScienceModeSelectable: scienceAdmission.referenceEligible,
    };
  });
}
