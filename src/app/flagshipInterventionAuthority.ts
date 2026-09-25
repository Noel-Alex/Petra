import flagshipScenario from "../../data/presets/ecoli_ciprofloxacin_v1.json";
import {
  parseCiprofloxacinToolAuthority,
  type CiprofloxacinToolAuthority,
} from "./ciprofloxacinToolAuthority";

export const FLAGSHIP_CIPROFLOXACIN_CONTROL_SCHEMA_VERSION = 1 as const;

type UnknownRecord = Record<string, unknown>;

export interface FlagshipCiprofloxacinControlAuthority {
  readonly toolAuthority: CiprofloxacinToolAuthority;
  readonly sourceTestedDomain: {
    readonly minimumMgPerL: number;
    readonly maximumMgPerL: number;
  };
  readonly defaultSelectionMgPerL: number;
}

function requireRecord(name: string, value: unknown): UnknownRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  return value as UnknownRecord;
}

function requireFiniteNonNegative(name: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be finite and non-negative`);
  }
  return value;
}

function requireCanonicalText(name: string, value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value !== value.trim()
  ) {
    throw new Error(`${name} must be a canonical non-empty string`);
  }
  return value;
}

/**
 * Resolve the product intervention metadata only when its source-domain and
 * engineering-default provenance remain internally bound to the flagship
 * science record. This adapter does not choose a dose; it verifies the
 * scenario-owned choice before the app may make Apply available.
 */
export function buildFlagshipCiprofloxacinControlAuthority(
  scenario: unknown = flagshipScenario,
): FlagshipCiprofloxacinControlAuthority {
  const root = requireRecord("flagship scenario", scenario);
  const drug = requireRecord("flagship scenario drug", root.drug);
  if (requireCanonicalText("flagship scenario drug name", drug.name) !== "ciprofloxacin") {
    throw new Error("flagship intervention authority requires ciprofloxacin");
  }

  const reference = requireRecord(
    "flagship ciprofloxacin reference pharmacodynamics",
    drug.referencePharmacodynamics,
  );
  if (reference.citation !== "regoes_2004") {
    throw new Error(
      "flagship ciprofloxacin intervention authority must remain anchored to regoes_2004",
    );
  }
  const conventionalMic = requireFiniteNonNegative(
    "flagship ciprofloxacin reference conventional MIC",
    reference.conventionalMIC_mg_L,
  );

  const control = requireRecord(
    "flagship ciprofloxacin intervention control",
    drug.interventionControl,
  );
  if (control.schemaVersion !== FLAGSHIP_CIPROFLOXACIN_CONTROL_SCHEMA_VERSION) {
    throw new Error("unsupported flagship ciprofloxacin control schema version");
  }

  const toolAuthority = parseCiprofloxacinToolAuthority(control.toolAuthority);
  const sourceDomain = requireRecord(
    "flagship ciprofloxacin source-tested domain",
    control.sourceTestedDomain,
  );
  const sourceMinimum = requireFiniteNonNegative(
    "flagship ciprofloxacin source-tested minimum",
    sourceDomain.minimumMgPerL,
  );
  const sourceMaximum = requireFiniteNonNegative(
    "flagship ciprofloxacin source-tested maximum",
    sourceDomain.maximumMgPerL,
  );
  if (sourceMinimum > sourceMaximum) {
    throw new RangeError(
      "flagship ciprofloxacin source-tested minimum cannot exceed maximum",
    );
  }

  const sourceProvenance = requireRecord(
    "flagship ciprofloxacin source-tested provenance",
    sourceDomain.provenance,
  );
  if (
    sourceProvenance.classification !== "transferred" ||
    sourceProvenance.citation !== "regoes_2004"
  ) {
    throw new Error(
      "flagship ciprofloxacin control envelope must remain an explicit regoes_2004 transfer",
    );
  }
  requireCanonicalText(
    "flagship ciprofloxacin source-tested context",
    sourceProvenance.context,
  );
  requireCanonicalText(
    "flagship ciprofloxacin source-tested transfer note",
    sourceProvenance.transferNote,
  );
  requireCanonicalText(
    "flagship ciprofloxacin source-tested limitation",
    sourceProvenance.limitation,
  );

  const defaultSelection = requireRecord(
    "flagship ciprofloxacin default selection",
    control.defaultSelection,
  );
  const defaultValue = requireFiniteNonNegative(
    "flagship ciprofloxacin default selection value",
    defaultSelection.valueMgPerL,
  );
  const defaultProvenance = requireRecord(
    "flagship ciprofloxacin default selection provenance",
    defaultSelection.provenance,
  );
  if (defaultProvenance.classification !== "engineering") {
    throw new Error(
      "flagship ciprofloxacin default selection must remain engineering",
    );
  }
  requireCanonicalText(
    "flagship ciprofloxacin default selection context",
    defaultProvenance.context,
  );
  requireCanonicalText(
    "flagship ciprofloxacin default selection limitation",
    defaultProvenance.limitation,
  );

  if (
    toolAuthority.parameter.minimum !== sourceMinimum ||
    toolAuthority.parameter.maximum !== sourceMaximum
  ) {
    throw new Error(
      "flagship ciprofloxacin tool bounds must match the source-tested domain",
    );
  }
  if (
    toolAuthority.parameter.defaultValue !== defaultValue ||
    defaultValue !== conventionalMic
  ) {
    throw new Error(
      "flagship ciprofloxacin engineering default must remain anchored to the source conventional MIC",
    );
  }

  return Object.freeze({
    toolAuthority,
    sourceTestedDomain: Object.freeze({
      minimumMgPerL: sourceMinimum,
      maximumMgPerL: sourceMaximum,
    }),
    defaultSelectionMgPerL: defaultValue,
  });
}

/**
 * Product-safe resolver: malformed cross-provenance never enables Apply.
 * Repository verification/tests carry the detailed diagnostics.
 */
export function resolveDefaultFlagshipCiprofloxacinToolAuthority():
  | CiprofloxacinToolAuthority
  | null {
  try {
    return buildFlagshipCiprofloxacinControlAuthority().toolAuthority;
  } catch {
    return null;
  }
}

export const defaultFlagshipCiprofloxacinToolAuthority =
  resolveDefaultFlagshipCiprofloxacinToolAuthority();
