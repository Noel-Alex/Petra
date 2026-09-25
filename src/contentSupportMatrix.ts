import rawMatrix from "../data/content_support/v1.json";

export const CONTENT_SUPPORT_MATRIX_KIND =
  "petra-supported-content-matrix" as const;
export const CONTENT_SUPPORT_MATRIX_SCHEMA_VERSION = 1 as const;

export const CONTENT_AVAILABILITIES = [
  "enabled-research",
  "enabled-science",
] as const;
export type ContentAvailability = (typeof CONTENT_AVAILABILITIES)[number];

export const SCIENCE_MODE_STATUSES = ["not-admitted", "admitted"] as const;
export type ScienceModeStatus = (typeof SCIENCE_MODE_STATUSES)[number];

export const MICROBIAL_GROUPS = ["bacterium", "fungus"] as const;
export type SupportedMicrobialGroup = (typeof MICROBIAL_GROUPS)[number];

export const RESOURCE_BINDING_STATUSES = [
  "unbound",
  "calibrated",
  "measured_or_transferred",
] as const;
export type ResourceBindingStatus =
  (typeof RESOURCE_BINDING_STATUSES)[number];

export const RESOURCE_REPRESENTATIONS = [
  "dimensionless_model_resource",
  "physical_concentration",
] as const;
export type ResourceRepresentation =
  (typeof RESOURCE_REPRESENTATIONS)[number];

export const INTERVENTION_KINDS = [
  "antibiotic",
  "antifungal",
  "phage",
  "resource",
] as const;
export type SupportedInterventionKind = (typeof INTERVENTION_KINDS)[number];

export const INTERVENTION_GEOMETRIES = [
  "global",
  "radial",
  "stripe",
  "paint",
] as const;
export type SupportedInterventionGeometry =
  (typeof INTERVENTION_GEOMETRIES)[number];

export const QUEUE_KINDS = [
  "bacterial-competitor",
  "fungal-competitor",
  "antimicrobial",
  "interaction",
] as const;
export type ContentQueueKind = (typeof QUEUE_KINDS)[number];

export const QUEUE_AVAILABILITIES = [
  "blocked-research",
  "blocked-implementation",
  "blocked-validation",
] as const;
export type ContentQueueAvailability =
  (typeof QUEUE_AVAILABILITIES)[number];

export interface SupportedScenarioReference {
  readonly id: string;
  readonly version: string;
}

export interface SupportedOrganism {
  readonly scientificName: string;
  readonly background: string;
  readonly microbialGroup: SupportedMicrobialGroup;
  readonly presentationIdentityId: string | null;
}

export interface SupportedEnvironment {
  readonly resourceContextVersion: string;
  readonly resourceBindingStatus: ResourceBindingStatus;
  readonly resourceRepresentation: ResourceRepresentation;
  readonly medium: string | null;
  readonly referenceTemperatureC: number | null;
}

export interface SupportedIntervention {
  readonly id: string;
  readonly kind: SupportedInterventionKind;
  readonly protocolCommand: string;
  readonly concentrationUnit: string;
  readonly supportedGeometries: readonly SupportedInterventionGeometry[];
}

export interface SupportedScenario {
  readonly id: string;
  readonly availability: ContentAvailability;
  readonly scienceModeStatus: ScienceModeStatus;
  readonly scenario: SupportedScenarioReference;
  readonly organisms: readonly SupportedOrganism[];
  readonly environment: SupportedEnvironment;
  readonly interventions: readonly SupportedIntervention[];
  readonly limitations: readonly string[];
}

export interface ContentExpansionQueueEntry {
  readonly id: string;
  readonly kind: ContentQueueKind;
  readonly availability: ContentQueueAvailability;
  readonly issues: readonly number[];
  readonly reason: string;
}

export interface SupportedContentMatrix {
  readonly kind: typeof CONTENT_SUPPORT_MATRIX_KIND;
  readonly schemaVersion: typeof CONTENT_SUPPORT_MATRIX_SCHEMA_VERSION;
  readonly version: string;
  readonly supportedScenarios: readonly SupportedScenario[];
  readonly expansionQueue: readonly ContentExpansionQueueEntry[];
}

