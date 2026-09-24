import {
  CIPROFLOXACIN_INTERVENTION_SCHEMA_VERSION,
  assertCiprofloxacinIntervention,
  type CiprofloxacinIntervention,
  type CiprofloxacinInterventionGeometry,
} from "../sim/ciprofloxacinIntervention";
import type { SimulationCommand } from "../sim/protocol";
import type {
  InterventionCommitIntent,
  InterventionGeometry,
} from "../ui/interventionPreview";

export const CIPROFLOXACIN_COMMIT_AUTHORITY_SCHEMA_VERSION = 1 as const;

export type SupportedCiprofloxacinGeometry =
  Exclude<InterventionGeometry["kind"], "point">;

export interface CiprofloxacinCommitAuthority {
  readonly schemaVersion:
    typeof CIPROFLOXACIN_COMMIT_AUTHORITY_SCHEMA_VERSION;
  readonly tool: "antibiotic";
  readonly concentration: Readonly<{
    readonly parameterKey: string;
    readonly label: string;
    readonly unit: "mg/L";
    readonly min: number;
    readonly max: number;
    readonly defaultValue: number;
  }>;
  readonly blendMode: "set" | "add";
  readonly supportedGeometry: readonly SupportedCiprofloxacinGeometry[];
}

export type CiprofloxacinCommitRefusalReason =
  | "invalid-command-id"
  | "invalid-intent-id"
  | "unsupported-tool"
  | "unsupported-geometry"
  | "parameter-shape-mismatch"
  | "parameter-unit-mismatch"
  | "parameter-out-of-range"
  | "invalid-intervention-value";

export type PlannedCiprofloxacinCommand = Extract<
  SimulationCommand,
  { readonly type: "apply-ciprofloxacin" }
>;

export type CiprofloxacinCommitPlan =
  | Readonly<{
      readonly status: "ready";
      readonly sourceIntentId: string;
      readonly authorityIdentity: string;
      readonly command: PlannedCiprofloxacinCommand;
    }>
  | Readonly<{
      readonly status: "refused";
      readonly reason: CiprofloxacinCommitRefusalReason;
      readonly message: string;
    }>;

const GEOMETRY_ORDER = Object.freeze([
  "global",
  "radial",
  "stripe",
  "paint",
] as const satisfies readonly SupportedCiprofloxacinGeometry[]);

/**
 * Canonical identity for the caller-supplied preview-to-command contract.
 *
 * This metadata is application/runtime authority, not a biological parameter
 * source. The adapter never derives bounds/defaults from MIC or other science
 * records and never supplies fallback values.
 */
export function ciprofloxacinCommitAuthorityIdentity(
  authority: CiprofloxacinCommitAuthority,
): string {
  assertCiprofloxacinCommitAuthority(authority);
  return JSON.stringify({
    schemaVersion: authority.schemaVersion,
    tool: authority.tool,
    concentration: {
      parameterKey: authority.concentration.parameterKey,
      label: authority.concentration.label,
      unit: authority.concentration.unit,
      min: authority.concentration.min,
      max: authority.concentration.max,
      defaultValue: authority.concentration.defaultValue,
    },
    blendMode: authority.blendMode,
    supportedGeometry: GEOMETRY_ORDER.filter((kind) =>
      authority.supportedGeometry.includes(kind),
    ),
  });
}

/**
 * Convert one already-valid presentation commit intent into the one biological
 * intervention command currently supported by protocol v5.
 *
 * Callers must supply the authoritative UI/runtime metadata that selected the
 * parameter key, unit, bounds/default and supported geometry. This function
 * deliberately refuses point geometry rather than inventing a radius and
 * refuses every non-antibiotic tool.
 */
export function planCiprofloxacinInterventionCommand(
  intent: InterventionCommitIntent,
  authority: CiprofloxacinCommitAuthority,
  commandId: string,
): CiprofloxacinCommitPlan {
  assertCiprofloxacinCommitAuthority(authority);

  if (!canonicalNonEmpty(commandId)) {
    return refused(
      "invalid-command-id",
      "Authoritative intervention command id must be a trimmed non-empty string.",
    );
  }
  if (!canonicalNonEmpty(intent.intentId)) {
    return refused(
      "invalid-intent-id",
      "Intervention intent id must be a trimmed non-empty string.",
    );
  }
  if (intent.tool !== authority.tool) {
    return refused(
      "unsupported-tool",
      `Only the authoritative ${authority.tool} intervention is enabled by this metadata.`,
    );
  }
  if (intent.geometry.kind === "point") {
    return refused(
      "unsupported-geometry",
      "Point placement has no protocol-v5 ciprofloxacin geometry and will not be expanded into a synthetic radius.",
    );
  }
  if (!authority.supportedGeometry.includes(intent.geometry.kind)) {
    return refused(
      "unsupported-geometry",
      `Ciprofloxacin geometry ${intent.geometry.kind} is not enabled by the supplied authority.`,
    );
  }

  if (intent.parameters.length !== 1) {
    return refused(
      "parameter-shape-mismatch",
      "Ciprofloxacin application requires exactly one authoritative concentration parameter.",
    );
  }
  const parameter = intent.parameters[0];
  if (
    parameter === undefined ||
    parameter.key !== authority.concentration.parameterKey
  ) {
    return refused(
      "parameter-shape-mismatch",
      "Intervention concentration parameter does not match the supplied authoritative parameter key.",
    );
  }
  if (parameter.unit !== authority.concentration.unit) {
    return refused(
      "parameter-unit-mismatch",
      `Ciprofloxacin concentration must use ${authority.concentration.unit}.`,
    );
  }
  if (
    !Number.isFinite(parameter.value) ||
    parameter.value < authority.concentration.min ||
    parameter.value > authority.concentration.max
  ) {
    return refused(
      "parameter-out-of-range",
      "Ciprofloxacin concentration is outside the supplied authoritative bounds.",
    );
  }

  const intervention: CiprofloxacinIntervention = {
    schemaVersion: CIPROFLOXACIN_INTERVENTION_SCHEMA_VERSION,
    concentrationMgPerL: parameter.value,
    concentrationUnit: authority.concentration.unit,
    blendMode: authority.blendMode,
    geometry: toCiprofloxacinGeometry(intent.geometry),
  };

  try {
    assertCiprofloxacinIntervention(intervention);
  } catch (error) {
    return refused(
      "invalid-intervention-value",
      error instanceof Error
        ? error.message
        : "Ciprofloxacin intervention failed canonical validation.",
    );
  }

  return {
    status: "ready",
    sourceIntentId: intent.intentId,
    authorityIdentity: ciprofloxacinCommitAuthorityIdentity(authority),
    command: {
      id: commandId,
      type: "apply-ciprofloxacin",
      intervention: structuredClone(intervention),
    },
  };
}

