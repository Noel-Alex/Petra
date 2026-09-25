import {
  resolveBaselineNonDrugDeathHazardPerHour,
  type BaselineNonDrugLossPolicy,
} from "./baselineLossPolicy";
import type { LineageRegistryCheckpoint } from "./lineage";
import {
  migrateLineageRegistryCheckpointV1ToOriginV2,
  validateLineageOriginCheckpointV2,
  type LineageOriginCheckpointV2,
  type LineageOriginKind,
} from "./lineageOriginCheckpoint";
import {
  EXTERNAL_INOCULATION_ADMISSION_SCHEMA_VERSION,
  type ExternalInoculationAdmission,
} from "../externalInoculationAdmission";

export const RUNTIME_LINEAGE_ECOLOGY_BASELINE_AUTHORITY_VERSION = 1 as const;

export interface RuntimeLineageEcologySourceDefinition {
  /** Exact static composed lineage-definition identity. */
  readonly lineageDefinitionId: string;
  readonly genotypeId: string;
  /**
   * Organism/lineage growth authority. Omission has the existing configured
   * neutral meaning and is resolved to 1 before entering runtime authority.
   */
  readonly baselineGrowthRateScale?: number;
  readonly deathHazardPerHour: number;
}

export interface RuntimeLineageEcologyBaselineEntry {
  readonly lineageId: string;
  readonly originKind: LineageOriginKind;
  /**
   * Static lineage definition that supplied organism-level ecology authority.
   * Mutation children inherit this identity from their exact parent.
   */
  readonly sourceLineageDefinitionId: string;
  readonly baselineGrowthRateScale: number;
  readonly baselineDeathHazardPerHour: number;
}

export interface RuntimeLineageEcologyBaselineAuthority {
  readonly version: typeof RUNTIME_LINEAGE_ECOLOGY_BASELINE_AUTHORITY_VERSION;
  readonly entries: readonly RuntimeLineageEcologyBaselineEntry[];
}

export interface LegacyRuntimeLineageEcologyBaselineMigration {
  readonly lineageOrigins: LineageOriginCheckpointV2;
  readonly ecologyBaselines: RuntimeLineageEcologyBaselineAuthority;
}

/**
 * Build replay-oriented ecology baseline authority from an explicit v2 lineage
 * origin history that contains configured founders followed only by mutation
 * children.
 *
 * External roots intentionally refuse here: their source definition must come
 * from an exact #1059 admission at append time rather than being reconstructed
 * later from genotype/taxon names.
 */
export function createRuntimeLineageEcologyBaselineAuthority(args: {
  readonly lineageOrigins: LineageOriginCheckpointV2;
  readonly configuredLineages: readonly RuntimeLineageEcologySourceDefinition[];
  readonly dynamicLossPolicy: BaselineNonDrugLossPolicy | null;
}): RuntimeLineageEcologyBaselineAuthority {
  const origins = validateLineageOriginCheckpointV2(args.lineageOrigins);
  const configuredLineages = validateConfiguredLineages(args.configuredLineages);

  if (origins.records.length < configuredLineages.length) {
    throw new Error(
      "runtime lineage ecology authority must retain every configured founder",
    );
  }

  const entries: RuntimeLineageEcologyBaselineEntry[] = [];
  const entryByLineageId = new Map<string, RuntimeLineageEcologyBaselineEntry>();

  for (let index = 0; index < origins.records.length; index += 1) {
    const record = origins.records[index]!;

    if (index < configuredLineages.length) {
      const configured = configuredLineages[index]!;
      if (record.originKind !== "configured-founder") {
        throw new Error(
          "runtime lineage ecology configured-founder prefix does not match lineage origin authority",
        );
      }
      if (record.genotypeId !== configured.genotypeId) {
        throw new Error(
          "runtime lineage ecology configured founder genotype does not match source definition",
        );
      }
      const entry = freezeEntry({
        lineageId: record.lineageId,
        originKind: record.originKind,
        sourceLineageDefinitionId: configured.lineageDefinitionId,
        baselineGrowthRateScale: resolvedConfiguredGrowthScale(configured),
        baselineDeathHazardPerHour: configured.deathHazardPerHour,
      });
      entries.push(entry);
      entryByLineageId.set(entry.lineageId, entry);
      continue;
    }

    if (record.originKind === "configured-founder") {
      throw new Error(
        "configured founders must remain the genesis prefix of runtime ecology authority",
      );
    }
    if (record.originKind === "external-inoculation") {
      throw new Error(
        "external inoculation ecology authority requires exact admitted source authority",
      );
    }

    const parent = entryByLineageId.get(record.parentLineageId!);
    if (parent === undefined) {
      throw new Error(
        "mutation-child ecology authority requires an earlier authoritative parent",
      );
    }
    if (args.dynamicLossPolicy === null) {
      throw new Error(
        "mutation-child ecology authority requires explicit baseline non-drug loss policy",
      );
    }

    const entry = freezeEntry({
      lineageId: record.lineageId,
      originKind: record.originKind,
      sourceLineageDefinitionId: parent.sourceLineageDefinitionId,
      baselineGrowthRateScale: parent.baselineGrowthRateScale,
      baselineDeathHazardPerHour:
        resolveBaselineNonDrugDeathHazardPerHour(
          args.dynamicLossPolicy,
          record.genotypeId,
        ),
    });
    entries.push(entry);
    entryByLineageId.set(entry.lineageId, entry);
  }

  const authority = freezeAuthority(entries);
  validateRuntimeLineageEcologyBaselineAuthority({
    authority,
    lineageOrigins: origins,
    configuredLineages,
    dynamicLossPolicy: args.dynamicLossPolicy,
  });
  return authority;
}