const MATRIX_KEYS = new Set([
  "kind",
  "schemaVersion",
  "version",
  "supportedScenarios",
  "expansionQueue",
]);
const SUPPORTED_SCENARIO_KEYS = new Set([
  "id",
  "availability",
  "scienceModeStatus",
  "scenario",
  "organisms",
  "environment",
  "interventions",
  "limitations",
]);
const SCENARIO_REFERENCE_KEYS = new Set(["id", "version"]);
const ORGANISM_KEYS = new Set([
  "scientificName",
  "background",
  "microbialGroup",
  "presentationIdentityId",
]);
const ENVIRONMENT_KEYS = new Set([
  "resourceContextVersion",
  "resourceBindingStatus",
  "resourceRepresentation",
  "medium",
  "referenceTemperatureC",
]);
const INTERVENTION_KEYS = new Set([
  "id",
  "kind",
  "protocolCommand",
  "concentrationUnit",
  "supportedGeometries",
]);
const QUEUE_KEYS = new Set([
  "id",
  "kind",
  "availability",
  "issues",
  "reason",
]);

export function parseSupportedContentMatrix(
  value: unknown,
): SupportedContentMatrix {
  const root = requireRecord(value, "supported content matrix");
  assertExactKeys(root, MATRIX_KEYS, "supported content matrix");

  if (root.kind !== CONTENT_SUPPORT_MATRIX_KIND) {
    throw new TypeError("unsupported content support matrix kind");
  }
  if (root.schemaVersion !== CONTENT_SUPPORT_MATRIX_SCHEMA_VERSION) {
    throw new TypeError("unsupported content support matrix schema version");
  }

  const version = canonicalText(root.version, "matrix version");
  const supportedScenarios = parseDenseArray(
    root.supportedScenarios,
    "supportedScenarios",
    parseSupportedScenario,
  );
  if (supportedScenarios.length === 0) {
    throw new RangeError("supported content matrix requires a supported scenario");
  }
  const expansionQueue = parseDenseArray(
    root.expansionQueue,
    "expansionQueue",
    parseQueueEntry,
  );

  const ids = new Set<string>();
  for (const entry of [...supportedScenarios, ...expansionQueue]) {
    if (ids.has(entry.id)) {
      throw new RangeError(`duplicate content support id: ${entry.id}`);
    }
    ids.add(entry.id);
  }

  const scenarioIdentities = new Set<string>();
  for (const entry of supportedScenarios) {
    const identity = JSON.stringify([entry.scenario.id, entry.scenario.version]);
    if (scenarioIdentities.has(identity)) {
      throw new RangeError(
        `duplicate supported scenario identity: ${entry.scenario.id}@${entry.scenario.version}`,
      );
    }
    scenarioIdentities.add(identity);
    if (
      entry.availability === "enabled-science" &&
      entry.scienceModeStatus !== "admitted"
    ) {
      throw new RangeError(
        "enabled-science content requires explicit Science-Mode admission",
      );
    }
  }

  return Object.freeze({
    kind: CONTENT_SUPPORT_MATRIX_KIND,
    schemaVersion: CONTENT_SUPPORT_MATRIX_SCHEMA_VERSION,
    version,
    supportedScenarios: Object.freeze(supportedScenarios),
    expansionQueue: Object.freeze(expansionQueue),
  });
}

export function findSupportedScenario(
  matrix: SupportedContentMatrix,
  scenarioId: string,
  scenarioVersion: string,
): SupportedScenario | null {
  const id = canonicalText(scenarioId, "scenarioId");
  const version = canonicalText(scenarioVersion, "scenarioVersion");
  return (
    matrix.supportedScenarios.find(
      (entry) =>
        entry.scenario.id === id && entry.scenario.version === version,
    ) ?? null
  );
}

export const SUPPORTED_CONTENT_MATRIX =
  parseSupportedContentMatrix(rawMatrix as unknown);

