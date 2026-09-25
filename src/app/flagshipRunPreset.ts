import runPresetData from "../../data/run_presets/ecoli_ciprofloxacin_baseline_v1.json";
import {
  buildFlagshipComposedRunPlan,
  type FlagshipComposedRunPlan,
  type FlagshipFounderInoculum,
} from "../sim/flagshipComposition";
import {
  projectBundledFlagshipCiprofloxacinControl,
  type FlagshipCiprofloxacinControlProvenance,
} from "../sim/flagshipInterventionControl";
import {
  ENGINE_VERSION,
  PROTOCOL_VERSION,
  assertSimulationSeed,
} from "../sim/protocol";
import {
  parseCiprofloxacinToolAuthority,
  type CiprofloxacinToolAuthority,
} from "./ciprofloxacinToolAuthority";

export const FLAGSHIP_RUN_PRESET_SCHEMA_VERSION = 1 as const;

export interface FlagshipRunPreset {
  readonly schemaVersion: typeof FLAGSHIP_RUN_PRESET_SCHEMA_VERSION;
  readonly id: string;
  readonly version: string;
  readonly engineVersion: typeof ENGINE_VERSION;
  readonly protocolVersion: typeof PROTOCOL_VERSION;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly parameterSetId: string;
  readonly parameterSetVersion: string;
  readonly classification: "engineering";
  readonly usageScope: string;
  readonly warning: string;
  readonly seed: number;
  readonly initialResourceLevel: number;
  readonly inocula: readonly FlagshipFounderInoculum[];
  readonly provenance: {
    readonly classification: "engineering";
    readonly context: string;
    readonly limitation: string;
  };
}

export interface DefaultFlagshipRun {
  readonly preset: FlagshipRunPreset;
  readonly plan: FlagshipComposedRunPlan;
  readonly ciprofloxacinToolAuthority: CiprofloxacinToolAuthority;
  readonly ciprofloxacinControlProvenance: FlagshipCiprofloxacinControlProvenance;
}

type UnknownRecord = Record<string, unknown>;

const PRESET_KEYS = new Set([
  "schemaVersion",
  "id",
  "version",
  "engineVersion",
  "protocolVersion",
  "scenarioId",
  "scenarioVersion",
  "parameterSetId",
  "parameterSetVersion",
  "classification",
  "usageScope",
  "warning",
  "seed",
  "initialResourceLevel",
  "inocula",
  "provenance",
]);

const INOCULUM_KEYS = new Set(["lineageId", "x", "y", "biomass"]);
const PROVENANCE_KEYS = new Set(["classification", "context", "limitation"]);

function requireRecord(name: string, value: unknown): UnknownRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  return value as UnknownRecord;
}

function assertOnlyKnownKeys(
  name: string,
  record: UnknownRecord,
  allowed: ReadonlySet<string>,
): void {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      throw new Error(`${name} contains unknown field ${JSON.stringify(key)}`);
    }
  }
}

function requireCanonicalText(name: string, value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
  if (value !== value.trim()) {
    throw new Error(`${name} must be canonical with no surrounding whitespace`);
  }
  return value;
}