/**
 * Prepare the exact current v1 founder+mutation history for future v2 adoption.
 * Ambiguous later parentless roots are refused by the lineage-origin migration;
 * this helper never guesses external inoculation provenance.
 */
export function migrateLegacyRuntimeLineageEcologyBaselineAuthority(args: {
  readonly lineageRegistry: LineageRegistryCheckpoint;
  readonly configuredLineages: readonly RuntimeLineageEcologySourceDefinition[];
  readonly dynamicLossPolicy: BaselineNonDrugLossPolicy | null;
}): LegacyRuntimeLineageEcologyBaselineMigration {
  const configuredLineages = validateConfiguredLineages(args.configuredLineages);
  const lineageOrigins = migrateLineageRegistryCheckpointV1ToOriginV2({
    checkpoint: args.lineageRegistry,
    configuredFounderCount: configuredLineages.length,
  });
  const ecologyBaselines = createRuntimeLineageEcologyBaselineAuthority({
    lineageOrigins,
    configuredLineages,
    dynamicLossPolicy: args.dynamicLossPolicy,
  });
  return Object.freeze({
    lineageOrigins,
    ecologyBaselines,
  });
}

/**
 * Extend the detached target authority for one mutation-child origin.
 *
 * Growth authority is inherited from the exact parent runtime lineage; baseline
 * loss is resolved only through the reviewed dynamic loss policy.
 */
export function appendMutationChildRuntimeLineageEcologyBaseline(args: {
  readonly current: RuntimeLineageEcologyBaselineAuthority;
  readonly currentLineageOrigins: LineageOriginCheckpointV2;
  readonly nextLineageOrigins: LineageOriginCheckpointV2;
  readonly configuredLineages: readonly RuntimeLineageEcologySourceDefinition[];
  readonly dynamicLossPolicy: BaselineNonDrugLossPolicy | null;
}): RuntimeLineageEcologyBaselineAuthority {
  const currentOrigins = validateLineageOriginCheckpointV2(
    args.currentLineageOrigins,
  );
  const nextOrigins = validateSingleOriginAppend(
    currentOrigins,
    args.nextLineageOrigins,
  );
  validateRuntimeLineageEcologyBaselineAuthority({
    authority: args.current,
    lineageOrigins: currentOrigins,
    configuredLineages: args.configuredLineages,
    dynamicLossPolicy: args.dynamicLossPolicy,
  });

  const record = nextOrigins.records.at(-1)!;
  if (record.originKind !== "mutation-child") {
    throw new Error(
      "mutation-child ecology append requires a mutation-child lineage origin",
    );
  }
  if (args.dynamicLossPolicy === null) {
    throw new Error(
      "mutation-child ecology append requires explicit baseline non-drug loss policy",
    );
  }

  const parent = args.current.entries.find(
    (entry) => entry.lineageId === record.parentLineageId,
  );
  if (parent === undefined) {
    throw new Error(
      "mutation-child ecology append requires exact parent baseline authority",
    );
  }

  const next = freezeAuthority([
    ...args.current.entries,
    freezeEntry({
      lineageId: record.lineageId,
      originKind: record.originKind,
      sourceLineageDefinitionId: parent.sourceLineageDefinitionId,
      baselineGrowthRateScale: parent.baselineGrowthRateScale,
      baselineDeathHazardPerHour:
        resolveBaselineNonDrugDeathHazardPerHour(
          args.dynamicLossPolicy,
          record.genotypeId,
        ),
    }),
  ]);
  validateRuntimeLineageEcologyBaselineAuthority({
    authority: next,
    lineageOrigins: nextOrigins,
    configuredLineages: args.configuredLineages,
    dynamicLossPolicy: args.dynamicLossPolicy,
  });
  return next;
}

