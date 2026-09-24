import {
  LineageRegistry,
  type LineageRegistryCheckpoint,
  type LineageRecord,
} from "./lineage";
import type {
  SpatialMutationBatchResult,
  SpatialMutationBirthCount,
  SpatialMutationCellOutcome,
} from "./spatialMutation";

export const CHILD_LINEAGE_MATERIALIZATION_VERSION = 1 as const;

export interface MaterializedMutationChild {
  readonly lineageId: string;
  readonly parentLineageId: string;
  readonly sourceGenotypeId: string;
  readonly targetGenotypeId: string;
  readonly originCellIndex: number;
  readonly createdAtHours: number;
  readonly mutationClass: string;
  readonly citationKey: string;
  /** Zero-based deterministic order among births represented by one sampled count. */
  readonly birthOrdinal: number;
}

export interface ChildLineageMaterializationResult {
  readonly version: typeof CHILD_LINEAGE_MATERIALIZATION_VERSION;
  readonly populationConfigurationIdentity: string;
  readonly populationRevision: number;
  readonly samplingPolicyIdentity: string;
  readonly createdAtHours: number;
  readonly children: readonly MaterializedMutationChild[];
  readonly lineageCheckpoint: LineageRegistryCheckpoint;
}

export interface MaterializeSpatialMutationLineagesArgs {
  readonly lineageCheckpoint: LineageRegistryCheckpoint;
  readonly mutationBatch: SpatialMutationBatchResult;
  readonly createdAtHours: number;
  /**
   * Runtime work ceiling only. This does not alter mutation probabilities or
   * biology; exceeding it refuses the whole transaction so callers may retry
   * through a separately budgeted execution path.
   */
  readonly maxMaterializedChildren: number;
}

/**
 * Atomically materializes sampled mutant births into deterministic lineage IDs.
 *
 * The caller-owned registry checkpoint is never mutated. All validation and
 * lineage creation occur on a restored clone, and the new checkpoint is
 * returned only after every sampled birth has been materialized successfully.
 *
 * This transaction deliberately does not allocate composed biomass or add
 * simulation-state channels. The returned child mapping is the exact handoff
 * required by the later composed-state integration transaction.
 */
export function materializeSpatialMutationLineages(
  args: MaterializeSpatialMutationLineagesArgs,
): ChildLineageMaterializationResult {
  finiteNonNegative("child lineage creation time", args.createdAtHours);
  positiveSafeInteger(
    "maxMaterializedChildren",
    args.maxMaterializedChildren,
  );
  canonicalIdentity(
    "population configuration identity",
    args.mutationBatch.populationConfigurationIdentity,
  );
  nonNegativeSafeInteger(
    "population revision",
    args.mutationBatch.populationRevision,
  );
  canonicalIdentity(
    "sampling policy identity",
    args.mutationBatch.samplingPolicyIdentity,
  );
  nonNegativeSafeInteger(
    "reported mutant births",
    args.mutationBatch.totalMutantBirths,
  );

  const registry = LineageRegistry.restore(args.lineageCheckpoint);
  const sourceRecords = preflightBatch(
    registry,
    args.mutationBatch,
    args.createdAtHours,
  );

  if (
    args.mutationBatch.totalMutantBirths >
    args.maxMaterializedChildren
  ) {
    throw new RangeError(
      "sampled mutant births exceed child-lineage materialization work ceiling",
    );
  }

  const children: MaterializedMutationChild[] = [];

  for (const cell of args.mutationBatch.cells) {
    const parent = sourceRecords.get(cell.sourceLineageId)!;

    for (const birth of cell.mutationBirths) {
      for (let birthOrdinal = 0; birthOrdinal < birth.count; birthOrdinal += 1) {
        const record = registry.create({
          parentLineageId: parent.lineageId,
          genotypeId: birth.targetGenotypeId,
          createdAtHours: args.createdAtHours,
          originCellIndex: cell.cellIndex,
          mutationClass: birth.mutationClass,
        });

        children.push(
          freezeChild(
            record,
            cell,
            birth,
            args.createdAtHours,
            birthOrdinal,
          ),
        );
      }
    }
  }

  if (children.length !== args.mutationBatch.totalMutantBirths) {
    throw new Error(
      "materialized child lineage count does not match sampled mutant births",
    );
  }

  return Object.freeze({
    version: CHILD_LINEAGE_MATERIALIZATION_VERSION,
    populationConfigurationIdentity:
      args.mutationBatch.populationConfigurationIdentity,
    populationRevision: args.mutationBatch.populationRevision,
    samplingPolicyIdentity: args.mutationBatch.samplingPolicyIdentity,
    createdAtHours: args.createdAtHours,
    children: Object.freeze(children),
    lineageCheckpoint: registry.checkpoint(),
  });
}

