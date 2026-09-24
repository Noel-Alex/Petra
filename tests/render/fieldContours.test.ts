import { describe, expect, it } from "vitest";

import {
  DEFAULT_FIELD_CONTOUR_LEVELS,
  extractFieldContourSegments,
  supportsFieldContours,
} from "../../src/render/fieldContours";
import type { RenderField } from "../../src/render/model";

function field(
  values: readonly number[],
  width: number,
  height: number,
  kind: RenderField["kind"] = "nutrient",
  minimum = 0,
  maximum = 1,
): RenderField {
  return {
    id: "field",
    kind,
    label: "Field",
    unit: "model-unit",
    width,
    height,
    values: Float32Array.from(values),
    minimum,
    maximum,
  };
}

describe("field contour presentation", () => {
  it("extracts stable cell-center contour segments for a simple gradient", () => {
    const args = {
      field: field([0, 1, 0, 1], 2, 2),
      dishMask: Uint8Array.from([1, 1, 1, 1]),
      gridWidth: 2,
      gridHeight: 2,
      levels: [0.5],
    } as const;

    const first = extractFieldContourSegments(args);
    const second = extractFieldContourSegments(args);

    expect(second).toEqual(first);
    expect(first).toEqual([
      {
        level: 0.5,
        from: { x: 0.5, y: 0.25 },
        to: { x: 0.5, y: 0.75 },
      },
    ]);
  });

  it("orders levels then row-major marching cells deterministically", () => {
    const segments = extractFieldContourSegments({
      field: field(
        [
          0, 0, 0,
          0, 1, 0,
          0, 0, 0,
        ],
        3,
        3,
      ),
      dishMask: new Uint8Array(9).fill(1),
      gridWidth: 3,
      gridHeight: 3,
      levels: [0.25, 0.75],
    });

    expect(segments).toHaveLength(8);
    expect(segments.slice(0, 4).every((segment) => segment.level === 0.25)).toBe(
      true,
    );
    expect(segments.slice(4).every((segment) => segment.level === 0.75)).toBe(
      true,
    );
  });

  it("does not extrapolate contours through masked cells", () => {
    const segments = extractFieldContourSegments({
      field: field([0, 1, 0, 1], 2, 2),
      dishMask: Uint8Array.from([1, 1, 1, 0]),
      gridWidth: 2,
      gridHeight: 2,
      levels: [0.5],
    });

    expect(segments).toEqual([]);
  });

  it("returns no contours for constant/degenerate fields", () => {
    const segments = extractFieldContourSegments({
      field: field([4, 4, 4, 4], 2, 2, "antibiotic", 4, 4),
      dishMask: new Uint8Array(4).fill(1),
      gridWidth: 2,
      gridHeight: 2,
    });

    expect(segments).toEqual([]);
  });

  it("restricts contour semantics to nutrient and antibiotic fields", () => {
    expect(supportsFieldContours("nutrient")).toBe(true);
    expect(supportsFieldContours("antibiotic")).toBe(true);
    expect(supportsFieldContours("net-growth")).toBe(false);
    expect(supportsFieldContours("uncertainty")).toBe(false);

    expect(
      extractFieldContourSegments({
        field: field([0, 1, 0, 1], 2, 2, "net-growth", -1, 1),
        dishMask: new Uint8Array(4).fill(1),
        gridWidth: 2,
        gridHeight: 2,
      }),
    ).toEqual([]);
  });

  it("uses a small bounded normalized presentation vocabulary by default", () => {
    expect(DEFAULT_FIELD_CONTOUR_LEVELS).toEqual([0.25, 0.5, 0.75]);
    expect(() =>
      extractFieldContourSegments({
        field: field([0, 1, 0, 1], 2, 2),
        dishMask: new Uint8Array(4).fill(1),
        gridWidth: 2,
        gridHeight: 2,
        levels: [0.5, 0.5],
      }),
    ).toThrow(/strictly increasing/);
  });
});
