import { describe, expect, it } from "vitest";

import {
  DEFAULT_LINEAGE_DENSITY_CONTOUR_LEVELS,
  extractLineageDensityContourSegments,
} from "../../src/render/lineageDensityContours";
import type { RenderLineage } from "../../src/render/model";

function lineage(
  id: string,
  density: readonly number[],
): RenderLineage {
  return {
    id,
    label: id,
    appearanceToken: "teal",
    patternToken: "solid-ring",
    density: Float32Array.from(density),
  };
}

describe("lineage density colony isocontours", () => {
  it("extracts deterministic contours from the shared comparable density scale", () => {
    const args = {
      lineage: lineage("A", [0, 1, 0, 1]),
      dishMask: Uint8Array.from([1, 1, 1, 1]),
      gridWidth: 2,
      gridHeight: 2,
      sharedMaximum: 1,
      levels: [Math.SQRT1_2],
    } as const;

    const first = extractLineageDensityContourSegments(args);
    const second = extractLineageDensityContourSegments(args);

    expect(second).toEqual(first);
    expect(first).toEqual([
      {
        level: Math.SQRT1_2,
        from: { x: 0.5, y: 0.25 },
        to: { x: 0.5, y: 0.75 },
      },
    ]);
  });

  it("keeps equal source density comparable across different lineages", () => {
    const mask = new Uint8Array(4).fill(1);
    const sharedMaximum = 4;
    const first = extractLineageDensityContourSegments({
      lineage: lineage("dominant", [0, 4, 0, 4]),
      dishMask: mask,
      gridWidth: 2,
      gridHeight: 2,
      sharedMaximum,
      levels: [0.5],
    });
    const second = extractLineageDensityContourSegments({
      lineage: lineage("rare", [0, 1, 0, 1]),
      dishMask: mask,
      gridWidth: 2,
      gridHeight: 2,
      sharedMaximum,
      levels: [0.5],
    });

    expect(first).toEqual([
      {
        level: 0.5,
        from: { x: 0.375, y: 0.25 },
        to: { x: 0.375, y: 0.75 },
      },
    ]);
    expect(second).toEqual([
      {
        level: 0.5,
        from: { x: 0.75, y: 0.25 },
        to: { x: 0.75, y: 0.75 },
      },
    ]);
  });

  it("does not self-normalize a rare lineage to its own local maximum", () => {
    const segments = extractLineageDensityContourSegments({
      lineage: lineage("rare", [0, 0.04, 0, 0.04]),
      dishMask: new Uint8Array(4).fill(1),
      gridWidth: 2,
      gridHeight: 2,
      sharedMaximum: 4,
      levels: [0.2],
    });

    expect(segments).toEqual([]);
  });

  it("does not contour through masked/off-domain cells", () => {
    expect(
      extractLineageDensityContourSegments({
        lineage: lineage("A", [0, 1, 0, 1]),
        dishMask: Uint8Array.from([1, 1, 1, 0]),
        gridWidth: 2,
        gridHeight: 2,
        sharedMaximum: 1,
        levels: [0.5],
      }),
    ).toEqual([]);
  });

  it("keeps a bounded presentation-only contour vocabulary", () => {
    expect(DEFAULT_LINEAGE_DENSITY_CONTOUR_LEVELS).toEqual([
      0.2,
      0.45,
      0.72,
    ]);
  });
});
