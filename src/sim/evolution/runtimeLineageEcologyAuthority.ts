import type { AdmittedExternalInoculationLineageDefinition } from "../externalInoculationAdmission";
import {
  resolveBaselineNonDrugDeathHazardPerHour,
  type BaselineNonDrugLossPolicy,
} from "./baselineLossPolicy";
import {
  validateLineageOriginCheckpointV2,
  type LineageOriginCheckpointV2,
  type LineageOriginRecordV2,
} from "./lineageOriginCheckpoint";

export const RUNTIME_LINEAGE_ECOLOGY_AUTHORITY_VERSION = 1 as const;

export interface ConfiguredLineageEcologyDefinition {
  readonly id: string;
  readonly genotypeId: string;
  /**
   * Omission is the existing configured neutral scale. The runtime authority
   * stores both that omission and its resolved numerical value.
   */
  readonly baselineGrowthRateScale?: number;
  readonly deathHazardPerHour: number;
}

export interface RuntimeLineageEcologyBaselineRecordV1 {
  readonly lineageId: string;
  readonly genotypeId: string;
  readonly originKind: LineageOriginRecordV2["originKind"];
  /** Exact static composed lineage definition that owns organism-level ecology. */
  readonly sourceLineageDefinitionId: string;
  /**
   * Null means the exact source definition omitted baselineGrowthRateScale.
   * This is distinct from an explicit numerical 1.
   */
  readonly declaredBaselineGrowthRateScale: number | null;
  /** Resolved numerical value consumed by ecology. */
  readonly baselineGrowthRateScale: number;
  readonly baselineDeathHazardPerHour: number;
}

export interface RuntimeLineageEcologyAuthorityV1 {
  readonly version: typeof RUNTIME_LINEAGE_ECOLOGY_AUTHORITY_VERSION;
  readonly records: readonly RuntimeLineageEcologyBaselineRecordV1[];
}

/**
 * Build the future v1 runtime ecology-baseline checkpoint from today's live
 * lineage channels after lineage-origin v1->v2 migration.
 *
 * Legacy state cannot contain a truthful external-inoculation root, so this
 * migration refuses one rather than guessing its source definition.
 */
export function migrateLegacyRuntimeLineageEcologyAuthorityV1(args: {
  readonly originCheckpoint: LineageOriginCheckpointV2;
  readonly configuredLineages: readonly ConfiguredLineageEcologyDefinition[];
  readonly legacyBaselineDeathHazardPerHour: readonly number[];
  readonly dynamicLossPolicy: BaselineNonDrugLossPolicy | null;
}): RuntimeLineageEcologyAuthorityV1 {
  const origins = validateLineageOriginCheckpointV2(args.originCheckpoint).records;
  const definitions = validateConfiguredLineages(args.configuredLineages);
  validateDenseArray(
    "legacy baseline death hazards",
    args.legacyBaselineDeathHazardPerHour,
  );
  if (args.legacyBaselineDeathHazardPerHour.length !== origins.length) {
    throw new Error(
      "legacy baseline death hazards must align with lineage-origin records",
    );
  }

  const configuredFounderCount = configuredFounderPrefixLength(origins);
  if (configuredFounderCount !== definitions.length) {
    throw new Error(
      "configured lineage definitions must match the lineage-origin founder prefix",
    );
  }

  const records: RuntimeLineageEcologyBaselineRecordV1[] = [];
  for (let index = 0; index < origins.length; index += 1) {
    const origin = origins[index]!;
    const legacyHazard = args.legacyBaselineDeathHazardPerHour[index]!;
    finiteNonNegative(
      `legacy baseline death hazard at index ${index}`,
      legacyHazard,
    );

    if (origin.originKind === "configured-founder") {
      const definition = definitions[index]!;
      if (origin.genotypeId !== definition.genotypeId) {
        throw new Error(
          "configured founder genotype does not match its source lineage definition",
        );
      }
      if (!Object.is(legacyHazard, definition.deathHazardPerHour)) {
        throw new Error(
          "legacy configured-founder baseline loss does not match source definition",
        );
      }
      records.push(recordFromDefinition(origin, definition));
      continue;
    }

    if (origin.originKind === "external-inoculation") {
      throw new Error(
        "legacy runtime ecology migration cannot reconstruct external-inoculation source authority",
      );
    }

    const parent = recordByLineageId(records, origin.parentLineageId);
    if (args.dynamicLossPolicy === null) {
      throw new Error(
        "legacy mutation child requires explicit baseline non-drug loss policy",
      );
    }
    const expectedHazard = resolveBaselineNonDrugDeathHazardPerHour(
      args.dynamicLossPolicy,
      origin.genotypeId,
    );
    if (!Object.is(legacyHazard, expectedHazard)) {
      throw new Error(
        "legacy mutation-child baseline loss does not match policy authority",
      );
    }
    records.push(
      Object.freeze({
        lineageId: origin.lineageId,
        genotypeId: origin.genotypeId,
        originKind: origin.originKind,
        sourceLineageDefinitionId: parent.sourceLineageDefinitionId,
        declaredBaselineGrowthRateScale:
          parent.declaredBaselineGrowthRateScale,
        baselineGrowthRateScale: parent.baselineGrowthRateScale,
        baselineDeathHazardPerHour: expectedHazard,
      }),
    );
  }

  return validateRuntimeLineageEcologyAuthorityV1({
    authority: freezeAuthority(records),
    originCheckpoint: args.originCheckpoint,
    configuredLineages: definitions,
    dynamicLossPolicy: args.dynamicLossPolicy,
  });
}

