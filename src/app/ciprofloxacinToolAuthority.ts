import {
  CIPROFLOXACIN_INTENT_ADAPTER_SCHEMA_VERSION,
  type CiprofloxacinIntentAuthority,
} from "./ciprofloxacinInterventionAdapter";

export const CIPROFLOXACIN_TOOL_AUTHORITY_SCHEMA_VERSION = 1 as const;

export type CiprofloxacinToolGeometryKind =
  | "global"
  | "radial"
  | "stripe"
  | "paint";

export interface CiprofloxacinToolAuthority {
  readonly schemaVersion: typeof CIPROFLOXACIN_TOOL_AUTHORITY_SCHEMA_VERSION;
  readonly tool: "antibiotic";
  readonly protocolCommand: "apply-ciprofloxacin";
  readonly parameter: {
    readonly key: string;
    readonly label: string;
    readonly unit: "mg/L";
    readonly minimum: number;
    readonly maximum: number;
    readonly defaultValue: number;
    readonly precision: number;
  };
  readonly supportedGeometries: readonly CiprofloxacinToolGeometryKind[];
  readonly blendMode: CiprofloxacinIntentAuthority["blendMode"];
}

const TOP_LEVEL_KEYS = new Set([
  "schemaVersion",
  "tool",
  "protocolCommand",
  "parameter",
  "supportedGeometries",
  "blendMode",
]);

const PARAMETER_KEYS = new Set([
  "key",
  "label",
  "unit",
  "minimum",
  "maximum",
  "defaultValue",
  "precision",
]);

const GEOMETRY_KINDS = new Set<CiprofloxacinToolGeometryKind>([
  "global",
  "radial",
  "stripe",
  "paint",
]);

export function parseCiprofloxacinToolAuthority(
  value: unknown,
): CiprofloxacinToolAuthority {
  const record = requireRecord("ciprofloxacin tool authority", value);
  assertOnlyKnownKeys("ciprofloxacin tool authority", record, TOP_LEVEL_KEYS);

  if (record.schemaVersion !== CIPROFLOXACIN_TOOL_AUTHORITY_SCHEMA_VERSION) {
    throw new Error("unsupported ciprofloxacin tool authority schema version");
  }
  if (record.tool !== "antibiotic") {
    throw new Error("ciprofloxacin tool authority must target antibiotic");
  }
  if (record.protocolCommand !== "apply-ciprofloxacin") {
    throw new Error(
      "ciprofloxacin tool authority must bind apply-ciprofloxacin",
    );
  }

  const parameter = requireRecord(
    "ciprofloxacin tool authority parameter",
    record.parameter,
  );
  assertOnlyKnownKeys(
    "ciprofloxacin tool authority parameter",
    parameter,
    PARAMETER_KEYS,
  );

  const key = requireCanonicalText(
    "ciprofloxacin tool authority parameter key",
    parameter.key,
  );
  const label = requireCanonicalText(
    "ciprofloxacin tool authority parameter label",
    parameter.label,
  );
  if (parameter.unit !== "mg/L") {
    throw new Error("ciprofloxacin tool authority parameter unit must be mg/L");
  }
  const minimum = requireFiniteNonNegative(
    "ciprofloxacin tool authority parameter minimum",
    parameter.minimum,
  );
  const maximum = requireFiniteNonNegative(
    "ciprofloxacin tool authority parameter maximum",
    parameter.maximum,
  );
  if (minimum > maximum) {
    throw new RangeError(
      "ciprofloxacin tool authority parameter minimum cannot exceed maximum",
    );
  }
  const defaultValue = requireFiniteNonNegative(
    "ciprofloxacin tool authority parameter default",
    parameter.defaultValue,
  );
  if (defaultValue < minimum || defaultValue > maximum) {
    throw new RangeError(
      "ciprofloxacin tool authority parameter default must lie within bounds",
    );
  }
  if (
    typeof parameter.precision !== "number" ||
    !Number.isSafeInteger(parameter.precision) ||
    parameter.precision < 0 ||
    parameter.precision > 6
  ) {
    throw new RangeError(
      "ciprofloxacin tool authority parameter precision must be an integer from 0 to 6",
    );
  }

  if (!Array.isArray(record.supportedGeometries)) {
    throw new TypeError(
      "ciprofloxacin tool authority supportedGeometries must be an array",
    );
  }
  if (record.supportedGeometries.length === 0) {
    throw new Error(
      "ciprofloxacin tool authority must support at least one protocol geometry",
    );
  }
  const seenGeometries = new Set<CiprofloxacinToolGeometryKind>();
  const supportedGeometries = record.supportedGeometries.map(
    (geometry, index) => {
      if (
        typeof geometry !== "string" ||
        !GEOMETRY_KINDS.has(geometry as CiprofloxacinToolGeometryKind)
      ) {
        throw new Error(
          `ciprofloxacin tool authority supportedGeometries[${index}] is unsupported`,
        );
      }
      const kind = geometry as CiprofloxacinToolGeometryKind;
      if (seenGeometries.has(kind)) {
        throw new Error(
          `duplicate ciprofloxacin tool authority geometry: ${kind}`,
        );
      }
      seenGeometries.add(kind);
      return kind;
    },
  );

  if (record.blendMode !== "set" && record.blendMode !== "add") {
    throw new Error("ciprofloxacin tool authority blend mode must be set or add");
  }

  return Object.freeze({
    schemaVersion: CIPROFLOXACIN_TOOL_AUTHORITY_SCHEMA_VERSION,
    tool: "antibiotic",
    protocolCommand: "apply-ciprofloxacin",
    parameter: Object.freeze({
      key,
      label,
      unit: "mg/L",
      minimum,
      maximum,
      defaultValue,
      precision: parameter.precision,
    }),
    supportedGeometries: Object.freeze(supportedGeometries),
    blendMode: record.blendMode,
  });
}

export function toCiprofloxacinIntentAuthority(
  authority: CiprofloxacinToolAuthority,
): CiprofloxacinIntentAuthority {
  const validated = parseCiprofloxacinToolAuthority(authority);
  return Object.freeze({
    schemaVersion: CIPROFLOXACIN_INTENT_ADAPTER_SCHEMA_VERSION,
    concentrationParameterKey: validated.parameter.key,
    concentrationUnit: validated.parameter.unit,
    minimumMgPerL: validated.parameter.minimum,
    maximumMgPerL: validated.parameter.maximum,
    blendMode: validated.blendMode,
  });
}

type UnknownRecord = Record<string, unknown>;

function requireRecord(name: string, value: unknown): UnknownRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
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
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value !== value.trim()
  ) {
    throw new Error(`${name} must be a canonical non-empty string`);
  }
  return value;
}

function requireFiniteNonNegative(name: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be finite and non-negative`);
  }
  return value;
}