/**
 * Extend the detached target authority for one admitted external runtime root.
 *
 * The new root takes ecology values only from the exact #1059 admission. The
 * configured source definition is cross-checked again so replay adoption cannot
 * silently relabel the admitted source after scenario/config drift.
 */
export function appendExternalInoculationRuntimeLineageEcologyBaseline(args: {
  readonly current: RuntimeLineageEcologyBaselineAuthority;
  readonly currentLineageOrigins: LineageOriginCheckpointV2;
  readonly nextLineageOrigins: LineageOriginCheckpointV2;
  readonly configuredLineages: readonly RuntimeLineageEcologySourceDefinition[];
  readonly dynamicLossPolicy: BaselineNonDrugLossPolicy | null;
  readonly admission: Readonly<ExternalInoculationAdmission>;
}): RuntimeLineageEcologyBaselineAuthority {
  const currentOrigins = validateLineageOriginCheckpointV2(
    args.currentLineageOrigins,
  );
  const nextOrigins = validateSingleOriginAppend(
    currentOrigins,
    args.nextLineageOrigins,
  );
  validateRuntimeLineageEcologyBaselineAuthority({
    authority: args.current,
    lineageOrigins: currentOrigins,
    configuredLineages: args.configuredLineages,
    dynamicLossPolicy: args.dynamicLossPolicy,
  });

  if (
    args.admission.schemaVersion !==
    EXTERNAL_INOCULATION_ADMISSION_SCHEMA_VERSION
  ) {
    throw new Error("unsupported external inoculation admission version");
  }

  const record = nextOrigins.records.at(-1)!;
  if (record.originKind !== "external-inoculation") {
    throw new Error(
      "external inoculation ecology append requires an external-inoculation lineage origin",
    );
  }
  const admitted = args.admission.lineageDefinition;
  canonicalIdentity(
    "external inoculation admitted source lineage definition id",
    admitted.id,
  );
  if (record.genotypeId !== admitted.genotypeId) {
    throw new Error(
      "external inoculation ecology origin genotype must match admitted source definition",
    );
  }

  const configuredLineages = validateConfiguredLineages(args.configuredLineages);
  const configured = configuredLineages.find(
    (candidate) => candidate.lineageDefinitionId === admitted.id,
  );
  if (configured === undefined) {
    throw new Error(
      "external inoculation ecology source definition is not configured in this run",
    );
  }
  if (
    configured.genotypeId !== admitted.genotypeId ||
    !Object.is(
      resolvedConfiguredGrowthScale(configured),
      admitted.baselineGrowthRateScale ?? 1,
    ) ||
    !Object.is(configured.deathHazardPerHour, admitted.deathHazardPerHour)
  ) {
    throw new Error(
      "external inoculation admitted ecology values drift from configured source authority",
    );
  }

  const next = freezeAuthority([
    ...args.current.entries,
    freezeEntry({
      lineageId: record.lineageId,
      originKind: record.originKind,
      sourceLineageDefinitionId: admitted.id,
      baselineGrowthRateScale: admitted.baselineGrowthRateScale ?? 1,
      baselineDeathHazardPerHour: admitted.deathHazardPerHour,
    }),
  ]);
  validateRuntimeLineageEcologyBaselineAuthority({
    authority: next,
    lineageOrigins: nextOrigins,
    configuredLineages,
    dynamicLossPolicy: args.dynamicLossPolicy,
  });
  return next;
}

