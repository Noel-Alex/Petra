import flagshipScenario from "../../data/presets/ecoli_ciprofloxacin_v1.json";
import {
  evaluateScienceModeAdmission,
  type ScienceModeAdmission,
} from "../sim/scienceModeAdmission";

export interface ScenarioDiscoveryEntry {
  readonly id: string;
  readonly version: string;
  readonly title: string;
  readonly catalogStatus: string;
  readonly scienceMode: ScienceModeAdmission;
}

/**
 * Product-facing scenario discovery metadata.
 *
 * Discovery and Science Mode admission intentionally share the same evaluator:
 * being bundled, parseable, or runnable never makes a scenario grounded science.
 */
export function buildScenarioDiscoveryEntry(
  scenario: unknown,
): ScenarioDiscoveryEntry {
  const admission = evaluateScienceModeAdmission(scenario);
  const root = isRecord(scenario) ? scenario : {};

  return {
    id: admission.scenarioId,
    version: admission.scenarioVersion,
    title: canonicalText(root.title) ?? "Invalid scenario",
    catalogStatus: canonicalText(root.status) ?? "invalid",
    scienceMode: admission,
  };
}

/** Current bundled scenario catalog. Add future packs here only after their data contract lands. */
export function listBundledScenarioDiscovery(): readonly ScenarioDiscoveryEntry[] {
  return [buildScenarioDiscoveryEntry(flagshipScenario)];
}

/** Scenarios that the product may truthfully present as grounded Science Mode. */
export function listGroundedScienceModeScenarios(): readonly ScenarioDiscoveryEntry[] {
  return listBundledScenarioDiscovery().filter(
    (entry) => entry.scienceMode.admitted,
  );
}

function canonicalText(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    return null;
  }
  return value;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