function parseSupportedScenario(
  value: unknown,
  name: string,
): SupportedScenario {
  const record = requireRecord(value, name);
  assertExactKeys(record, SUPPORTED_SCENARIO_KEYS, name);

  const id = canonicalText(record.id, `${name}.id`);
  const availability = enumValue(
    record.availability,
    CONTENT_AVAILABILITIES,
    `${name}.availability`,
  );
  const scienceModeStatus = enumValue(
    record.scienceModeStatus,
    SCIENCE_MODE_STATUSES,
    `${name}.scienceModeStatus`,
  );

  const scenarioRecord = requireRecord(record.scenario, `${name}.scenario`);
  assertExactKeys(
    scenarioRecord,
    SCENARIO_REFERENCE_KEYS,
    `${name}.scenario`,
  );
  const scenario = Object.freeze({
    id: canonicalText(scenarioRecord.id, `${name}.scenario.id`),
    version: canonicalText(
      scenarioRecord.version,
      `${name}.scenario.version`,
    ),
  });

  const organisms = parseDenseArray(
    record.organisms,
    `${name}.organisms`,
    parseOrganism,
  );
  if (organisms.length === 0) {
    throw new RangeError(`${name}.organisms must not be empty`);
  }
  const organismIdentities = new Set<string>();
  for (const organism of organisms) {
    const identity = JSON.stringify([
      organism.scientificName,
      organism.background,
    ]);
    if (organismIdentities.has(identity)) {
      throw new RangeError(`${name}.organisms contains a duplicate identity`);
    }
    organismIdentities.add(identity);
  }

  const environment = parseEnvironment(record.environment, `${name}.environment`);
  const interventions = parseDenseArray(
    record.interventions,
    `${name}.interventions`,
    parseIntervention,
  );
  const interventionIds = new Set<string>();
  const protocolCommands = new Set<string>();
  for (const intervention of interventions) {
    if (interventionIds.has(intervention.id)) {
      throw new RangeError(`${name}.interventions contains a duplicate id`);
    }
    if (protocolCommands.has(intervention.protocolCommand)) {
      throw new RangeError(
        `${name}.interventions contains a duplicate protocol command`,
      );
    }
    interventionIds.add(intervention.id);
    protocolCommands.add(intervention.protocolCommand);
  }

  const limitations = canonicalStringArray(
    record.limitations,
    `${name}.limitations`,
    true,
  );

  return Object.freeze({
    id,
    availability,
    scienceModeStatus,
    scenario,
    organisms: Object.freeze(organisms),
    environment,
    interventions: Object.freeze(interventions),
    limitations: Object.freeze(limitations),
  });
}

function parseOrganism(value: unknown, name: string): SupportedOrganism {
  const record = requireRecord(value, name);
  assertExactKeys(record, ORGANISM_KEYS, name);
  const presentationIdentityId =
    record.presentationIdentityId === null
      ? null
      : canonicalText(
          record.presentationIdentityId,
          `${name}.presentationIdentityId`,
        );

  return Object.freeze({
    scientificName: canonicalText(
      record.scientificName,
      `${name}.scientificName`,
    ),
    background: canonicalText(record.background, `${name}.background`),
    microbialGroup: enumValue(
      record.microbialGroup,
      MICROBIAL_GROUPS,
      `${name}.microbialGroup`,
    ),
    presentationIdentityId,
  });
}

function parseEnvironment(value: unknown, name: string): SupportedEnvironment {
  const record = requireRecord(value, name);
  assertExactKeys(record, ENVIRONMENT_KEYS, name);

  const medium =
    record.medium === null ? null : canonicalText(record.medium, `${name}.medium`);
  const referenceTemperatureC =
    record.referenceTemperatureC === null
      ? null
      : finiteNumber(record.referenceTemperatureC, `${name}.referenceTemperatureC`);

  return Object.freeze({
    resourceContextVersion: canonicalText(
      record.resourceContextVersion,
      `${name}.resourceContextVersion`,
    ),
    resourceBindingStatus: enumValue(
      record.resourceBindingStatus,
      RESOURCE_BINDING_STATUSES,
      `${name}.resourceBindingStatus`,
    ),
    resourceRepresentation: enumValue(
      record.resourceRepresentation,
      RESOURCE_REPRESENTATIONS,
      `${name}.resourceRepresentation`,
    ),
    medium,
    referenceTemperatureC,
  });
}

