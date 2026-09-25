import { gridCellCenter } from "./gridGeometry";

export interface ScalarContourPoint {
  readonly x: number;
  readonly y: number;
}

export interface ScalarContourSegment {
  readonly level: number;
  readonly from: ScalarContourPoint;
  readonly to: ScalarContourPoint;
}

/**
 * Deterministic marching-squares presentation over already-normalized scalar
 * values in [0, 1]. It owns geometry only; callers own the scientific source,
 * normalization denominator and semantic meaning of levels.
 */
export function extractNormalizedScalarContourSegments(args: {
  readonly normalizedValues: ArrayLike<number>;
  readonly mask: ArrayLike<number>;
  readonly width: number;
  readonly height: number;
  readonly levels: readonly number[];
}): readonly ScalarContourSegment[] {
  if (
    !Number.isSafeInteger(args.width) ||
    !Number.isSafeInteger(args.height) ||
    args.width < 1 ||
    args.height < 1
  ) {
    throw new RangeError("scalar contour dimensions must be positive safe integers");
  }

  const cells = args.width * args.height;
  if (!Number.isSafeInteger(cells)) {
    throw new RangeError("scalar contour cell count exceeds safe integer range");
  }
  if (
    args.normalizedValues.length !== cells ||
    args.mask.length !== cells
  ) {
    throw new RangeError("scalar contour values/mask must match grid dimensions");
  }

  const levels = validateContourLevels(args.levels);
  if (args.width < 2 || args.height < 2 || levels.length === 0) {
    return Object.freeze([]);
  }

  const values = new Float64Array(cells);
  for (let index = 0; index < cells; index += 1) {
    const value = args.normalizedValues[index];
    if (
      value === undefined ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > 1
    ) {
      throw new RangeError(
        "normalized scalar contour values must be finite values in [0, 1]",
      );
    }
    const mask = args.mask[index];
    if (mask !== 0 && mask !== 1) {
      throw new RangeError("scalar contour mask values must be 0 or 1");
    }
    values[index] = value;
  }

  const segments: ScalarContourSegment[] = [];
  for (const level of levels) {
    for (let row = 0; row < args.height - 1; row += 1) {
      for (let column = 0; column < args.width - 1; column += 1) {
        const tlIndex = row * args.width + column;
        const trIndex = tlIndex + 1;
        const blIndex = (row + 1) * args.width + column;
        const brIndex = blIndex + 1;

        if (
          args.mask[tlIndex] !== 1 ||
          args.mask[trIndex] !== 1 ||
          args.mask[brIndex] !== 1 ||
          args.mask[blIndex] !== 1
        ) {
          continue;
        }

        const tl = values[tlIndex]!;
        const tr = values[trIndex]!;
        const br = values[brIndex]!;
        const bl = values[blIndex]!;
        const code =
          (tl >= level ? 8 : 0) |
          (tr >= level ? 4 : 0) |
          (br >= level ? 2 : 0) |
          (bl >= level ? 1 : 0);

        if (code === 0 || code === 15) continue;

        const points = {
          top: interpolateEdge(
            gridCellCenter(tlIndex, args.width, args.height),
            gridCellCenter(trIndex, args.width, args.height),
            tl,
            tr,
            level,
          ),
          right: interpolateEdge(
            gridCellCenter(trIndex, args.width, args.height),
            gridCellCenter(brIndex, args.width, args.height),
            tr,
            br,
            level,
          ),
          bottom: interpolateEdge(
            gridCellCenter(blIndex, args.width, args.height),
            gridCellCenter(brIndex, args.width, args.height),
            bl,
            br,
            level,
          ),
          left: interpolateEdge(
            gridCellCenter(tlIndex, args.width, args.height),
            gridCellCenter(blIndex, args.width, args.height),
            tl,
            bl,
            level,
          ),
        };

        const pairs = segmentPairs(code, (tl + tr + br + bl) / 4 >= level);
        for (const [fromEdge, toEdge] of pairs) {
          segments.push(
            Object.freeze({
              level,
              from: Object.freeze(points[fromEdge]),
              to: Object.freeze(points[toEdge]),
            }),
          );
        }
      }
    }
  }

  return Object.freeze(segments);
}

export function validateContourLevels(
  levels: readonly number[],
): readonly number[] {
  let previous = -Infinity;
  const result: number[] = [];

  for (const level of levels) {
    if (!Number.isFinite(level) || level <= 0 || level >= 1) {
      throw new RangeError(
        "contour levels must be finite values strictly in (0, 1)",
      );
    }
    if (level <= previous) {
      throw new RangeError("contour levels must be strictly increasing");
    }
    previous = level;
    result.push(level);
  }

  return Object.freeze(result);
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
  from: ScalarContourPoint,
  to: ScalarContourPoint,
  fromValue: number,
  toValue: number,
  level: number,
): ScalarContourPoint {
  const delta = toValue - fromValue;
  const t =
    delta === 0
      ? 0.5
      : clamp((level - fromValue) / delta, 0, 1);

  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
