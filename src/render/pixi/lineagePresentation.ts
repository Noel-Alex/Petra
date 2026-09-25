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
  /** Whether at least one lineage has a non-null representative morphology. */
  readonly hasAnyPresentation: boolean;
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

  for (const lineage of lineages) {
    const presentation = perLineageMode
      ? lineage.organismPresentation ?? null
      : legacyPresentation;
    if (presentation !== null) hasAnyPresentation = true;
    byLineageId.set(lineage.id, { lineage, presentation });
  }

  return {
    perLineageMode,
    hasAnyPresentation,
    byLineageId,
  };
}