function preflightBatch(
  registry: LineageRegistry,
  batch: SpatialMutationBatchResult,
  createdAtHours: number,
): ReadonlyMap<string, LineageRecord> {
  if (!Array.isArray(batch.cells)) {
    throw new Error("spatial mutation batch cells must be an array");
  }

  let computedMutantBirths = 0;
  const sourceRecords = new Map<string, LineageRecord>();
  const seenCellKeys = new Set<string>();

  for (let cellIndex = 0; cellIndex < batch.cells.length; cellIndex += 1) {
    if (!Object.prototype.hasOwnProperty.call(batch.cells, cellIndex)) {
      throw new Error("spatial mutation batch cells must be dense");
    }
    const cell = batch.cells[cellIndex]!;
    validateCell(cell);

    const cellKey = `${cell.sourceLineageId}\u0000${cell.cellIndex}`;
    if (seenCellKeys.has(cellKey)) {
      throw new Error(
        "spatial mutation batch cannot repeat one source-lineage/cell outcome",
      );
    }
    seenCellKeys.add(cellKey);

    const existing = sourceRecords.get(cell.sourceLineageId);
    const parent = existing ?? registry.get(cell.sourceLineageId);
    if (parent === undefined) {
      throw new Error(
        `mutation source lineage is absent from registry: ${cell.sourceLineageId}`,
      );
    }
    if (parent.genotypeId !== cell.sourceGenotypeId) {
      throw new Error(
        `mutation source genotype does not match lineage registry: ${cell.sourceLineageId}`,
      );
    }
    if (
      createdAtHours < parent.createdAtHours ||
      (parent.extinctAtHours !== null &&
        createdAtHours > parent.extinctAtHours)
    ) {
      throw new Error(
        `mutation source lineage is not alive at child creation time: ${cell.sourceLineageId}`,
      );
    }
    sourceRecords.set(cell.sourceLineageId, parent);

    let cellMutantBirths = 0;
    const seenTargets = new Set<string>();
    for (
      let birthIndex = 0;
      birthIndex < cell.mutationBirths.length;
      birthIndex += 1
    ) {
      if (!Object.prototype.hasOwnProperty.call(cell.mutationBirths, birthIndex)) {
        throw new Error("mutation birth arrays must be dense");
      }
      const birth = cell.mutationBirths[birthIndex]!;
      validateBirth(birth);

      if (seenTargets.has(birth.targetGenotypeId)) {
        throw new Error(
          "mutation cell outcome contains duplicate target genotype identity",
        );
      }
      seenTargets.add(birth.targetGenotypeId);

      cellMutantBirths = safeAdd(
        "cell mutant birth total",
        cellMutantBirths,
        birth.count,
      );
    }
    if (cellMutantBirths > cell.divisionOpportunities) {
      throw new Error(
        "mutation births cannot exceed source-cell division opportunities",
      );
    }
    computedMutantBirths = safeAdd(
      "batch mutant birth total",
      computedMutantBirths,
      cellMutantBirths,
    );
  }

  if (computedMutantBirths !== batch.totalMutantBirths) {
    throw new Error(
      "reported mutant births do not match spatial mutation birth counts",
    );
  }

  return sourceRecords;
}

function validateCell(cell: SpatialMutationCellOutcome): void {
  canonicalIdentity("mutation source lineage id", cell.sourceLineageId);
  canonicalIdentity("mutation source genotype id", cell.sourceGenotypeId);
  nonNegativeSafeInteger("mutation source cell index", cell.cellIndex);
  nonNegativeSafeInteger(
    "source-cell division opportunities",
    cell.divisionOpportunities,
  );
  if (!Array.isArray(cell.mutationBirths)) {
    throw new Error("mutationBirths must be an array");
  }
}

function validateBirth(birth: SpatialMutationBirthCount): void {
  canonicalIdentity("mutation target genotype id", birth.targetGenotypeId);
  canonicalIdentity("mutation class", birth.mutationClass);
  canonicalIdentity("mutation citation key", birth.citationKey);
  nonNegativeSafeInteger("mutation birth count", birth.count);
}

function freezeChild(
  record: LineageRecord,
  source: SpatialMutationCellOutcome,
  birth: SpatialMutationBirthCount,
  createdAtHours: number,
  birthOrdinal: number,
): MaterializedMutationChild {
  return Object.freeze({
    lineageId: record.lineageId,
    parentLineageId: source.sourceLineageId,
    sourceGenotypeId: source.sourceGenotypeId,
    targetGenotypeId: birth.targetGenotypeId,
    originCellIndex: source.cellIndex,
    createdAtHours,
    mutationClass: birth.mutationClass,
    citationKey: birth.citationKey,
    birthOrdinal,
  });
}

function safeAdd(name: string, left: number, right: number): number {
  const value = left + right;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} exceeds the non-negative safe-integer domain`);
  }
  return value;
}

function positiveSafeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
}

function nonNegativeSafeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
}

function finiteNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be finite and non-negative`);
  }
}

function canonicalIdentity(name: string, value: string): void {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value
  ) {
    throw new Error(`${name} must be a canonical non-empty string`);
  }
}
