export type ResourceContextBindingStatus =
  | "unbound"
  | "calibrated"
  | "measured_or_transferred";

export type ResourceContextRepresentation =
  | "dimensionless_model_resource"
  | "physical_concentration";

export type ResourceContextBoundary = "no_flux" | "external_feed";

export type ResourceContextEvidenceClass =
  | "measured"
  | "derived"
  | "transferred"
  | "calibrated"
  | "mechanistic_approximation"
  | "engineering"
  | "visual_only"
  | "hypothesis_experimental"
  | "transferred_mechanistic_approximation";

export interface ResourceContextProvenance {
  readonly classification: ResourceContextEvidenceClass;
  readonly citation?: string;
  readonly citations?: readonly string[];
  readonly context?: string;
  readonly transformation?: string;
  readonly uncertainty?: string;
  readonly transferNote?: string;
  readonly calibrationNote?: string;
  readonly limitation?: string;
}

export interface ScenarioResourceContext {
  readonly version: string;
  readonly bindingStatus: ResourceContextBindingStatus;
  readonly representation: ResourceContextRepresentation;
  readonly concentrationUnit: string;
  readonly limitingSubstrate: string | null;
  readonly medium: string | null;
  readonly referenceTemperatureC: number | null;
  readonly boundary: ResourceContextBoundary;
  readonly initialCondition: string;
  readonly biomassMapping: string;
  readonly provenance: ResourceContextProvenance;
}

const BINDING_STATUSES = new Set<ResourceContextBindingStatus>([
  "unbound",
  "calibrated",
  "measured_or_transferred",
]);
const REPRESENTATIONS = new Set<ResourceContextRepresentation>([
  "dimensionless_model_resource",
  "physical_concentration",
]);
const BOUNDARIES = new Set<ResourceContextBoundary>([
  "no_flux",
  "external_feed",
]);
const EVIDENCE_CLASSES = new Set<ResourceContextEvidenceClass>([
  "measured",
  "derived",
  "transferred",
  "calibrated",
  "mechanistic_approximation",
  "engineering",
  "visual_only",
  "hypothesis_experimental",
  "transferred_mechanistic_approximation",
]);

const SOURCE_REQUIRED_EVIDENCE_CLASSES =
  new Set<ResourceContextEvidenceClass>([
    "measured",
    "derived",
    "transferred",
    "mechanistic_approximation",
    "transferred_mechanistic_approximation",
  ]);

/**
 * Validates and isolates scenario resource metadata before it enters simulation
 * composition. The returned value is immutable and contains no live JSON refs.
 */
export function parseScenarioResourceContext(
  value: unknown,
): ScenarioResourceContext {
  const record = requireRecord("resourceContext", value);
  const provenanceRecord = requireRecord(
    "resourceContext.provenance",
    record.provenance,
  );

  const bindingStatus = requireEnum(
    "resourceContext.bindingStatus",
    record.bindingStatus,
    BINDING_STATUSES,
  );
  const representation = requireEnum(
    "resourceContext.representation",
    record.representation,
    REPRESENTATIONS,
  );
  const boundary = requireEnum(
    "resourceContext.boundary",
    record.boundary,
    BOUNDARIES,
  );
  const classification = requireEnum(
    "resourceContext.provenance.classification",
    provenanceRecord.classification,
    EVIDENCE_CLASSES,
  );

  const parsed: ScenarioResourceContext = {
    version: requireText("resourceContext.version", record.version),
    bindingStatus,
    representation,
    concentrationUnit: requireText(
      "resourceContext.concentrationUnit",
      record.concentrationUnit,
    ),
    limitingSubstrate: optionalText(
      "resourceContext.limitingSubstrate",
      record.limitingSubstrate,
    ),
    medium: optionalText("resourceContext.medium", record.medium),
    referenceTemperatureC: optionalFiniteNumber(
      "resourceContext.referenceTemperatureC",
      record.referenceTemperatureC,
    ),
    boundary,
    initialCondition: requireText(
      "resourceContext.initialCondition",
      record.initialCondition,
    ),
    biomassMapping: requireText(
      "resourceContext.biomassMapping",
      record.biomassMapping,
    ),
    provenance: parseProvenance(provenanceRecord, classification),
  };

  validateSemanticContract(parsed);

  return Object.freeze({
    ...parsed,
    provenance: Object.freeze({
      ...parsed.provenance,
      ...(parsed.provenance.citations === undefined
        ? {}
        : { citations: Object.freeze([...parsed.provenance.citations]) }),
    }),
  });
}

/**
 * Canonical replay/configuration identity for resource meaning and units.
 * Citation order is canonicalized because source-key order is not scientific
 * state; every semantic field remains identity-bearing.
 */