/**
 * Append exact ecology baseline authority for one already-admitted external
 * runtime root. This function allocates no lineage, biomass, taxon, population,
 * command, or event authority.
 */
export function appendExternalInoculationRuntimeLineageEcologyAuthorityV1(args: {
  readonly authority: RuntimeLineageEcologyAuthorityV1;
  readonly originCheckpoint: LineageOriginCheckpointV2;
  readonly configuredLineages: readonly ConfiguredLineageEcologyDefinition[];
  readonly dynamicLossPolicy: BaselineNonDrugLossPolicy | null;
  readonly admittedLineageDefinition: Readonly<AdmittedExternalInoculationLineageDefinition>;
}): RuntimeLineageEcologyAuthorityV1 {
  const origins = validateLineageOriginCheckpointV2(args.originCheckpoint).records;
  const definitions = validateConfiguredLineages(args.configuredLineages);
  validateAuthorityPrefix(
    args.authority,
    origins,
    definitions,
    args.dynamicLossPolicy,
  );

  if (origins.length !== args.authority.records.length + 1) {
    throw new Error(
      "external-inoculation ecology append requires exactly one new lineage origin",
    );
  }
  const origin = origins.at(-1)!;
  if (origin.originKind !== "external-inoculation") {
    throw new Error(
      "external-inoculation ecology append requires an external lineage origin",
    );
  }

  const admitted = args.admittedLineageDefinition;
  const definition = definitionById(definitions, admitted.id);
  assertAdmittedDefinitionMatchesConfigured(admitted, definition);
  if (origin.genotypeId !== admitted.genotypeId) {
    throw new Error(
      "external-inoculation lineage origin genotype does not match admitted source definition",
    );
  }

  const next = freezeAuthority([
    ...args.authority.records,
    recordFromDefinition(origin, definition),
  ]);
  return validateRuntimeLineageEcologyAuthorityV1({
    authority: next,
    originCheckpoint: args.originCheckpoint,
    configuredLineages: definitions,
    dynamicLossPolicy: args.dynamicLossPolicy,
  });
}

/**
 * Append ecology baseline authority for one mutation child whose lineage origin
 * is already authoritative. Organism-level growth authority inherits from the
 * exact parent; genotype-specific non-drug loss remains policy-owned.
 */
