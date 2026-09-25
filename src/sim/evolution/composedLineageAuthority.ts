import {
  resolveBaselineNonDrugDeathHazardPerHour,
  type BaselineNonDrugLossPolicy,
} from "./baselineLossPolicy";
import {
  initializeFounderLineageRegistry,
  type FounderLineageDefinition,
} from "./founderLineageRegistry";
import {
  LineageRegistry,
  type LineageRegistryCheckpoint,
  type LineageRecord,
} from "./lineage";
import {
  CHILD_LINEAGE_MATERIALIZATION_VERSION,
  type ChildLineageMaterializationResult,
  type MaterializedMutationChild,
} from "./materializeMutationLineages";

export interface ComposedFounderLineageAuthority {
  /** Static scenario/config definition identity, not runtime lineage identity. */
  readonly founderId: string;
  readonly genotypeId: string;
  readonly deathHazardPerHour: number;
}

export interface DynamicLineageAuthorityState {
  readonly lineageIds: readonly string[];
  readonly genotypeIds: readonly string[];
  readonly baselineDeathHazardPerHour: readonly number[];
  readonly lineageRegistry: LineageRegistryCheckpoint;
}

/**
 * Create replay-critical runtime lineage identity for configured founders.
 *
 * Static founder IDs remain in configuration. Runtime biological lineage IDs
 * come exclusively from the lineage registry allocator and therefore begin
 * L1, L2, ... in founder configuration order.
 */
export function initializeDynamicLineageAuthority(
  founders: readonly ComposedFounderLineageAuthority[],
): DynamicLineageAuthorityState {
  validateFounders(founders);
  const initialized = initializeFounderLineageRegistry(
    founders.map(toFounderDefinition),
  );

  const state: DynamicLineageAuthorityState = {
    lineageIds: initialized.bindings.map((binding) => binding.lineageId),
    genotypeIds: initialized.bindings.map((binding) => binding.genotypeId),
    baselineDeathHazardPerHour: founders.map(
      (founder) => founder.deathHazardPerHour,
    ),
    lineageRegistry: initialized.checkpoint,
  };
  validateDynamicLineageAuthorityState(state, founders, null);
  return cloneState(state);
}

/**
 * Validate the ordered dynamic lineage identity needed for deterministic
 * composed continuation.
 *
 * Configured founders must remain the exact registry genesis prefix. Any later
 * record is a runtime child, must have a parent, and must resolve its persisted
 * baseline non-drug loss from the selected static policy. Registry record order
 * is the lineage channel order.
 */
export function validateDynamicLineageAuthorityState(
  state: DynamicLineageAuthorityState,
  founders: readonly ComposedFounderLineageAuthority[],
  dynamicLossPolicy: BaselineNonDrugLossPolicy | null,
): void {
  validateFounders(founders);
  validateDenseArray("dynamic lineage ids", state.lineageIds);
  validateDenseArray("dynamic genotype ids", state.genotypeIds);
  validateDenseArray(
    "dynamic baseline death hazards",
    state.baselineDeathHazardPerHour,
  );

  if (
    state.lineageIds.length !== state.genotypeIds.length ||
    state.lineageIds.length !== state.baselineDeathHazardPerHour.length
  ) {
    throw new Error("dynamic lineage identity/parameter channels must align");
  }
  if (state.lineageIds.length < founders.length) {
    throw new Error("dynamic lineage state must retain every configured founder");
  }

  const checkpoint = canonicalCheckpoint(state.lineageRegistry);
  if (checkpoint.records.length !== state.lineageIds.length) {
    throw new Error(
      "dynamic lineage channels must align one-to-one with registry records",
    );
  }

  const expectedFounders = initializeFounderLineageRegistry(
    founders.map(toFounderDefinition),
  );
  for (let index = 0; index < checkpoint.records.length; index += 1) {
    const record = checkpoint.records[index]!;
    const lineageId = state.lineageIds[index];
    const genotypeId = state.genotypeIds[index];
    const hazard = state.baselineDeathHazardPerHour[index];

    canonicalIdentity("dynamic lineage id at index " + index, lineageId);
    canonicalIdentity("dynamic genotype id at index " + index, genotypeId);
    finiteNonNegative(
      "dynamic baseline deathHazardPerHour at index " + index,
      hazard,
    );

    if (
      lineageId !== record.lineageId ||
      genotypeId !== record.genotypeId
    ) {
      throw new Error(
        "dynamic lineage identity channels must match registry creation order",
      );
    }

    if (index < founders.length) {
      const expectedBinding = expectedFounders.bindings[index]!;
      const founder = founders[index]!;
      if (
        lineageId !== expectedBinding.lineageId ||
        genotypeId !== founder.genotypeId
      ) {
        throw new Error(
          "dynamic lineage founder prefix does not match configured genesis order",
        );
      }
      if (!Object.is(hazard, founder.deathHazardPerHour)) {
        throw new Error(
          "dynamic lineage founder baseline loss does not match configuration",
        );
      }
      if (record.parentLineageId !== null) {
        throw new Error("configured founder lineage cannot have a parent");
      }
      continue;
    }

    if (record.parentLineageId === null) {
      throw new Error("runtime-created lineage must have a parent");
    }
    if (dynamicLossPolicy === null) {
      throw new Error(
        "runtime-created lineage requires explicit baseline non-drug loss policy",
      );
    }
    const expectedHazard = resolveBaselineNonDrugDeathHazardPerHour(
      dynamicLossPolicy,
      genotypeId!,
    );
    if (!Object.is(hazard, expectedHazard)) {
      throw new Error(
        "runtime-created lineage baseline loss does not match policy authority",
      );
    }
  }
}

