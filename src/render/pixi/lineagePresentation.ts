import type { OrganismPresentationIdentity } from "../organismPresentationIdentity";
import type { RenderLineage } from "../model";

export interface IndexedLineageGlyphPresentation {
  readonly lineage: RenderLineage;
  readonly presentation: OrganismPresentationIdentity | null;
}

export interface LineageGlyphPresentationIndex {
  /**
   * True once any lineage explicitly participates in the per-lineage
   * presentation contract. In this mode omitted/null records stay neutral and
   * never inherit the legacy run-wide presentation companion.
   */
  readonly perLineageMode: boolean;
  /** Whether at least one lineage has a non-null presentation record. */
  readonly hasAnyPresentation: boolean;
  /** Current dish-overview morphology-specific glyph support is rod-only. */
  readonly hasAnySupportedDishGlyphPresentation: boolean;
  readonly byLineageId: ReadonlyMap<string, IndexedLineageGlyphPresentation>;
}

/**
 * Build one renderer-local lookup for representative glyph presentation.
 *
 * This is presentation-only. It never infers morphology from lineage identity,
 * density, color, pattern, or array order. The legacy companion is accepted
 * only when every lineage omits the newer per-lineage carrier.
 */
export function indexLineageGlyphPresentations(
  lineages: readonly RenderLineage[],
  legacyPresentation: OrganismPresentationIdentity | null,
): LineageGlyphPresentationIndex {
  const perLineageMode = lineages.some(
    (lineage) => lineage.organismPresentation !== undefined,
  );
  const byLineageId = new Map<string, IndexedLineageGlyphPresentation>();
  let hasAnyPresentation = false;
  let hasAnySupportedDishGlyphPresentation = false;

  for (const lineage of lineages) {
    const presentation = perLineageMode
      ? lineage.organismPresentation ?? null
      : legacyPresentation;
    if (presentation !== null) hasAnyPresentation = true;
    if (presentation?.morphology === "rod") {
      hasAnySupportedDishGlyphPresentation = true;
    }
    byLineageId.set(lineage.id, { lineage, presentation });
  }

  return {
    perLineageMode,
    hasAnyPresentation,
    hasAnySupportedDishGlyphPresentation,
    byLineageId,
  };
}

export function lineageGlyphPresentationContractEqual(
  left: readonly RenderLineage[],
  right: readonly RenderLineage[],
): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    const leftLineage = left[index]!;
    const rightLineage = right[index]!;
    if (leftLineage.id !== rightLineage.id) return false;
    if (
      (leftLineage.organismPresentation === undefined) !==
      (rightLineage.organismPresentation === undefined)
    ) {
      return false;
    }
    if (
      !organismPresentationIdentityEqual(
        leftLineage.organismPresentation ?? null,
        rightLineage.organismPresentation ?? null,
      )
    ) {
      return false;
    }
  }
  return true;
}

export function organismPresentationIdentityEqual(
  left: OrganismPresentationIdentity | null,
  right: OrganismPresentationIdentity | null,
): boolean {
  if (left === right) return true;
  if (left === null || right === null) return false;
  if (
    left.kind !== right.kind ||
    left.schemaVersion !== right.schemaVersion ||
    left.id !== right.id ||
    left.scientificName !== right.scientificName ||
    left.background !== right.background ||
    left.organismKind !== right.organismKind ||
    left.morphology !== right.morphology ||
    left.provenance.classification !== right.provenance.classification ||
    left.provenance.context !== right.provenance.context ||
    left.provenance.transferNote !== right.provenance.transferNote ||
    left.provenance.limitation !== right.provenance.limitation ||
    left.provenance.sources.length !== right.provenance.sources.length
  ) {
    return false;
  }

  return left.provenance.sources.every((source, index) => {
    const other = right.provenance.sources[index];
    return (
      other !== undefined &&
      source.key === other.key &&
      source.doi === other.doi &&
      source.context === other.context
    );
  });
}