export function appendMutationChildRuntimeLineageEcologyAuthorityV1(args: {
  readonly authority: RuntimeLineageEcologyAuthorityV1;
  readonly originCheckpoint: LineageOriginCheckpointV2;
  readonly configuredLineages: readonly ConfiguredLineageEcologyDefinition[];
  readonly dynamicLossPolicy: BaselineNonDrugLossPolicy | null;
}): RuntimeLineageEcologyAuthorityV1 {
  const origins = validateLineageOriginCheckpointV2(args.originCheckpoint).records;
  const definitions = validateConfiguredLineages(args.configuredLineages);
  validateAuthorityPrefix(
    args.authority,
    origins,
    definitions,
    args.dynamicLossPolicy,
  );

  if (origins.length !== args.authority.records.length + 1) {
    throw new Error(
      "mutation-child ecology append requires exactly one new lineage origin",
    );
  }
  const origin = origins.at(-1)!;
  if (origin.originKind !== "mutation-child") {
    throw new Error(
      "mutation-child ecology append requires a mutation-child lineage origin",
    );
  }
  if (args.dynamicLossPolicy === null) {
    throw new Error(
      "mutation-child ecology authority requires explicit baseline non-drug loss policy",
    );
  }

  const parent = recordByLineageId(
    args.authority.records,
    origin.parentLineageId,
  );
  const hazard = resolveBaselineNonDrugDeathHazardPerHour(
    args.dynamicLossPolicy,
    origin.genotypeId,
  );

  const next = freezeAuthority([
    ...args.authority.records,
    Object.freeze({
      lineageId: origin.lineageId,
      genotypeId: origin.genotypeId,
      originKind: origin.originKind,
      sourceLineageDefinitionId: parent.sourceLineageDefinitionId,
      declaredBaselineGrowthRateScale:
        parent.declaredBaselineGrowthRateScale,
      baselineGrowthRateScale: parent.baselineGrowthRateScale,
      baselineDeathHazardPerHour: hazard,
    }),
  ]);
  return validateRuntimeLineageEcologyAuthorityV1({
    authority: next,
    originCheckpoint: args.originCheckpoint,
    configuredLineages: definitions,
    dynamicLossPolicy: args.dynamicLossPolicy,
  });
}

export function validateRuntimeLineageEcologyAuthorityV1(args: {
  readonly authority: RuntimeLineageEcologyAuthorityV1;
  readonly originCheckpoint: LineageOriginCheckpointV2;
  readonly configuredLineages: readonly ConfiguredLineageEcologyDefinition[];
  readonly dynamicLossPolicy: BaselineNonDrugLossPolicy | null;
}): RuntimeLineageEcologyAuthorityV1 {
  const origins = validateLineageOriginCheckpointV2(args.originCheckpoint).records;
  const definitions = validateConfiguredLineages(args.configuredLineages);
  if (
    args.authority.version !== RUNTIME_LINEAGE_ECOLOGY_AUTHORITY_VERSION
  ) {
    throw new Error("unsupported runtime lineage ecology authority version");
  }
  validateDenseArray("runtime lineage ecology records", args.authority.records);
  if (args.authority.records.length !== origins.length) {
    throw new Error(
      "runtime lineage ecology authority must align one-to-one with lineage origins",
    );
  }

  validateAuthorityRecords(
    args.authority.records,
    origins,
    definitions,
    args.dynamicLossPolicy,
  );
  return freezeAuthority(args.authority.records);
}

function validateAuthorityPrefix(
  authority: RuntimeLineageEcologyAuthorityV1,
  targetOrigins: readonly LineageOriginRecordV2[],
  definitions: readonly ConfiguredLineageEcologyDefinition[],
  dynamicLossPolicy: BaselineNonDrugLossPolicy | null,
): void {
  if (authority.version !== RUNTIME_LINEAGE_ECOLOGY_AUTHORITY_VERSION) {
    throw new Error("unsupported runtime lineage ecology authority version");
  }
  validateDenseArray("runtime lineage ecology records", authority.records);
  if (authority.records.length > targetOrigins.length) {
    throw new Error(
      "runtime lineage ecology authority cannot extend beyond lineage origins",
    );
  }
  validateAuthorityRecords(
    authority.records,
    targetOrigins.slice(0, authority.records.length),
    definitions,
    dynamicLossPolicy,
  );
}

