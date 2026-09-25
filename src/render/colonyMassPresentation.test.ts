import { describe, expect, it } from "vitest";

import {
  COLONY_MASS_PRESENTATION_VERSION,
  DEFAULT_COLONY_MASS_PRESENTATION_POLICY,
  projectColonyMassPresentation,
  type ColonyMassPresentationPolicy,
} from "./colonyMassPresentation";
import type { RenderLineage } from "./model";

function lineage(
  density: readonly number[],
): RenderLineage {
  return {
    id: "lineage-a",
    label: "Lineage A",
    appearanceToken: "lineage-coral",
    patternToken: "solid-ring",
    density: Float32Array.from(density),
  };
}

function policy(
  overrides: Partial<ColonyMassPresentationPolicy> = {},
): ColonyMassPresentationPolicy {
  return {
    ...DEFAULT_COLONY_MASS_PRESENTATION_POLICY,
    ...overrides,
  };
}

describe("colony mass presentation", () => {
  it("keeps empty source density exactly transparent and maps comparable density monotonically", () => {
    const projected = projectColonyMassPresentation({
      lineage: lineage([0, 1, 25, 100]),
      dishMask: new Uint8Array([1, 1, 1, 1]),
      gridWidth: 4,
      gridHeight: 1,
      sharedMaximum: 100,
      policy: policy({ accentThreshold: 1, minimumAccentCells: 1 }),
    });

    expect(projected.alpha[0]).toBe(0);
    expect(projected.alpha[1]).toBeCloseTo(0.1);
    expect(projected.alpha[2]).toBeCloseTo(0.5);
    expect(projected.alpha[3]).toBe(1);
    expect(projected.positiveCellCount).toBe(3);
    expect(projected.accentIslands).toHaveLength(1);
  });

  it("uses the caller-owned shared scale instead of self-normalizing a rare lineage", () => {
    const projected = projectColonyMassPresentation({
      lineage: lineage([1]),
      dishMask: new Uint8Array([1]),
      gridWidth: 1,
      gridHeight: 1,
      sharedMaximum: 100,
      policy: policy({ minimumAccentCells: 1 }),
    });

    expect(projected.alpha[0]).toBeCloseTo(0.1);
    expect(projected.accentIslands).toHaveLength(0);
  });

  it("merges adjacent and diagonal high-density support into one presentation island", () => {
    const projected = projectColonyMassPresentation({
      lineage: lineage([
        100, 0, 0, 0,
        100, 100, 0, 0,
        0, 0, 100, 0,
        0, 0, 0, 0,
      ]),
      dishMask: new Uint8Array(16).fill(1),
      gridWidth: 4,
      gridHeight: 4,
      sharedMaximum: 100,
      policy: policy({
        accentThreshold: 0.8,
        minimumAccentCells: 1,
        maximumAccentIslands: 8,
      }),
    });

    expect(projected.detectedAccentIslandCount).toBe(1);
    expect(projected.accentIslands).toHaveLength(1);
    expect(projected.accentIslands[0]).toMatchObject({
      firstCellIndex: 0,
      cellCount: 4,
      minColumn: 0,
      maxColumn: 2,
      minRow: 0,
      maxRow: 2,
    });
  });

  it("keeps separated support separate and bounds returned accent count deterministically", () => {
    const projected = projectColonyMassPresentation({
      lineage: lineage([
        100, 0, 80, 0, 60,
        100, 0, 80, 0, 60,
      ]),
      dishMask: new Uint8Array(10).fill(1),
      gridWidth: 5,
      gridHeight: 2,
      sharedMaximum: 100,
      policy: policy({
        accentThreshold: 0.7,
        minimumAccentCells: 2,
        maximumAccentIslands: 2,
      }),
    });

    expect(projected.detectedAccentIslandCount).toBe(3);
    expect(projected.accentIslands).toHaveLength(2);
    expect(projected.accentIslands[0]?.firstCellIndex).toBe(0);
    expect(projected.accentIslands[1]?.firstCellIndex).toBe(2);
  });

  it("keeps small high-density islands in the mass field without promoting them to blob accents", () => {
    const projected = projectColonyMassPresentation({
      lineage: lineage([
        100, 0, 0,
        0, 0, 0,
        0, 0, 0,
      ]),
      dishMask: new Uint8Array(9).fill(1),
      gridWidth: 3,
      gridHeight: 3,
      sharedMaximum: 100,
      policy: policy({
        accentThreshold: 0.8,
        minimumAccentCells: 2,
      }),
    });

    expect(projected.alpha[0]).toBe(1);
    expect(projected.detectedAccentIslandCount).toBe(0);
    expect(projected.accentIslands).toHaveLength(0);
  });

  it("ignores off-mask density for both fill and merged accent support", () => {
    const projected = projectColonyMassPresentation({
      lineage: lineage([100, 100, 100, 100]),
      dishMask: new Uint8Array([0, 1, 1, 0]),
      gridWidth: 2,
      gridHeight: 2,
      sharedMaximum: 100,
      policy: policy({
        accentThreshold: 0.8,
        minimumAccentCells: 1,
      }),
    });

    expect(Array.from(projected.alpha)).toEqual([0, 1, 1, 0]);
    expect(projected.detectedAccentIslandCount).toBe(1);
    expect(projected.accentIslands[0]?.cellCount).toBe(2);
  });

  it("returns weighted cell-center geometry deterministically", () => {
    const projected = projectColonyMassPresentation({
      lineage: lineage([
        100, 100,
        0, 0,
      ]),
      dishMask: new Uint8Array(4).fill(1),
      gridWidth: 2,
      gridHeight: 2,
      sharedMaximum: 100,
      policy: policy({
        accentThreshold: 0.8,
        minimumAccentCells: 1,
      }),
    });

    expect(projected.version).toBe(COLONY_MASS_PRESENTATION_VERSION);
    expect(projected.accentIslands[0]?.centroidX).toBeCloseTo(0.5);
    expect(projected.accentIslands[0]?.centroidY).toBeCloseTo(0.25);
  });

  it("fails closed when the supplied shared denominator understates in-mask density", () => {
    expect(() =>
      projectColonyMassPresentation({
        lineage: lineage([2]),
        dishMask: new Uint8Array([1]),
        gridWidth: 1,
        gridHeight: 1,
        sharedMaximum: 1,
      }),
    ).toThrow(/shared maximum must cover/);

    expect(() =>
      projectColonyMassPresentation({
        lineage: lineage([1]),
        dishMask: new Uint8Array([1]),
        gridWidth: 1,
        gridHeight: 1,
        sharedMaximum: 0,
      }),
    ).toThrow(/shared maximum must cover/);
  });

  it("fails closed on invalid dimensions, masks, denominators, or policies", () => {
    const base = {
      lineage: lineage([1]),
      dishMask: new Uint8Array([1]),
      gridWidth: 1,
      gridHeight: 1,
      sharedMaximum: 1,
    };

    expect(() =>
      projectColonyMassPresentation({ ...base, sharedMaximum: Number.NaN }),
    ).toThrow(/shared maximum/);

    expect(() =>
      projectColonyMassPresentation({
        ...base,
        dishMask: new Uint8Array([2]),
      }),
    ).toThrow(/mask values/);

    expect(() =>
      projectColonyMassPresentation({
        ...base,
        policy: policy({ accentThreshold: 0 }),
      }),
    ).toThrow(/accent threshold/);

    expect(() =>
      projectColonyMassPresentation({
        ...base,
        policy: {
          ...policy(),
          version: 2,
        } as unknown as ColonyMassPresentationPolicy,
      }),
    ).toThrow(/unsupported colony mass presentation policy version/);
  });
});