function requireFiniteNonNegative(name: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be finite and non-negative`);
  }
  return value;
}

function requireSafeInteger(name: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`${name} must be a safe integer`);
  }
  return value;
}

export function parseFlagshipRunPreset(value: unknown): FlagshipRunPreset {
  const record = requireRecord("flagshipRunPreset", value);
  assertOnlyKnownKeys("flagshipRunPreset", record, PRESET_KEYS);

  if (record.schemaVersion !== FLAGSHIP_RUN_PRESET_SCHEMA_VERSION) {
    throw new Error("unsupported flagship run-preset schema version");
  }
  if (record.engineVersion !== ENGINE_VERSION) {
    throw new Error("flagship run preset engine version does not match this build");
  }
  if (record.protocolVersion !== PROTOCOL_VERSION) {
    throw new Error("flagship run preset protocol version does not match this build");
  }
  if (record.classification !== "engineering") {
    throw new Error('flagshipRunPreset.classification must be "engineering"');
  }

  const seed = requireSafeInteger("flagshipRunPreset.seed", record.seed);
  assertSimulationSeed(seed);

  if (!Array.isArray(record.inocula) || record.inocula.length === 0) {
    throw new Error("flagshipRunPreset.inocula must be a non-empty array");
  }
  const inocula = record.inocula.map((value, index) => {
    const inoculum = requireRecord(`flagshipRunPreset.inocula[${index}]`, value);
    assertOnlyKnownKeys(
      `flagshipRunPreset.inocula[${index}]`,
      inoculum,
      INOCULUM_KEYS,
    );

    const x = requireSafeInteger(`flagshipRunPreset.inocula[${index}].x`, inoculum.x);
    const y = requireSafeInteger(`flagshipRunPreset.inocula[${index}].y`, inoculum.y);
    if (x < 0 || y < 0) {
      throw new Error(`flagshipRunPreset.inocula[${index}] coordinates must be non-negative`);
    }
    const biomass = requireFiniteNonNegative(
      `flagshipRunPreset.inocula[${index}].biomass`,
      inoculum.biomass,
    );
    if (biomass <= 0) {
      throw new Error(`flagshipRunPreset.inocula[${index}].biomass must be positive`);
    }

    return Object.freeze({
      lineageId: requireCanonicalText(
        `flagshipRunPreset.inocula[${index}].lineageId`,
        inoculum.lineageId,
      ),
      x,
      y,
      biomass,
    });
  });

  const provenanceRecord = requireRecord(
    "flagshipRunPreset.provenance",
    record.provenance,
  );
  assertOnlyKnownKeys(
    "flagshipRunPreset.provenance",
    provenanceRecord,
    PROVENANCE_KEYS,
  );
  if (provenanceRecord.classification !== "engineering") {
    throw new Error(
      'flagshipRunPreset.provenance.classification must be "engineering"',
    );
  }

  return Object.freeze({
    schemaVersion: FLAGSHIP_RUN_PRESET_SCHEMA_VERSION,
    id: requireCanonicalText("flagshipRunPreset.id", record.id),
    version: requireCanonicalText("flagshipRunPreset.version", record.version),
    engineVersion: ENGINE_VERSION,
    protocolVersion: PROTOCOL_VERSION,
    scenarioId: requireCanonicalText(
      "flagshipRunPreset.scenarioId",
      record.scenarioId,
    ),
    scenarioVersion: requireCanonicalText(
      "flagshipRunPreset.scenarioVersion",
      record.scenarioVersion,
    ),
    parameterSetId: requireCanonicalText(
      "flagshipRunPreset.parameterSetId",
      record.parameterSetId,
    ),
    parameterSetVersion: requireCanonicalText(
      "flagshipRunPreset.parameterSetVersion",
      record.parameterSetVersion,
    ),
    classification: "engineering",
    usageScope: requireCanonicalText(
      "flagshipRunPreset.usageScope",
      record.usageScope,
    ),
    warning: requireCanonicalText("flagshipRunPreset.warning", record.warning),
    seed,
    initialResourceLevel: requireFiniteNonNegative(
      "flagshipRunPreset.initialResourceLevel",
      record.initialResourceLevel,
    ),
    inocula: Object.freeze(inocula),
    provenance: Object.freeze({
      classification: "engineering",
      context: requireCanonicalText(
        "flagshipRunPreset.provenance.context",
        provenanceRecord.context,
      ),
      limitation: requireCanonicalText(
        "flagshipRunPreset.provenance.limitation",
        provenanceRecord.limitation,
      ),
    }),
  });
}

/**
 * Resolve repository-owned run state against repository-owned mechanism
 * authority. A run preset may choose deterministic state; it cannot relabel the
 * scenario, parameter set, engine, or worker protocol it initializes.
 */
export function buildFlagshipRunFromPreset(value: unknown): DefaultFlagshipRun {
  const preset = parseFlagshipRunPreset(value);
  const plan = buildFlagshipComposedRunPlan({
    seed: preset.seed,
    initialResourceLevel: preset.initialResourceLevel,
    inocula: preset.inocula,
  });

  if (
    plan.identity.engineVersion !== preset.engineVersion ||
    plan.identity.protocolVersion !== preset.protocolVersion
  ) {
    throw new Error(
      "flagship run preset engine/protocol identity does not match composed authority",
    );
  }
  if (
    plan.identity.scenarioId !== preset.scenarioId ||
    plan.identity.scenarioVersion !== preset.scenarioVersion
  ) {
    throw new Error(
      "flagship run preset scenario identity does not match composed authority",
    );
  }
  if (
    plan.identity.parameterSetId !== preset.parameterSetId ||
    plan.identity.parameterSetVersion !== preset.parameterSetVersion
  ) {
    throw new Error(
      "flagship run preset parameter-set identity does not match composed authority",
    );
  }

  const ciprofloxacinControl = projectBundledFlagshipCiprofloxacinControl();
  const ciprofloxacinToolAuthority = parseCiprofloxacinToolAuthority(
    ciprofloxacinControl.toolAuthority,
  );

  return Object.freeze({
    preset,
    plan,
    ciprofloxacinToolAuthority,
    ciprofloxacinControlProvenance: ciprofloxacinControl.provenance,
  });
}

export function buildDefaultFlagshipRun(): DefaultFlagshipRun {
  return buildFlagshipRunFromPreset(runPresetData);
}
