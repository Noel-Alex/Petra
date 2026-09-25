import {
  projectComparableLineageDensity,
} from "./lineageDensityPresentation";
import type { RenderLineage } from "./model";
import {
  extractNormalizedScalarContourSegments,
  type ScalarContourSegment,
} from "./scalarContours";

export const LINEAGE_DENSITY_CONTOUR_PRESENTATION_VERSION = 1 as const;

/**
 * Bounded visual isocontours over Petra's existing comparable lineage-density
 * presentation. These values are visual intensity levels only, not biomass,
 * CFU, colony-front, or phenotype thresholds.
 */
export const DEFAULT_LINEAGE_DENSITY_CONTOUR_LEVELS = Object.freeze([
  0.2,
  0.45,
  0.72,
] as const);

export interface LineageDensityContourResult {
  readonly version: typeof LINEAGE_DENSITY_CONTOUR_PRESENTATION_VERSION;
  readonly segments: readonly ScalarContourSegment[];
}

export function extractLineageDensityContourSegments(args: {
  readonly lineage: RenderLineage;
  readonly dishMask: Uint8Array;
  readonly gridWidth: number;
  readonly gridHeight: number;
  readonly sharedMaximum: number;
  readonly levels?: readonly number[];
}): readonly ScalarContourSegment[] {
  const cells = args.gridWidth * args.gridHeight;
  if (
    args.lineage.density.length !== cells ||
    args.dishMask.length !== cells
  ) {
    throw new RangeError(
      "lineage contour density/mask lengths must match render grid",
    );
  }

  if (!Number.isFinite(args.sharedMaximum) || args.sharedMaximum < 0) {
    throw new RangeError(
      "lineage contour shared maximum must be finite and non-negative",
    );
  }
  if (args.sharedMaximum === 0) return Object.freeze([]);

  const normalized = new Float64Array(cells);
  for (let index = 0; index < cells; index += 1) {
    const density = args.lineage.density[index];
    if (density === undefined) {
      throw new RangeError("lineage contour density must be dense");
    }
    normalized[index] = projectComparableLineageDensity(
      density,
      args.sharedMaximum,
    ).normalized;
  }

  return extractNormalizedScalarContourSegments({
    normalizedValues: normalized,
    mask: args.dishMask,
    width: args.gridWidth,
    height: args.gridHeight,
    levels: args.levels ?? DEFAULT_LINEAGE_DENSITY_CONTOUR_LEVELS,
  });
}
