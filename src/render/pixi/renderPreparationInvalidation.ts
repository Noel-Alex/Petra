/**
 * Presentation-only revision policy for expensive dish preparation work.
 *
 * These counters are renderer scheduling metadata. They are deliberately
 * independent of simulation/replay identity and object identity: visual
 * interpolation may reuse mutable/preallocated presentation buffers while
 * still advancing the scientific-frame revision on every changed frame.
 */
export const DISH_RENDER_PREPARATION_REVISION_VERSION = 1 as const;

export interface DishRenderPreparationRevision {
  readonly version: typeof DISH_RENDER_PREPARATION_REVISION_VERSION;
  readonly scientificFrame: number;
  readonly overlaySelection: number;
  readonly organismPresentation: number;
}

export type DishRenderPreparationChange =
  | "scientific-frame"
  | "overlay-selection"
  | "organism-presentation";

export interface DishRenderPreparationInvalidation {
  /** Full-grid selected-field raster + texture upload. */
  readonly fieldRaster: boolean;
  /** Full-grid aggregate lineage-density raster + texture upload. */
  readonly densityRaster: boolean;
  /** Camera-independent scalar contour extraction for the selected field. */
  readonly fieldContours: boolean;
  /** Camera-independent lineage-density contour extraction. */
  readonly lineageContours: boolean;
  /**
   * Camera-independent representative-glyph candidate preparation.
   * Final viewport filtering/layout may still react to camera changes.
   */
  readonly representativeGlyphCandidates: boolean;
  /** Glyph shape/material presentation, including organism morphology. */
  readonly representativeGlyphAppearance: boolean;
}

export function initialDishRenderPreparationRevision(): DishRenderPreparationRevision {
  return Object.freeze({
    version: DISH_RENDER_PREPARATION_REVISION_VERSION,
    scientificFrame: 0,
    overlaySelection: 0,
    organismPresentation: 0,
  });
}

export function advanceDishRenderPreparationRevision(
  revision: DishRenderPreparationRevision,
  change: DishRenderPreparationChange,
): DishRenderPreparationRevision {
  assertDishRenderPreparationRevision(revision);

  const next = {
    version: DISH_RENDER_PREPARATION_REVISION_VERSION,
    scientificFrame: revision.scientificFrame,
    overlaySelection: revision.overlaySelection,
    organismPresentation: revision.organismPresentation,
  };

  if (change === "scientific-frame") {
    next.scientificFrame = incrementRevision(
      revision.scientificFrame,
      "scientificFrame",
    );
  } else if (change === "overlay-selection") {
    next.overlaySelection = incrementRevision(
      revision.overlaySelection,
      "overlaySelection",
    );
  } else {
    next.organismPresentation = incrementRevision(
      revision.organismPresentation,
      "organismPresentation",
    );
  }

  return Object.freeze(next);
}

export function resolveDishRenderPreparationInvalidation(
  previous: DishRenderPreparationRevision,
  current: DishRenderPreparationRevision,
): DishRenderPreparationInvalidation {
  assertDishRenderPreparationRevision(previous);
  assertDishRenderPreparationRevision(current);

  const scientificFrame =
    previous.scientificFrame !== current.scientificFrame;
  const overlaySelection =
    previous.overlaySelection !== current.overlaySelection;
  const organismPresentation =
    previous.organismPresentation !== current.organismPresentation;

  return Object.freeze({
    fieldRaster: scientificFrame || overlaySelection,
    densityRaster: scientificFrame,
    fieldContours: scientificFrame || overlaySelection,
    lineageContours: scientificFrame,
    representativeGlyphCandidates: scientificFrame,
    representativeGlyphAppearance:
      scientificFrame || organismPresentation,
  });
}

export function assertDishRenderPreparationRevision(
  value: DishRenderPreparationRevision,
): void {
  if (
    value.version !== DISH_RENDER_PREPARATION_REVISION_VERSION
  ) {
    throw new RangeError(
      "unsupported dish render preparation revision version",
    );
  }
  requireRevision(value.scientificFrame, "scientificFrame");
  requireRevision(value.overlaySelection, "overlaySelection");
  requireRevision(value.organismPresentation, "organismPresentation");
}

function requireRevision(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(
      `dish render preparation ${name} revision must be a non-negative safe integer`,
    );
  }
}

function incrementRevision(value: number, name: string): number {
  if (value >= Number.MAX_SAFE_INTEGER) {
    throw new RangeError(
      `dish render preparation ${name} revision exhausted`,
    );
  }
  return value + 1;
}