export function assertCiprofloxacinCommitAuthority(
  authority: CiprofloxacinCommitAuthority,
): void {
  if (
    authority.schemaVersion !==
    CIPROFLOXACIN_COMMIT_AUTHORITY_SCHEMA_VERSION
  ) {
    throw new Error("unsupported ciprofloxacin commit authority version");
  }
  if (authority.tool !== "antibiotic") {
    throw new Error("ciprofloxacin commit authority tool must be antibiotic");
  }

  const concentration = authority.concentration;
  if (!canonicalNonEmpty(concentration.parameterKey)) {
    throw new Error(
      "ciprofloxacin concentration parameter key must be a trimmed non-empty string",
    );
  }
  if (!canonicalNonEmpty(concentration.label)) {
    throw new Error(
      "ciprofloxacin concentration label must be a trimmed non-empty string",
    );
  }
  if (concentration.unit !== "mg/L") {
    throw new Error("ciprofloxacin commit authority unit must be mg/L");
  }
  for (const [name, value] of [
    ["min", concentration.min],
    ["max", concentration.max],
    ["defaultValue", concentration.defaultValue],
  ] as const) {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(
        `ciprofloxacin concentration ${name} must be finite and non-negative`,
      );
    }
    assertCanonicalConcentration(value, name);
  }
  if (concentration.min > concentration.max) {
    throw new RangeError(
      "ciprofloxacin concentration min cannot exceed max",
    );
  }
  if (
    concentration.defaultValue < concentration.min ||
    concentration.defaultValue > concentration.max
  ) {
    throw new RangeError(
      "ciprofloxacin concentration defaultValue must lie within min/max",
    );
  }
  if (
    authority.blendMode !== "set" &&
    authority.blendMode !== "add"
  ) {
    throw new Error("ciprofloxacin blend mode must be set or add");
  }
  if (
    !Array.isArray(authority.supportedGeometry) ||
    authority.supportedGeometry.length === 0
  ) {
    throw new Error(
      "ciprofloxacin commit authority requires at least one supported geometry",
    );
  }

  const seen = new Set<SupportedCiprofloxacinGeometry>();
  for (const kind of authority.supportedGeometry) {
    if (!GEOMETRY_ORDER.includes(kind)) {
      throw new Error(
        "ciprofloxacin commit authority contains unsupported geometry",
      );
    }
    if (seen.has(kind)) {
      throw new Error(
        "ciprofloxacin commit authority geometries must be unique",
      );
    }
    seen.add(kind);
  }
}

function assertCanonicalConcentration(value: number, name: string): void {
  assertCiprofloxacinIntervention({
    schemaVersion: CIPROFLOXACIN_INTERVENTION_SCHEMA_VERSION,
    concentrationMgPerL: value,
    concentrationUnit: "mg/L",
    blendMode: "set",
    geometry: { kind: "global" },
  });
  if (Math.fround(value) !== value) {
    throw new RangeError(
      `ciprofloxacin concentration ${name} must be canonical Float32`,
    );
  }
}

function toCiprofloxacinGeometry(
  geometry: Exclude<InterventionGeometry, { readonly kind: "point" }>,
): CiprofloxacinInterventionGeometry {
  if (geometry.kind === "global") {
    return { kind: "global" };
  }
  if (geometry.kind === "radial") {
    return {
      kind: "radial",
      center: { ...geometry.center },
      radiusFraction: geometry.radiusFraction,
    };
  }
  if (geometry.kind === "stripe") {
    return {
      kind: "stripe",
      axis: geometry.axis,
      centerFraction: geometry.centerFraction,
      widthFraction: geometry.widthFraction,
    };
  }
  return {
    kind: "paint",
    samples: geometry.samples.map((sample) => ({ ...sample })),
    brushRadiusFraction: geometry.brushRadiusFraction,
  };
}

function canonicalNonEmpty(value: string): boolean {
  return value.trim().length > 0 && value.trim() === value;
}

function refused(
  reason: CiprofloxacinCommitRefusalReason,
  message: string,
): CiprofloxacinCommitPlan {
  return { status: "refused", reason, message };
}