function parseIntervention(
  value: unknown,
  name: string,
): SupportedIntervention {
  const record = requireRecord(value, name);
  assertExactKeys(record, INTERVENTION_KEYS, name);
  const supportedGeometries = enumArray(
    record.supportedGeometries,
    INTERVENTION_GEOMETRIES,
    `${name}.supportedGeometries`,
    true,
  );

  return Object.freeze({
    id: canonicalText(record.id, `${name}.id`),
    kind: enumValue(record.kind, INTERVENTION_KINDS, `${name}.kind`),
    protocolCommand: canonicalText(
      record.protocolCommand,
      `${name}.protocolCommand`,
    ),
    concentrationUnit: canonicalText(
      record.concentrationUnit,
      `${name}.concentrationUnit`,
    ),
    supportedGeometries: Object.freeze(supportedGeometries),
  });
}

function parseQueueEntry(
  value: unknown,
  name: string,
): ContentExpansionQueueEntry {
  const record = requireRecord(value, name);
  assertExactKeys(record, QUEUE_KEYS, name);
  const issues = positiveIntegerArray(record.issues, `${name}.issues`, true);

  return Object.freeze({
    id: canonicalText(record.id, `${name}.id`),
    kind: enumValue(record.kind, QUEUE_KINDS, `${name}.kind`),
    availability: enumValue(
      record.availability,
      QUEUE_AVAILABILITIES,
      `${name}.availability`,
    ),
    issues: Object.freeze(issues),
    reason: canonicalText(record.reason, `${name}.reason`),
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

function assertExactKeys(
  record: Record<string, unknown>,
  expected: ReadonlySet<string>,
  name: string,
): void {
  const keys = Object.keys(record);
  if (
    keys.length !== expected.size ||
    keys.some((key) => !expected.has(key))
  ) {
    throw new TypeError(`${name} has an unexpected shape`);
  }
}

function canonicalText(value: unknown, name: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value
  ) {
    throw new TypeError(`${name} must be a canonical non-empty string`);
  }
  return value;
}

function finiteNumber(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be finite`);
  }
  return value;
}

function enumValue<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  name: string,
): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new TypeError(`${name} has an unsupported value`);
  }
  return value as T[number];
}

function parseDenseArray<T>(
  value: unknown,
  name: string,
  parser: (item: unknown, itemName: string) => T,
): T[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${name} must be an array`);
  }
  const output: T[] = [];
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) {
      throw new TypeError(`${name} must be dense`);
    }
    output.push(parser(value[index], `${name}[${index}]`));
  }
  return output;
}

function canonicalStringArray(
  value: unknown,
  name: string,
  requireNonEmpty: boolean,
): string[] {
  const values = parseDenseArray(value, name, (entry, entryName) =>
    canonicalText(entry, entryName),
  );
  if (requireNonEmpty && values.length === 0) {
    throw new RangeError(`${name} must not be empty`);
  }
  if (new Set(values).size !== values.length) {
    throw new RangeError(`${name} must be unique`);
  }
  return values;
}

function enumArray<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  name: string,
  requireNonEmpty: boolean,
): T[number][] {
  const values = parseDenseArray(value, name, (entry, entryName) =>
    enumValue(entry, allowed, entryName),
  );
  if (requireNonEmpty && values.length === 0) {
    throw new RangeError(`${name} must not be empty`);
  }
  if (new Set(values).size !== values.length) {
    throw new RangeError(`${name} must be unique`);
  }
  return values;
}

function positiveIntegerArray(
  value: unknown,
  name: string,
  requireNonEmpty: boolean,
): number[] {
  const values = parseDenseArray(value, name, (entry, entryName) => {
    if (
      typeof entry !== "number" ||
      !Number.isSafeInteger(entry) ||
      entry < 1
    ) {
      throw new TypeError(`${entryName} must be a positive safe integer`);
    }
    return entry;
  });
  if (requireNonEmpty && values.length === 0) {
    throw new RangeError(`${name} must not be empty`);
  }
  if (new Set(values).size !== values.length) {
    throw new RangeError(`${name} must be unique`);
  }
  return values;
}