export function resourceContextIdentity(
  context: ScenarioResourceContext,
): string {
  const parsed = parseScenarioResourceContext(context);
  return JSON.stringify({
    version: parsed.version,
    bindingStatus: parsed.bindingStatus,
    representation: parsed.representation,
    concentrationUnit: parsed.concentrationUnit,
    limitingSubstrate: parsed.limitingSubstrate,
    medium: parsed.medium,
    referenceTemperatureC: parsed.referenceTemperatureC,
    boundary: parsed.boundary,
    initialCondition: parsed.initialCondition,
    biomassMapping: parsed.biomassMapping,
    provenance: {
      classification: parsed.provenance.classification,
      citation: parsed.provenance.citation ?? null,
      citations: [...(parsed.provenance.citations ?? [])].sort(),
      context: parsed.provenance.context ?? null,
      transformation: parsed.provenance.transformation ?? null,
      uncertainty: parsed.provenance.uncertainty ?? null,
      transferNote: parsed.provenance.transferNote ?? null,
      calibrationNote: parsed.provenance.calibrationNote ?? null,
      limitation: parsed.provenance.limitation ?? null,
    },
  });
}

function validateSemanticContract(context: ScenarioResourceContext): void {
  validateProvenanceContract(context.provenance);

  if (context.bindingStatus === "unbound") {
    if (context.representation !== "dimensionless_model_resource") {
      throw new Error(
        "unbound resource context must use dimensionless_model_resource",
      );
    }
    if (context.concentrationUnit !== "model-resource") {
      throw new Error("unbound resource context must use model-resource units");
    }
    if (context.limitingSubstrate !== null || context.medium !== null) {
      throw new Error(
        "unbound resource context must not claim a physical substrate or medium",
      );
    }
    if (context.provenance.classification !== "engineering") {
      throw new Error(
        "unbound resource context must use engineering provenance",
      );
    }
    if (context.provenance.limitation === undefined) {
      throw new Error(
        "unbound resource context requires an explicit provenance limitation",
      );
    }
  }

  if (context.representation === "physical_concentration") {
    if (context.limitingSubstrate === null || context.medium === null) {
      throw new Error(
        "physical resource context requires limiting substrate and medium",
      );
    }
    if (context.concentrationUnit === "model-resource") {
      throw new Error(
        "physical resource context cannot use model-resource concentration units",
      );
    }
  }
}

function validateProvenanceContract(
  provenance: ResourceContextProvenance,
): void {
  const sourceCount =
    (provenance.citation === undefined ? 0 : 1) +
    (provenance.citations?.length ?? 0);

  if (
    SOURCE_REQUIRED_EVIDENCE_CLASSES.has(provenance.classification) &&
    sourceCount === 0
  ) {
    throw new Error(
      `resourceContext.provenance requires at least one citation key for ${provenance.classification}`,
    );
  }

  if (
    (provenance.classification === "transferred" ||
      provenance.classification === "transferred_mechanistic_approximation") &&
    provenance.transferNote === undefined
  ) {
    throw new Error(
      "resourceContext.provenance.transferNote is required for transferred evidence",
    );
  }

  if (
    (provenance.classification === "mechanistic_approximation" ||
      provenance.classification === "transferred_mechanistic_approximation") &&
    provenance.limitation === undefined
  ) {
    throw new Error(
      "resourceContext.provenance.limitation is required for model approximations",
    );
  }

  if (
    provenance.classification === "derived" &&
    provenance.transformation === undefined
  ) {
    throw new Error(
      "resourceContext.provenance.transformation is required for derived evidence",
    );
  }
}

function parseProvenance(
  record: Record<string, unknown>,
  classification: ResourceContextEvidenceClass,
): ResourceContextProvenance {
  const citations =
    record.citations === undefined
      ? undefined
      : parseCitations(record.citations);

  return {
    classification,
    ...optionalField("citation", record.citation),
    ...(citations === undefined ? {} : { citations }),
    ...optionalField("context", record.context),
    ...optionalField("transformation", record.transformation),
    ...optionalField("uncertainty", record.uncertainty),
    ...optionalField("transferNote", record.transferNote),
    ...optionalField("calibrationNote", record.calibrationNote),
    ...optionalField("limitation", record.limitation),
  };
}

function parseCitations(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(
      "resourceContext.provenance.citations must be a non-empty array",
    );
  }
  const citations = value.map((item, index) =>
    requireText(`resourceContext.provenance.citations[${index}]`, item),
  );
  if (new Set(citations).size !== citations.length) {
    throw new Error("resourceContext.provenance.citations must be unique");
  }
  return citations;
}

function requireRecord(
  name: string,
  value: unknown,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireText(name: string, value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
  if (value !== value.trim()) {
    throw new Error(`${name} must be trimmed`);
  }
  return value;
}

function optionalText(name: string, value: unknown): string | null {
  if (value === null) return null;
  return requireText(name, value);
}

function optionalFiniteNumber(name: string, value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${name} must be finite or null`);
  }
  return value;
}

function optionalField(
  key: keyof Omit<ResourceContextProvenance, "classification" | "citations">,
  value: unknown,
): Partial<ResourceContextProvenance> {
  return value === undefined
    ? {}
    : { [key]: requireText(`resourceContext.provenance.${key}`, value) };
}

function requireEnum<T extends string>(
  name: string,
  value: unknown,
  allowed: ReadonlySet<T>,
): T {
  if (typeof value !== "string" || !allowed.has(value as T)) {
    throw new Error(`${name} has an unsupported value`);
  }
  return value as T;
}
