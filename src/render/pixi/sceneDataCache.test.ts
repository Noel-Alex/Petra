import { describe, expect, it } from "vitest";

import type { DishRenderSnapshot } from "../model";
import { createDishSceneDataCache } from "./sceneDataCache";

function snapshot(): DishRenderSnapshot {
  return {
    snapshotId: "scene-cache",
    samplingIdentity: "run-1",
    simulationTimeHours: 0,
    gridWidth: 2,
    gridHeight: 2,
    dishMask: new Uint8Array([1, 1, 1, 1]),
    biomass: new Float32Array([0, 4, 2, 0]),
    fields: [
      {
        id: "drug",
        kind: "antibiotic",
        label: "Drug",
        unit: "mg/L",
        width: 2,
        height: 2,
        values: new Float32Array([0, 1, 1, 0]),
        rangeMode: "snapshot-extrema",
        minimum: 0,
        maximum: 1,
      },
      {
        id: "food",
        kind: "nutrient",
        label: "Resource",
        unit: "model-resource",
        width: 2,
        height: 2,
        values: new Float32Array([1, 0, 0, 1]),
        rangeMode: "snapshot-extrema",
        minimum: 0,
        maximum: 1,
      },
    ],
    lineages: [
      {
        id: "L1",
        label: "L1",
        appearanceToken: "lineage-cyan",
        patternToken: "solid-ring",
        density: new Float32Array([0, 4, 2, 0]),
      },
    ],
    events: [],
  };
}

describe("Pixi dish data-space scene cache", () => {
  it("reuses prepared raster/contour inputs across camera-only redraws", () => {
    const cache = createDishSceneDataCache();
    const source = snapshot();

    const first = cache.resolve(source, 1, null);
    const cameraOnly = cache.resolve(source, 1, null);

    expect(cameraOnly).toBe(first);
    expect(first.overlay?.id).toBe("drug");
    expect(first.lineageDensityMaximum).toBe(4);
    expect(first.fieldContourLevels.length).toBeGreaterThan(0);
    expect(first.lineageContours[0]?.lineageId).toBe("L1");
  });

  it("invalidates on overlay changes and explicit visual-state revisions", () => {
    const cache = createDishSceneDataCache();
    const source = snapshot();

    const drug = cache.resolve(source, 3, null);
    const food = cache.resolve(source, 3, "food");
    const nextVisualFrame = cache.resolve(source, 4, "food");

    expect(food).not.toBe(drug);
    expect(food.overlay?.id).toBe("food");
    expect(nextVisualFrame).not.toBe(food);
  });

  it("rejects invalid revision identity instead of guessing freshness", () => {
    const cache = createDishSceneDataCache();
    const source = snapshot();

    expect(() => cache.resolve(source, -1, null)).toThrow(
      /non-negative safe integer/,
    );
    expect(() => cache.resolve(source, Number.NaN, null)).toThrow(
      /non-negative safe integer/,
    );
  });
});