/**
 * Extend lineage identity/parameter authority from an already-reviewed mutation
 * materialization transaction. This function does not move biomass or advance
 * population authority; it only validates and commits the replay-critical
 * lineage registry/channel seam on detached values.
 */
export function appendMaterializedMutationLineagesToAuthority(
  state: DynamicLineageAuthorityState,
  founders: readonly ComposedFounderLineageAuthority[],
  dynamicLossPolicy: BaselineNonDrugLossPolicy | null,
  materialization: ChildLineageMaterializationResult,
): DynamicLineageAuthorityState {
  validateDynamicLineageAuthorityState(
    state,
    founders,
    dynamicLossPolicy,
  );
  if (
    materialization.version !== CHILD_LINEAGE_MATERIALIZATION_VERSION
  ) {
    throw new Error("unsupported child lineage materialization version");
  }
  if (!Array.isArray(materialization.children)) {
    throw new Error("materialized mutation children must be an array");
  }
  validateDenseArray("materialized mutation children", materialization.children);

  const currentCheckpoint = canonicalCheckpoint(state.lineageRegistry);
  const nextCheckpoint = canonicalCheckpoint(materialization.lineageCheckpoint);
  const expectedRecordCount =
    currentCheckpoint.records.length + materialization.children.length;
  if (nextCheckpoint.records.length !== expectedRecordCount) {
    throw new Error(
      "materialized lineage checkpoint record count does not match children",
    );
  }
  if (
    nextCheckpoint.events.length !==
    currentCheckpoint.events.length + materialization.children.length
  ) {
    throw new Error(
      "materialized lineage checkpoint event count does not match children",
    );
  }
  assertCheckpointPrefix(currentCheckpoint, nextCheckpoint);

  const lineageIds = [...state.lineageIds];
  const genotypeIds = [...state.genotypeIds];
  const baselineDeathHazardPerHour = [
    ...state.baselineDeathHazardPerHour,
  ];

  for (let index = 0; index < materialization.children.length; index += 1) {
    const child = materialization.children[index]!;
    const record =
      nextCheckpoint.records[currentCheckpoint.records.length + index]!;
    validateMaterializedChild(child, record);

    if (dynamicLossPolicy === null) {
      throw new Error(
        "materialized mutation child requires explicit baseline non-drug loss policy",
      );
    }
    const hazard = resolveBaselineNonDrugDeathHazardPerHour(
      dynamicLossPolicy,
      child.targetGenotypeId,
    );
    lineageIds.push(child.lineageId);
    genotypeIds.push(child.targetGenotypeId);
    baselineDeathHazardPerHour.push(hazard);
  }

  const nextState: DynamicLineageAuthorityState = {
    lineageIds,
    genotypeIds,
    baselineDeathHazardPerHour,
    lineageRegistry: nextCheckpoint,
  };
  validateDynamicLineageAuthorityState(
    nextState,
    founders,
    dynamicLossPolicy,
  );
  return cloneState(nextState);
}

function validateMaterializedChild(
  child: MaterializedMutationChild,
  record: LineageRecord,
): void {
  if (
    child.lineageId !== record.lineageId ||
    child.targetGenotypeId !== record.genotypeId ||
    child.parentLineageId !== record.parentLineageId ||
    child.createdAtHours !== record.createdAtHours ||
    child.originCellIndex !== record.originCellIndex ||
    child.mutationClass !== record.mutationClass
  ) {
    throw new Error(
      "materialized mutation child does not match registry checkpoint record",
    );
  }
}

function assertCheckpointPrefix(
  current: LineageRegistryCheckpoint,
  next: LineageRegistryCheckpoint,
): void {
  const recordPrefix = next.records.slice(0, current.records.length);
  const eventPrefix = next.events.slice(0, current.events.length);
  if (
    JSON.stringify(recordPrefix) !== JSON.stringify(current.records) ||
    JSON.stringify(eventPrefix) !== JSON.stringify(current.events)
  ) {
    throw new Error(
      "materialized lineage checkpoint must preserve prior registry history exactly",
    );
  }
}

function canonicalCheckpoint(
  checkpoint: LineageRegistryCheckpoint,
): LineageRegistryCheckpoint {
  return LineageRegistry.restore(checkpoint).checkpoint();
}

function toFounderDefinition(
  founder: ComposedFounderLineageAuthority,
): FounderLineageDefinition {
  return {
    founderId: founder.founderId,
    genotypeId: founder.genotypeId,
  };
}

function validateFounders(
  founders: readonly ComposedFounderLineageAuthority[],
): void {
  if (!Array.isArray(founders) || founders.length === 0) {
    throw new Error("composed founder lineage authority must be non-empty");
  }
  validateDenseArray("composed founder lineage authority", founders);
  const ids = new Set<string>();
  for (let index = 0; index < founders.length; index += 1) {
    const founder = founders[index]!;
    canonicalIdentity("composed founder id at index " + index, founder.founderId);
    canonicalIdentity(
      "composed founder genotype id at index " + index,
      founder.genotypeId,
    );
    finiteNonNegative(
      "composed founder deathHazardPerHour at index " + index,
      founder.deathHazardPerHour,
    );
    if (ids.has(founder.founderId)) {
      throw new Error("composed founder ids must be unique");
    }
    ids.add(founder.founderId);
  }
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

function cloneState(
  state: DynamicLineageAuthorityState,
): DynamicLineageAuthorityState {
  return {
    lineageIds: [...state.lineageIds],
    genotypeIds: [...state.genotypeIds],
    baselineDeathHazardPerHour: [...state.baselineDeathHazardPerHour],
    lineageRegistry: canonicalCheckpoint(state.lineageRegistry),
  };
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