function validateAuthorityRecords(
  records: readonly RuntimeLineageEcologyBaselineRecordV1[],
  origins: readonly LineageOriginRecordV2[],
  definitions: readonly ConfiguredLineageEcologyDefinition[],
  dynamicLossPolicy: BaselineNonDrugLossPolicy | null,
): void {
  const configuredFounderCount = configuredFounderPrefixLength(origins);
  if (
    records.length >= configuredFounderCount &&
    configuredFounderCount !== definitions.length
  ) {
    throw new Error(
      "configured lineage definitions must match the lineage-origin founder prefix",
    );
  }

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]!;
    const origin = origins[index]!;
    canonicalIdentity(`runtime ecology lineage id at index ${index}`, record.lineageId);
    canonicalIdentity(`runtime ecology genotype id at index ${index}`, record.genotypeId);
    canonicalIdentity(
      `runtime ecology source definition id at index ${index}`,
      record.sourceLineageDefinitionId,
    );
    if (
      record.lineageId !== origin.lineageId ||
      record.genotypeId !== origin.genotypeId ||
      record.originKind !== origin.originKind
    ) {
      throw new Error(
        "runtime lineage ecology identity must match lineage-origin creation order",
      );
    }

    finiteNonNegative(
      `runtime baseline growth-rate scale at index ${index}`,
      record.baselineGrowthRateScale,
    );
    if (record.declaredBaselineGrowthRateScale !== null) {
      finiteNonNegative(
        `declared baseline growth-rate scale at index ${index}`,
        record.declaredBaselineGrowthRateScale,
      );
    }
    finiteNonNegative(
      `runtime baseline death hazard at index ${index}`,
      record.baselineDeathHazardPerHour,
    );

    const definition = definitionById(
      definitions,
      record.sourceLineageDefinitionId,
    );
    assertScaleMatchesDefinition(record, definition);

    if (origin.originKind === "configured-founder") {
      const definitionAtFounderIndex = definitions[index];
      if (
        definitionAtFounderIndex === undefined ||
        definitionAtFounderIndex.id !== record.sourceLineageDefinitionId ||
        definitionAtFounderIndex.genotypeId !== record.genotypeId
      ) {
        throw new Error(
          "configured founder ecology authority does not match configured definition order",
        );
      }
      if (!Object.is(record.baselineDeathHazardPerHour, definition.deathHazardPerHour)) {
        throw new Error(
          "configured founder baseline loss does not match source definition",
        );
      }
      continue;
    }

    if (origin.originKind === "external-inoculation") {
      if (definition.genotypeId !== record.genotypeId) {
        throw new Error(
          "external-inoculation ecology genotype does not match source definition",
        );
      }
      if (!Object.is(record.baselineDeathHazardPerHour, definition.deathHazardPerHour)) {
        throw new Error(
          "external-inoculation baseline loss does not match admitted source definition",
        );
      }
      continue;
    }

    const parent = recordByLineageId(records.slice(0, index), origin.parentLineageId);
    if (
      parent.sourceLineageDefinitionId !== record.sourceLineageDefinitionId ||
      !Object.is(
        parent.declaredBaselineGrowthRateScale,
        record.declaredBaselineGrowthRateScale,
      ) ||
      !Object.is(parent.baselineGrowthRateScale, record.baselineGrowthRateScale)
    ) {
      throw new Error(
        "mutation-child organism growth authority must match its exact parent",
      );
    }
    if (dynamicLossPolicy === null) {
      throw new Error(
        "mutation-child ecology authority requires explicit baseline non-drug loss policy",
      );
    }
    const expectedHazard = resolveBaselineNonDrugDeathHazardPerHour(
      dynamicLossPolicy,
      record.genotypeId,
    );
    if (!Object.is(record.baselineDeathHazardPerHour, expectedHazard)) {
      throw new Error(
        "mutation-child baseline loss does not match policy authority",
      );
    }
  }
}

function recordFromDefinition(
  origin: LineageOriginRecordV2,
  definition: ConfiguredLineageEcologyDefinition,
): RuntimeLineageEcologyBaselineRecordV1 {
  const declaredBaselineGrowthRateScale =
    definition.baselineGrowthRateScale === undefined
      ? null
      : definition.baselineGrowthRateScale;
  return Object.freeze({
    lineageId: origin.lineageId,
    genotypeId: origin.genotypeId,
    originKind: origin.originKind,
    sourceLineageDefinitionId: definition.id,
    declaredBaselineGrowthRateScale,
    baselineGrowthRateScale: declaredBaselineGrowthRateScale ?? 1,
    baselineDeathHazardPerHour: definition.deathHazardPerHour,
  });
}

function assertAdmittedDefinitionMatchesConfigured(
  admitted: Readonly<AdmittedExternalInoculationLineageDefinition>,
  configured: ConfiguredLineageEcologyDefinition,
): void {
  if (admitted.genotypeId !== configured.genotypeId) {
    throw new Error(
      "admitted external lineage genotype does not match configured source definition",
    );
  }
  const admittedDeclared =
    admitted.baselineGrowthRateScale === undefined
      ? null
      : admitted.baselineGrowthRateScale;
  const configuredDeclared =
    configured.baselineGrowthRateScale === undefined
      ? null
      : configured.baselineGrowthRateScale;
  if (!Object.is(admittedDeclared, configuredDeclared)) {
    throw new Error(
      "admitted external lineage growth scale does not match configured source definition",
    );
  }
  if (!Object.is(admitted.deathHazardPerHour, configured.deathHazardPerHour)) {
    throw new Error(
      "admitted external lineage baseline loss does not match configured source definition",
    );
  }
}

