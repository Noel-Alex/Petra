import type { OverlayKind, RenderField } from "./model";
import { gridCellCenter } from "./gridGeometry";

export const FIELD_CONTOUR_PRESENTATION_VERSION = 1 as const;
export const DEFAULT_FIELD_CONTOUR_LEVELS = Object.freeze([
  0.25,
  0.5,
  0.75,
] as const);

export interface FieldContourPoint {
  readonly x: number;
  readonly y: number;
}

export interface FieldContourSegment {
  readonly level: number;
  readonly from: FieldContourPoint;
  readonly to: FieldContourPoint;
}

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
  if (args.gridWidth < 2 || args.gridHeight < 2) return Object.freeze([]);
  if (
    !Number.isFinite(args.field.minimum) ||
    !Number.isFinite(args.field.maximum) ||
    args.field.maximum < args.field.minimum
  ) {
    throw new RangeError("contour field bounds must be finite and ordered");
  }

  const range = args.field.maximum - args.field.minimum;
  if (range <= 0) return Object.freeze([]);

  const levels = validateLevels(args.levels ?? DEFAULT_FIELD_CONTOUR_LEVELS);
  const normalized = new Float64Array(cells);
  for (let index = 0; index < cells; index += 1) {
    const value = args.field.values[index];
    if (value === undefined || !Number.isFinite(value)) {
      throw new RangeError("contour field values must be finite");
    }
    const mask = args.dishMask[index];
    if (mask !== 0 && mask !== 1) {
      throw new RangeError("contour dish mask values must be 0 or 1");
    }
    normalized[index] = clamp((value - args.field.minimum) / range, 0, 1);
  }

  const segments: FieldContourSegment[] = [];
  for (const level of levels) {
    for (let row = 0; row < args.gridHeight - 1; row += 1) {
      for (let column = 0; column < args.gridWidth - 1; column += 1) {
        const tlIndex = row * args.gridWidth + column;
        const trIndex = tlIndex + 1;
        const blIndex = (row + 1) * args.gridWidth + column;
        const brIndex = blIndex + 1;

        if (
          args.dishMask[tlIndex] !== 1 ||
          args.dishMask[trIndex] !== 1 ||
          args.dishMask[brIndex] !== 1 ||
          args.dishMask[blIndex] !== 1
        ) {
          continue;
        }

        const tl = normalized[tlIndex]!;
        const tr = normalized[trIndex]!;
        const br = normalized[brIndex]!;
        const bl = normalized[blIndex]!;
        const code =
          (tl >= level ? 8 : 0) |
          (tr >= level ? 4 : 0) |
          (br >= level ? 2 : 0) |
          (bl >= level ? 1 : 0);
        if (code === 0 || code === 15) continue;

        const points = {
          top: interpolateEdge(
            gridCellCenter(tlIndex, args.gridWidth, args.gridHeight),
            gridCellCenter(trIndex, args.gridWidth, args.gridHeight),
            tl,
            tr,
            level,
          ),
          right: interpolateEdge(
            gridCellCenter(trIndex, args.gridWidth, args.gridHeight),
            gridCellCenter(brIndex, args.gridWidth, args.gridHeight),
            tr,
            br,
            level,
          ),
          bottom: interpolateEdge(
            gridCellCenter(blIndex, args.gridWidth, args.gridHeight),
            gridCellCenter(brIndex, args.gridWidth, args.gridHeight),
            bl,
            br,
            level,
          ),
          left: interpolateEdge(
            gridCellCenter(tlIndex, args.gridWidth, args.gridHeight),
            gridCellCenter(blIndex, args.gridWidth, args.gridHeight),
            tl,
            bl,
            level,
          ),
        };

        const pairs = segmentPairs(code, (tl + tr + br + bl) / 4 >= level);
        for (const [fromEdge, toEdge] of pairs) {
          segments.push(Object.freeze({
            level,
            from: Object.freeze(points[fromEdge]),
            to: Object.freeze(points[toEdge]),
          }));
        }
      }
    }
  }

  return Object.freeze(segments);
}

type EdgeName = "top" | "right" | "bottom" | "left";

function segmentPairs(
  code: number,
  centerHigh: boolean,
): readonly (readonly [EdgeName, EdgeName])[] {
  switch (code) {
    case 1:
    case 14:
      return [["bottom", "left"]];
    case 2:
    case 13:
      return [["right", "bottom"]];
    case 3:
    case 12:
      return [["right", "left"]];
    case 4:
    case 11:
      return [["top", "right"]];
    case 6:
    case 9:
      return [["top", "bottom"]];
    case 7:
    case 8:
      return [["top", "left"]];
    case 5:
      return centerHigh
        ? [["top", "left"], ["right", "bottom"]]
        : [["top", "right"], ["bottom", "left"]];
    case 10:
      return centerHigh
        ? [["top", "right"], ["bottom", "left"]]
        : [["top", "left"], ["right", "bottom"]];
    default:
      throw new RangeError(`unsupported marching-squares code: ${code}`);
  }
}

function interpolateEdge(
  from: FieldContourPoint,
  to: FieldContourPoint,
  fromValue: number,
  toValue: number,
  level: number,
): FieldContourPoint {
  const delta = toValue - fromValue;
  const t = delta === 0 ? 0.5 : clamp((level - fromValue) / delta, 0, 1);
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
  };
}

function validateLevels(levels: readonly number[]): readonly number[] {
  if (levels.length === 0) return Object.freeze([]);
  let previous = -Infinity;
  const result: number[] = [];
  for (const level of levels) {
    if (!Number.isFinite(level) || level <= 0 || level >= 1) {
      throw new RangeError("contour levels must be finite values strictly in (0, 1)");
    }
    if (level <= previous) {
      throw new RangeError("contour levels must be strictly increasing");
    }
    previous = level;
    result.push(level);
  }
  return Object.freeze(result);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