export function validateRuntimeLineageEcologyBaselineAuthority(args: {
  readonly authority: RuntimeLineageEcologyBaselineAuthority;
  readonly lineageOrigins: LineageOriginCheckpointV2;
  readonly configuredLineages: readonly RuntimeLineageEcologySourceDefinition[];
  readonly dynamicLossPolicy: BaselineNonDrugLossPolicy | null;
}): void {
  if (
    args.authority.version !==
    RUNTIME_LINEAGE_ECOLOGY_BASELINE_AUTHORITY_VERSION
  ) {
    throw new Error("unsupported runtime lineage ecology baseline version");
  }
  if (!Array.isArray(args.authority.entries)) {
    throw new Error("runtime lineage ecology baseline entries must be an array");
  }
  validateDenseArray(
    "runtime lineage ecology baseline entries",
    args.authority.entries,
  );

  const origins = validateLineageOriginCheckpointV2(args.lineageOrigins);
  const configuredLineages = validateConfiguredLineages(args.configuredLineages);
  if (args.authority.entries.length !== origins.records.length) {
    throw new Error(
      "runtime lineage ecology baseline entries must align one-to-one with lineage origins",
    );
  }
  if (origins.records.length < configuredLineages.length) {
    throw new Error(
      "runtime lineage ecology baseline authority is missing configured founders",
    );
  }

  const sourceByDefinitionId = new Map(
    configuredLineages.map((definition) => [
      definition.lineageDefinitionId,
      definition,
    ] as const),
  );
  const entryByLineageId = new Map<string, RuntimeLineageEcologyBaselineEntry>();

  for (let index = 0; index < origins.records.length; index += 1) {
    const record = origins.records[index]!;
    const entry = args.authority.entries[index]!;

    canonicalIdentity(
      "runtime lineage ecology lineage id at index " + index,
      entry.lineageId,
    );
    canonicalIdentity(
      "runtime lineage ecology source definition id at index " + index,
      entry.sourceLineageDefinitionId,
    );
    positiveFinite(
      "runtime lineage ecology baseline growth scale at index " + index,
      entry.baselineGrowthRateScale,
    );
    finiteNonNegative(
      "runtime lineage ecology baseline death hazard at index " + index,
      entry.baselineDeathHazardPerHour,
    );
    if (
      entry.lineageId !== record.lineageId ||
      entry.originKind !== record.originKind
    ) {
      throw new Error(
        "runtime lineage ecology entries must match lineage creation order and origin kind",
      );
    }

    if (record.originKind === "configured-founder") {
      if (index >= configuredLineages.length) {
        throw new Error(
          "configured founder ecology authority appears outside configured genesis prefix",
        );
      }
      const configured = configuredLineages[index]!;
      if (
        entry.sourceLineageDefinitionId !== configured.lineageDefinitionId ||
        record.genotypeId !== configured.genotypeId ||
        !Object.is(
          entry.baselineGrowthRateScale,
          resolvedConfiguredGrowthScale(configured),
        ) ||
        !Object.is(
          entry.baselineDeathHazardPerHour,
          configured.deathHazardPerHour,
        )
      ) {
        throw new Error(
          "configured founder runtime ecology authority does not match configured source definition",
        );
      }
    } else if (record.originKind === "mutation-child") {
      const parent = entryByLineageId.get(record.parentLineageId!);
      if (parent === undefined) {
        throw new Error(
          "mutation-child runtime ecology authority requires earlier parent entry",
        );
      }
      if (
        entry.sourceLineageDefinitionId !== parent.sourceLineageDefinitionId ||
        !Object.is(
          entry.baselineGrowthRateScale,
          parent.baselineGrowthRateScale,
        )
      ) {
        throw new Error(
          "mutation-child runtime ecology growth authority must inherit exact parent source",
        );
      }
      if (args.dynamicLossPolicy === null) {
        throw new Error(
          "mutation-child runtime ecology authority requires explicit baseline non-drug loss policy",
        );
      }
      const expectedLoss = resolveBaselineNonDrugDeathHazardPerHour(
        args.dynamicLossPolicy,
        record.genotypeId,
      );
      if (!Object.is(entry.baselineDeathHazardPerHour, expectedLoss)) {
        throw new Error(
          "mutation-child runtime ecology baseline loss does not match policy authority",
        );
      }
    } else {
      const configured = sourceByDefinitionId.get(
        entry.sourceLineageDefinitionId,
      );
      if (configured === undefined) {
        throw new Error(
          "external-inoculation runtime ecology source definition is not configured",
        );
      }
      if (
        configured.genotypeId !== record.genotypeId ||
        !Object.is(
          entry.baselineGrowthRateScale,
          resolvedConfiguredGrowthScale(configured),
        ) ||
        !Object.is(
          entry.baselineDeathHazardPerHour,
          configured.deathHazardPerHour,
        )
      ) {
        throw new Error(
          "external-inoculation runtime ecology authority does not match exact configured source definition",
        );
      }
    }

    if (entryByLineageId.has(entry.lineageId)) {
      throw new Error("runtime lineage ecology lineage ids must be unique");
    }
    entryByLineageId.set(entry.lineageId, entry);
  }
}

