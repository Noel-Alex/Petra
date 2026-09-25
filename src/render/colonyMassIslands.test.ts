import { describe, expect, it } from "vitest";

import {
  projectColonyMassAlphaField,
  type ColonyMassAlphaField,
} from "./colonyMassPresentation";
import {
  COLONY_MASS_ISLAND_POLICY_VERSION,
  DEFAULT_COLONY_MASS_ISLAND_POLICY,
  extractColonyMassAccentIslands,
  type ColonyMassIslandPolicy,
} from "./colonyMassIslands";

function field(
  density: readonly number[],
  width: number,
  height: number,
): ColonyMassAlphaField {
  return projectColonyMassAlphaField({
    width,
    height,
    dishMask: new Uint8Array(width * height).fill(1),
    density,
    sharedDensityMaximum: 1,
  });
}

function policy(
  overrides: Partial<ColonyMassIslandPolicy> = {},
): ColonyMassIslandPolicy {
  return {
    ...DEFAULT_COLONY_MASS_ISLAND_POLICY,
    ...overrides,
  };
}

describe("bounded colony mass accent islands", () => {
  it("merges adjacent and diagonal high-alpha support into one island", () => {
    const projection = extractColonyMassAccentIslands(
      field(
        [
          1, 0, 0, 0,
          1, 1, 0, 0,
          0, 0, 1, 0,
          0, 0, 0, 0,
        ],
        4,
        4,
      ),
      policy({ minimumCells: 1 }),
    );

    expect(projection.version).toBe(COLONY_MASS_ISLAND_POLICY_VERSION);
    expect(projection.eligibleIslandCount).toBe(1);
    expect(projection.islands).toHaveLength(1);
    expect(projection.islands[0]).toMatchObject({
      firstCellIndex: 0,
      cellCount: 4,
      minColumn: 0,
      maxColumn: 2,
      minRow: 0,
      maxRow: 2,
    });
  });

  it("never bridges a real zero-alpha gap", () => {
    const projection = extractColonyMassAccentIslands(
      field([1, 1, 0, 1, 1], 5, 1),
      policy({ minimumCells: 1 }),
    );

    expect(projection.eligibleIslandCount).toBe(2);
    expect(projection.islands.map((island) => island.firstCellIndex)).toEqual([
      0,
      3,
    ]);
  });

  it("keeps small support in the continuous raster without promoting a blob accent", () => {
    const alphaField = field(
      [
        1, 0, 0,
        0, 0, 0,
        0, 0, 0,
      ],
      3,
      3,
    );
    const projection = extractColonyMassAccentIslands(
      alphaField,
      policy({ minimumCells: 2 }),
    );

    expect(alphaField.alpha[0]).toBe(1);
    expect(projection.eligibleIslandCount).toBe(0);
    expect(projection.islands).toHaveLength(0);
  });

  it("bounds accent output while preserving deterministic mass ranking", () => {
    const projection = extractColonyMassAccentIslands(
      field(
        [
          1, 0, 0.9, 0, 0.8,
          1, 0, 0.9, 0, 0.8,
        ],
        5,
        2,
      ),
      policy({
        minimumAlpha: 0.5,
        minimumCells: 2,
        maximumIslands: 2,
      }),
    );

    expect(projection.eligibleIslandCount).toBe(3);
    expect(projection.islands).toHaveLength(2);
    expect(projection.islands[0]?.firstCellIndex).toBe(0);
    expect(projection.islands[1]?.firstCellIndex).toBe(2);
  });

  it("reports deterministic weighted cell-center geometry", () => {
    const projection = extractColonyMassAccentIslands(
      field(
        [
          1, 1,
          0, 0,
        ],
        2,
        2,
      ),
      policy({ minimumCells: 1 }),
    );

    expect(projection.islands[0]?.centroidX).toBeCloseTo(0.5);
    expect(projection.islands[0]?.centroidY).toBeCloseTo(0.25);
    expect(projection.islands[0]?.integratedAlpha).toBeCloseTo(2);
    expect(projection.islands[0]?.peakAlpha).toBe(1);
  });

  it("fails closed on malformed alpha fields or presentation policies", () => {
    const valid = field([1], 1, 1);
    const invalidAlpha = {
      ...valid,
      alpha: new Float32Array([1.1]),
    } as ColonyMassAlphaField;

    expect(() => extractColonyMassAccentIslands(invalidAlpha)).toThrow(
      /alpha must be finite and in \[0, 1\]/,
    );

    expect(() =>
      extractColonyMassAccentIslands(
        valid,
        policy({ minimumAlpha: 0 }),
      ),
    ).toThrow(/minimumAlpha/);

    expect(() =>
      extractColonyMassAccentIslands(
        valid,
        {
          ...policy(),
          version: 2,
        } as unknown as ColonyMassIslandPolicy,
      ),
    ).toThrow(/unsupported colony mass island policy version/);
  });
});
