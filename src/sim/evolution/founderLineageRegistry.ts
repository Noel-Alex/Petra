import {
  LineageRegistry,
  type LineageRegistryCheckpoint,
} from "./lineage";

export interface FounderLineageDefinition {
  /**
   * Stable scenario/config definition identity. This is not the runtime lineage
   * ID allocated by LineageRegistry.
   */
  readonly founderId: string;
  readonly genotypeId: string;
}

export interface FounderLineageBinding {
  readonly founderId: string;
  readonly lineageId: string;
  readonly genotypeId: string;
}

export interface FounderLineageRegistryInitialization {
  readonly bindings: readonly FounderLineageBinding[];
  readonly checkpoint: LineageRegistryCheckpoint;
}

/**
 * Deterministically instantiate configured founders into runtime lineage
 * authority.
 *
 * Config/scenario founder IDs remain static definition identity. Runtime lineage
 * IDs come only from LineageRegistry creation order, so the same ordered founder
 * definitions always initialize L1, L2, ... and preserve one allocator for all
 * future mutation children.
 */
export function initializeFounderLineageRegistry(
  founders: readonly FounderLineageDefinition[],
): FounderLineageRegistryInitialization {
  validateFounderDefinitions(founders);

  const registry = new LineageRegistry();
  const bindings = founders.map((founder) => {
    const record = registry.create({
      parentLineageId: null,
      genotypeId: founder.genotypeId,
      createdAtHours: 0,
      originCellIndex: null,
      mutationClass: null,
    });
    return Object.freeze({
      founderId: founder.founderId,
      lineageId: record.lineageId,
      genotypeId: record.genotypeId,
    });
  });

  return Object.freeze({
    bindings: Object.freeze(bindings),
    checkpoint: registry.checkpoint(),
  });
}

function validateFounderDefinitions(
  founders: readonly FounderLineageDefinition[],
): void {
  if (!Array.isArray(founders) || founders.length === 0) {
    throw new Error("founder lineage definitions must be a non-empty array");
  }

  const founderIds = new Set<string>();
  for (let index = 0; index < founders.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(founders, index)) {
      throw new Error("founder lineage definitions must be dense");
    }
    const founder = founders[index]!;
    if (
      founder === null ||
      typeof founder !== "object" ||
      Array.isArray(founder)
    ) {
      throw new Error(`founder lineage definition ${index} must be an object`);
    }

    canonicalIdentity(
      `founder lineage definition id at index ${index}`,
      founder.founderId,
    );
    canonicalIdentity(
      `founder genotype id at index ${index}`,
      founder.genotypeId,
    );
    if (founderIds.has(founder.founderId)) {
      throw new Error(
        `founder lineage definition ids must be unique: ${founder.founderId}`,
      );
    }
    founderIds.add(founder.founderId);
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
