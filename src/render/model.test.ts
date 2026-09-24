import { describe, expect, it } from "vitest";

import { sampleRepresentativeGlyphs } from "./lod";
import {
  DEFAULT_SEMANTIC_ZOOM_POLICY,
  semanticZoomLevel,
  validateRenderSnapshot,
  type DishRenderSnapshot,
} from "./model";

function fixture(): DishRenderSnapshot {
  return {
    snapshotId: "fixture-1",
    simulationTimeHours: 2,
    gridWidth: 3,
    gridHeight: 3,
    dishMask: new Uint8Array([0, 1, 0, 1, 1, 1, 0, 1, 0]),
    biomass: new Float32Array([0, 1, 0, 1, 4, 1, 0, 1, 0]),
    fields: [
      {
        id: "nutrient",
        kind: "nutrient",
        label: "Nutrient",
        unit: "normalized concentration",
        width: 3,
        height: 3,
        values: new Float32Array([0, 1, 0, 1, 0.5, 1, 0, 1, 0]),
        minimum: 0,
        maximum: 1,
      },
    ],
    lineages: [
      {
        id: "ancestor",
        label: "Ancestor",
        appearanceToken: "lineage-ancestor",
        patternToken: "solid-ring",
        density: new Float32Array([0, 1, 0, 2, 5, 2, 0, 1, 0]),
      },
      {
        id: "mutant",
        label: "Mutant",
        appearanceToken: "lineage-mutant",
        patternToken: "double-ring",
        density: new Float32Array([0, 0, 0, 0, 1, 0, 0, 0, 0]),
      },
    ],
    events: [],
  };
}

describe("semanticZoomLevel", () => {
  it("uses stable semantic thresholds", () => {
    expect(semanticZoomLevel(1)).toBe("dish");
    expect(semanticZoomLevel(DEFAULT_SEMANTIC_ZOOM_POLICY.colonyAt)).toBe("colony");
    expect(semanticZoomLevel(DEFAULT_SEMANTIC_ZOOM_POLICY.representativeCellAt)).toBe("representative-cell");
  });

  it("rejects invalid threshold ordering", () => {
    expect(() => semanticZoomLevel(2, { colonyAt: 4, representativeCellAt: 3 })).toThrow();
  });
});

describe("validateRenderSnapshot", () => {
  it("accepts a consistent snapshot", () => {
    expect(() => validateRenderSnapshot(fixture())).not.toThrow();
  });

  it("requires color-independent lineage identity", () => {
    const snapshot = fixture();
    const broken: DishRenderSnapshot = {
      ...snapshot,
      lineages: [{ ...snapshot.lineages[0]!, patternToken: "" }],
    };
    expect(() => validateRenderSnapshot(broken)).toThrow(/pattern/i);
  });

  it("rejects dimensions that disagree with the grid", () => {
    const snapshot = fixture();
    const broken: DishRenderSnapshot = {
      ...snapshot,
      fields: [{ ...snapshot.fields[0]!, width: 2 }],
    };
    expect(() => validateRenderSnapshot(broken)).toThrow(/dimensions/i);
  });
});

describe("sampleRepresentativeGlyphs", () => {
  it("draws no individual glyphs at dish scale", () => {
    expect(
      sampleRepresentativeGlyphs(
        fixture(),
        { centerX: 0.5, centerY: 0.5, zoom: 1 },
        "dish",
        { maxGlyphs: 100, minimumDensity: 0.1 },
      ),
    ).toEqual([]);
  });

  it("is deterministic and bounded at colony scale", () => {
    const snapshot = fixture();
    const request = { centerX: 0.5, centerY: 0.5, zoom: 2.5 } as const;
    const options = { maxGlyphs: 3, minimumDensity: 0.1 } as const;
    const first = sampleRepresentativeGlyphs(snapshot, request, "colony", options);
    const second = sampleRepresentativeGlyphs(snapshot, request, "colony", options);
    expect(first).toEqual(second);
    expect(first.length).toBeLessThanOrEqual(3);
    expect(first.every((glyph) => snapshot.dishMask[glyph.cellIndex] === 1)).toBe(true);
  });

  it("changes presentation sampling without mutating authoritative buffers", () => {
    const snapshot = fixture();
    const before = Array.from(snapshot.lineages[0]!.density);
    sampleRepresentativeGlyphs(
      snapshot,
      { centerX: 0.5, centerY: 0.5, zoom: 4 },
      "colony",
      { maxGlyphs: 2, minimumDensity: 0 },
    );
    expect(Array.from(snapshot.lineages[0]!.density)).toEqual(before);
  });
});