function assertScaleMatchesDefinition(
  record: RuntimeLineageEcologyBaselineRecordV1,
  definition: ConfiguredLineageEcologyDefinition,
): void {
  const declared =
    definition.baselineGrowthRateScale === undefined
      ? null
      : definition.baselineGrowthRateScale;
  if (!Object.is(record.declaredBaselineGrowthRateScale, declared)) {
    throw new Error(
      "runtime lineage declared growth scale does not match source definition",
    );
  }
  const resolved = declared ?? 1;
  if (!Object.is(record.baselineGrowthRateScale, resolved)) {
    throw new Error(
      "runtime lineage resolved growth scale does not match source definition",
    );
  }
}

function configuredFounderPrefixLength(
  origins: readonly LineageOriginRecordV2[],
): number {
  let count = 0;
  for (const origin of origins) {
    if (origin.originKind !== "configured-founder") break;
    count += 1;
  }
  return count;
}

function validateConfiguredLineages(
  definitions: readonly ConfiguredLineageEcologyDefinition[],
): readonly ConfiguredLineageEcologyDefinition[] {
  validateDenseArray("configured lineage ecology definitions", definitions);
  if (definitions.length === 0) {
    throw new Error("configured lineage ecology definitions must be non-empty");
  }
  const ids = new Set<string>();
  for (let index = 0; index < definitions.length; index += 1) {
    const definition = definitions[index]!;
    canonicalIdentity(`configured lineage id at index ${index}`, definition.id);
    canonicalIdentity(
      `configured lineage genotype at index ${index}`,
      definition.genotypeId,
    );
    if (ids.has(definition.id)) {
      throw new Error(
        `configured lineage ecology definition ids must be unique: ${definition.id}`,
      );
    }
    ids.add(definition.id);
    if (definition.baselineGrowthRateScale !== undefined) {
      finiteNonNegative(
        `configured baseline growth-rate scale(${definition.id})`,
        definition.baselineGrowthRateScale,
      );
    }
    finiteNonNegative(
      `configured baseline death hazard(${definition.id})`,
      definition.deathHazardPerHour,
    );
  }
  return definitions;
}

function definitionById(
  definitions: readonly ConfiguredLineageEcologyDefinition[],
  id: string,
): ConfiguredLineageEcologyDefinition {
  const definition = definitions.find((candidate) => candidate.id === id);
  if (definition === undefined) {
    throw new Error(
      `runtime lineage ecology source definition is not configured: ${id}`,
    );
  }
  return definition;
}

function recordByLineageId(
  records: readonly RuntimeLineageEcologyBaselineRecordV1[],
  lineageId: string,
): RuntimeLineageEcologyBaselineRecordV1 {
  const record = records.find((candidate) => candidate.lineageId === lineageId);
  if (record === undefined) {
    throw new Error(
      `runtime lineage ecology authority is missing parent ${lineageId}`,
    );
  }
  return record;
}

function freezeAuthority(
  records: readonly RuntimeLineageEcologyBaselineRecordV1[],
): RuntimeLineageEcologyAuthorityV1 {
  return Object.freeze({
    version: RUNTIME_LINEAGE_ECOLOGY_AUTHORITY_VERSION,
    records: Object.freeze(
      records.map((record) =>
        Object.freeze({
          lineageId: record.lineageId,
          genotypeId: record.genotypeId,
          originKind: record.originKind,
          sourceLineageDefinitionId: record.sourceLineageDefinitionId,
          declaredBaselineGrowthRateScale:
            record.declaredBaselineGrowthRateScale,
          baselineGrowthRateScale: record.baselineGrowthRateScale,
          baselineDeathHazardPerHour: record.baselineDeathHazardPerHour,
        }),
      ),
    ),
  });
}

function validateDenseArray(name: string, values: readonly unknown[]): void {
  if (!Array.isArray(values)) {
    throw new Error(name + " must be an array");
  }
  for (let index = 0; index < values.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(values, index)) {
      throw new Error(name + " must be dense");
    }
  }
}

function canonicalIdentity(name: string, value: unknown): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value !== value.trim()
  ) {
    throw new Error(name + " must be a canonical non-empty string");
  }
}

function finiteNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(name + " must be finite and non-negative");
  }
}
