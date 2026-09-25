import type { OverlayKind, RenderField } from "./model";
import {
  extractNormalizedScalarContourSegments,
  type ScalarContourPoint,
  type ScalarContourSegment,
} from "./scalarContours";

export const FIELD_CONTOUR_PRESENTATION_VERSION = 1 as const;
export const DEFAULT_FIELD_CONTOUR_LEVELS = Object.freeze([
  0.25,
  0.5,
  0.75,
] as const);

export type FieldContourPoint = ScalarContourPoint;
export type FieldContourSegment = ScalarContourSegment;

export function supportsFieldContours(kind: OverlayKind): boolean {
  return kind === "nutrient" || kind === "antibiotic";
}

/**
 * Presentation-only contours for sequential scalar fields.
 *
 * Levels are normalized fractions of the caller-supplied field range, not
 * scientific thresholds. Geometry is derived from the same cell-center
 * convention used by heatmap/density/glyph presentation. Any marching quad
 * touching off-mask state is excluded instead of extrapolating through it.
 */
export function extractFieldContourSegments(args: {
  readonly field: RenderField;
  readonly dishMask: Uint8Array;
  readonly gridWidth: number;
  readonly gridHeight: number;
  readonly levels?: readonly number[];
}): readonly FieldContourSegment[] {
  if (!supportsFieldContours(args.field.kind)) return Object.freeze([]);
  if (
    args.field.width !== args.gridWidth ||
    args.field.height !== args.gridHeight
  ) {
    throw new RangeError("contour field dimensions must match the render grid");
  }
  const cells = args.gridWidth * args.gridHeight;
  if (
    args.field.values.length !== cells ||
    args.dishMask.length !== cells
  ) {
    throw new RangeError("contour field/mask lengths must match the render grid");
  }
  if (
    !Number.isFinite(args.field.minimum) ||
    !Number.isFinite(args.field.maximum) ||
    args.field.maximum < args.field.minimum
  ) {
    throw new RangeError("contour field bounds must be finite and ordered");
  }

  const range = args.field.maximum - args.field.minimum;
  if (range <= 0) return Object.freeze([]);

  const normalized = new Float64Array(cells);
  for (let index = 0; index < cells; index += 1) {
    const value = args.field.values[index];
    if (value === undefined || !Number.isFinite(value)) {
      throw new RangeError("contour field values must be finite");
    }
    normalized[index] = clamp(
      (value - args.field.minimum) / range,
      0,
      1,
    );
  }

  return extractNormalizedScalarContourSegments({
    normalizedValues: normalized,
    mask: args.dishMask,
    width: args.gridWidth,
    height: args.gridHeight,
    levels: args.levels ?? DEFAULT_FIELD_CONTOUR_LEVELS,
  });
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