function validateSingleOriginAppend(
  current: LineageOriginCheckpointV2,
  nextValue: LineageOriginCheckpointV2,
): LineageOriginCheckpointV2 {
  const next = validateLineageOriginCheckpointV2(nextValue);
  if (
    next.records.length !== current.records.length + 1 ||
    next.events.length !== current.events.length + 1
  ) {
    throw new Error(
      "runtime lineage ecology append requires exactly one new lineage origin",
    );
  }
  if (
    JSON.stringify(next.records.slice(0, current.records.length)) !==
      JSON.stringify(current.records) ||
    JSON.stringify(next.events.slice(0, current.events.length)) !==
      JSON.stringify(current.events)
  ) {
    throw new Error(
      "runtime lineage ecology append must preserve prior lineage origin history exactly",
    );
  }
  return next;
}

function validateConfiguredLineages(
  values: readonly RuntimeLineageEcologySourceDefinition[],
): readonly RuntimeLineageEcologySourceDefinition[] {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(
      "runtime lineage ecology source definitions must be a non-empty array",
    );
  }
  validateDenseArray("runtime lineage ecology source definitions", values);

  const ids = new Set<string>();
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]!;
    canonicalIdentity(
      "runtime lineage ecology source definition id at index " + index,
      value.lineageDefinitionId,
    );
    canonicalIdentity(
      "runtime lineage ecology source genotype id at index " + index,
      value.genotypeId,
    );
    resolvedConfiguredGrowthScale(value);
    finiteNonNegative(
      "runtime lineage ecology source death hazard at index " + index,
      value.deathHazardPerHour,
    );
    if (ids.has(value.lineageDefinitionId)) {
      throw new Error(
        "runtime lineage ecology source definition ids must be unique",
      );
    }
    ids.add(value.lineageDefinitionId);
  }
  return values;
}

function resolvedConfiguredGrowthScale(
  definition: RuntimeLineageEcologySourceDefinition,
): number {
  const scale = definition.baselineGrowthRateScale ?? 1;
  positiveFinite("runtime lineage ecology configured growth scale", scale);
  return scale;
}

function freezeAuthority(
  entries: readonly RuntimeLineageEcologyBaselineEntry[],
): RuntimeLineageEcologyBaselineAuthority {
  return Object.freeze({
    version: RUNTIME_LINEAGE_ECOLOGY_BASELINE_AUTHORITY_VERSION,
    entries: Object.freeze(entries.map((entry) => freezeEntry(entry))),
  });
}

function freezeEntry(
  entry: RuntimeLineageEcologyBaselineEntry,
): RuntimeLineageEcologyBaselineEntry {
  return Object.freeze({
    lineageId: entry.lineageId,
    originKind: entry.originKind,
    sourceLineageDefinitionId: entry.sourceLineageDefinitionId,
    baselineGrowthRateScale: entry.baselineGrowthRateScale,
    baselineDeathHazardPerHour: entry.baselineDeathHazardPerHour,
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

function canonicalIdentity(
  name: string,
  value: unknown,
): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value !== value.trim()
  ) {
    throw new Error(name + " must be a canonical non-empty string");
  }
}

function positiveFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(name + " must be positive and finite");
  }
}

function finiteNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(name + " must be finite and non-negative");
  }
}
