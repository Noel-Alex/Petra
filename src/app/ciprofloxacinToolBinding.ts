import flagshipScenario from "../../data/presets/ecoli_ciprofloxacin_v1.json";
import type { RunIdentity } from "../sim/protocol";
import { projectBundledFlagshipCiprofloxacinControl } from "../sim/flagshipInterventionControl";
import {
  parseCiprofloxacinToolAuthority,
  type CiprofloxacinToolAuthority,
} from "./ciprofloxacinToolAuthority";

export interface FlagshipCiprofloxacinToolBinding {
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly parameterSetId: string;
  readonly parameterSetVersion: string;
  readonly authority: CiprofloxacinToolAuthority;
}

export const FLAGSHIP_CIPROFLOXACIN_TOOL_BINDING =
  parseFlagshipCiprofloxacinToolBinding(flagshipScenario as unknown);

/**
 * Admit the bundled product tool authority only for the exact authoritative
 * run identity that owns it. React must not attach flagship concentration
 * metadata to foreign or stale scenario/parameter-set identity.
 */
export function resolveCiprofloxacinToolAuthorityForRun(
  identity: RunIdentity | null,
): CiprofloxacinToolAuthority | null {
  if (identity === null) return null;
  const binding = FLAGSHIP_CIPROFLOXACIN_TOOL_BINDING;
  if (
    identity.scenarioId !== binding.scenarioId ||
    identity.scenarioVersion !== binding.scenarioVersion ||
    identity.parameterSetId !== binding.parameterSetId ||
    identity.parameterSetVersion !== binding.parameterSetVersion
  ) {
    return null;
  }
  return binding.authority;
}

export function parseFlagshipCiprofloxacinToolBinding(
  value: unknown,
): FlagshipCiprofloxacinToolBinding {
  const scenario = requireRecord(value, "flagship ciprofloxacin scenario");
  const parameterSet = requireRecord(
    scenario.composedParameterSet,
    "flagship ciprofloxacin composed parameter set",
  );
  const projected = projectBundledFlagshipCiprofloxacinControl();

  return Object.freeze({
    scenarioId: canonicalText(
      scenario.id,
      "flagship ciprofloxacin scenario id",
    ),
    scenarioVersion: canonicalText(
      scenario.version,
      "flagship ciprofloxacin scenario version",
    ),
    parameterSetId: canonicalText(
      parameterSet.id,
      "flagship ciprofloxacin parameter-set id",
    ),
    parameterSetVersion: canonicalText(
      parameterSet.version,
      "flagship ciprofloxacin parameter-set version",
    ),
    authority: parseCiprofloxacinToolAuthority(projected.toolAuthority),
  });
}

function requireRecord(
  value: unknown,
  name: string,
): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function canonicalText(value: unknown, name: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value !== value.trim()
  ) {
    throw new TypeError(`${name} must be a canonical non-empty string`);
  }
  return value;
}
