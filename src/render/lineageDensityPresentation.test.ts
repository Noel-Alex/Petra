import { describe, expect, it } from "vitest";

import type { DishRenderSnapshot } from "./model";
import { createRendererDemoSnapshot } from "./pixi/demoSnapshot";
import {
  projectComparableLineageDensity,
  resolveSharedLineageDensityMaximum,
} from "./lineageDensityPresentation";

function snapshotWithPeaks(
  dominantPeak: number,
  rarePeak: number,
): DishRenderSnapshot {
  const base = createRendererDemoSnapshot(12);
  const cells = base.gridWidth * base.gridHeight;
  const mask = new Uint8Array(cells);
  mask[13] = 1;
  mask[14] = 1;

  const dominant = new Float32Array(cells);
  const rare = new Float32Array(cells);
  dominant[13] = dominantPeak;
  rare[14] = rarePeak;

  return {
    ...base,
    dishMask: mask,
    lineages: [
      { ...base.lineages[0]!, density: dominant },
      { ...base.lineages[1]!, density: rare },
    ],
  };
}

describe("shared lineage-density presentation", () => {
  it("does not let a 100x rarer lineage reach dominant intensity", () => {
    const snapshot = snapshotWithPeaks(100, 1);
    const maximum = resolveSharedLineageDensityMaximum(snapshot);

    expect(maximum).toBe(100);
    expect(projectComparableLineageDensity(100, maximum)).toEqual({
      visible: true,
      normalized: 1,
    });
    expect(projectComparableLineageDensity(1, maximum)).toEqual({
      visible: true,
      normalized: 0.1,
    });
  });

  it("maps the same raw density identically regardless of lineage identity", () => {
    expect(projectComparableLineageDensity(25, 100)).toEqual({
      visible: true,
      normalized: 0.5,
    });
    expect(projectComparableLineageDensity(25, 100)).toEqual(
      projectComparableLineageDensity(25, 100),
    );
  });

  it("ignores out-of-dish density when establishing the shared scale", () => {
    const snapshot = snapshotWithPeaks(100, 1);
    const lineage = snapshot.lineages[1]!;
    const density = Float32Array.from(lineage.density);
    density[0] = 9999;

    const masked: DishRenderSnapshot = {
      ...snapshot,
      lineages: [
        snapshot.lineages[0]!,
        { ...lineage, density },
      ],
    };

    expect(masked.dishMask[0]).toBe(0);
    expect(resolveSharedLineageDensityMaximum(masked)).toBe(100);
  });

  it("keeps every positive comparable density visible and hides zero", () => {
    expect(projectComparableLineageDensity(0, 100)).toEqual({
      visible: false,
      normalized: 0,
    });
    expect(projectComparableLineageDensity(0.0001, 100).visible).toBe(true);
  });

  it("rejects invalid presentation inputs", () => {
    expect(() => projectComparableLineageDensity(-1, 100)).toThrow(
      /finite and non-negative/,
    );
    expect(() => projectComparableLineageDensity(1, Number.NaN)).toThrow(
      /finite and non-negative/,
    );
  });
});
