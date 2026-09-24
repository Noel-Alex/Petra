import { describe, expect, it } from "vitest";
import { sampleRepresentativeGlyphs } from "./lod";
import type { DishRenderSnapshot } from "./model";
import { gridCellCenter } from "./gridGeometry";

describe("render grid cell-center geometry", () => {
  it("maps square-grid corners and interior to cell centers", () => {
    expect(gridCellCenter(0, 3, 3)).toMatchObject({
      column: 0,
      row: 0,
      x: 1 / 6,
      y: 1 / 6,
    });
    expect(gridCellCenter(4, 3, 3)).toMatchObject({
      column: 1,
      row: 1,
      x: 0.5,
      y: 0.5,
    });
    expect(gridCellCenter(8, 3, 3)).toMatchObject({
      column: 2,
      row: 2,
      x: 5 / 6,
      y: 5 / 6,
    });
  });

  it("maps non-square grids without using endpoint denominators", () => {
    expect(gridCellCenter(0, 4, 2)).toMatchObject({
      column: 0,
      row: 0,
      x: 0.125,
      y: 0.25,
    });
    expect(gridCellCenter(7, 4, 2)).toMatchObject({
      column: 3,
      row: 1,
      x: 0.875,
      y: 0.75,
    });
  });

  it("keeps large-grid edge centers inside normalized dish space", () => {
    const left = gridCellCenter(0, 48, 48);
    const right = gridCellCenter(47, 48, 48);
    expect(left.x).toBeCloseTo(0.5 / 48, 12);
    expect(right.x).toBeCloseTo(47.5 / 48, 12);
    expect(left.x).toBeGreaterThan(0);
    expect(right.x).toBeLessThan(1);
  });

  it("rejects invalid dimensions and indices", () => {
    expect(() => gridCellCenter(0, 0, 3)).toThrow(/gridWidth/);
    expect(() => gridCellCenter(0, 3, 1.5)).toThrow(/gridHeight/);
    expect(() => gridCellCenter(-1, 3, 3)).toThrow(/cellIndex/);
    expect(() => gridCellCenter(9, 3, 3)).toThrow(/cellIndex/);
    expect(() => gridCellCenter(1.2, 3, 3)).toThrow(/cellIndex/);
  });

  it("keeps representative LOD selection aligned with aggregate cell centers", () => {
    const density = new Float32Array(25);
    density[8] = 1;
    const snapshot: DishRenderSnapshot = {
      snapshotId: "grid-center-regression",
      samplingIdentity: "grid-center-regression",
      simulationTimeHours: 0,
      gridWidth: 5,
      gridHeight: 5,
      dishMask: new Uint8Array(25).fill(1),
      biomass: density.slice(),
      fields: [],
      lineages: [
        {
          id: "lineage-a",
          label: "Lineage A",
          appearanceToken: "lineage-cyan",
          patternToken: "solid-ring",
          density,
        },
      ],
      events: [],
    };

    const glyphs = sampleRepresentativeGlyphs(
      snapshot,
      { centerX: 0.5, centerY: 0.5, zoom: 2.25 },
      "colony",
      { maxGlyphs: 10, minimumDensity: 0.1 },
    );

    expect(glyphs).toHaveLength(1);
    expect(glyphs[0]).toMatchObject({
      cellIndex: 8,
      x: 0.7,
      y: 0.3,
    });
  });
});
