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
    samplingIdentity: "fixture-run",
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
        appearanceToken: "lineage-cyan",
        patternToken: "solid-ring",
        density: new Float32Array([0, 1, 0, 2, 5, 2, 0, 1, 0]),
      },
      {
        id: "mutant",
        label: "Mutant",
        appearanceToken: "lineage-coral",
        patternToken: "double-ring",
        density: new Float32Array([0, 0, 0, 0, 1, 0, 0, 0, 0]),
      },
    ],
    events: [],
  };
}

function temporalFixture(snapshotId: string): DishRenderSnapshot {
  const density = new Float32Array(25);
  density.fill(1);

  return {
    snapshotId,
    samplingIdentity: "temporal-run-1",
    simulationTimeHours: snapshotId === "temporal-1" ? 1 : 2,
    gridWidth: 5,
    gridHeight: 5,
    dishMask: new Uint8Array(25).fill(1),
    biomass: Float32Array.from(density),
    fields: [],
    lineages: [
      {
        id: "ancestor",
        label: "Ancestor",
        appearanceToken: "lineage-cyan",
        patternToken: "solid-ring",
        density,
      },
    ],
    events: [],
  };
}

describe("semanticZoomLevel", () => {
  it("uses stable semantic thresholds", () => {
    expect(semanticZoomLevel(1)).toBe("dish");
    expect(semanticZoomLevel(DEFAULT_SEMANTIC_ZOOM_POLICY.colonyAt)).toBe(
      "colony",
    );
    expect(
      semanticZoomLevel(DEFAULT_SEMANTIC_ZOOM_POLICY.representativeCellAt),
    ).toBe("representative-cell");
  });

  it("rejects invalid threshold ordering", () => {
    expect(() =>
      semanticZoomLevel(2, { colonyAt: 4, representativeCellAt: 3 }),
    ).toThrow();
  });
});

describe("validateRenderSnapshot", () => {
  it("accepts a consistent snapshot", () => {
    expect(() => validateRenderSnapshot(fixture())).not.toThrow();
  });

  it("requires a stable sampling identity", () => {
    expect(() =>
      validateRenderSnapshot({ ...fixture(), samplingIdentity: "" }),
    ).toThrow(/samplingIdentity must be non-empty/i);
  });

  it("requires a supported lineage appearance", () => {
    const snapshot = fixture();
    const invalid = {
      ...snapshot.lineages[0]!,
      appearanceToken: "lineage-unknown",
    } as unknown as DishRenderSnapshot["lineages"][number];
    expect(() =>
      validateRenderSnapshot({ ...snapshot, lineages: [invalid] }),
    ).toThrow(/unsupported lineage appearance token/i);
  });

  it("requires a supported color-independent lineage pattern", () => {
    const snapshot = fixture();
    const invalid = {
      ...snapshot.lineages[0]!,
      patternToken: "arbitrary-ring",
    } as unknown as DishRenderSnapshot["lineages"][number];
    expect(() =>
      validateRenderSnapshot({ ...snapshot, lineages: [invalid] }),
    ).toThrow(/unsupported lineage pattern token/i);
  });

  it("rejects dimensions that disagree with grid", () => {
    const snapshot = fixture();
    expect(() =>
      validateRenderSnapshot({
        ...snapshot,
        fields: [{ ...snapshot.fields[0]!, width: 2 }],
      }),
    ).toThrow(/dimensions/i);
  });
});

describe("sampleRepresentativeGlyphs", () => {
  const camera = { centerX: 0.5, centerY: 0.5, zoom: 2.5 } as const;
  const options = { maxGlyphs: 4, minimumDensity: 0.1 } as const;

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

  it("is deterministic and bounded", () => {
    const snapshot = fixture();
    const boundedOptions = { maxGlyphs: 3, minimumDensity: 0.1 } as const;
    const first = sampleRepresentativeGlyphs(
      snapshot,
      camera,
      "colony",
      boundedOptions,
    );
    expect(first).toEqual(
      sampleRepresentativeGlyphs(
        snapshot,
        camera,
        "colony",
        boundedOptions,
      ),
    );
    expect(first.length).toBeLessThanOrEqual(3);
    expect(first.every((glyph) => snapshot.dishMask[glyph.cellIndex] === 1)).toBe(
      true,
    );
  });

  it("keeps representative identity stable when only snapshot identity/time changes", () => {
    const first = sampleRepresentativeGlyphs(
      temporalFixture("temporal-1"),
      camera,
      "colony",
      options,
    );
    const second = sampleRepresentativeGlyphs(
      temporalFixture("temporal-2"),
      camera,
      "colony",
      options,
    );

    expect(first).toHaveLength(4);
    expect(second).toEqual(first);
  });

  it("retains unaffected representatives after one selected location disappears", () => {
    const beforeSnapshot = temporalFixture("temporal-1");
    const before = sampleRepresentativeGlyphs(
      beforeSnapshot,
      camera,
      "colony",
      options,
    );
    expect(before).toHaveLength(4);

    const removed = before[0]!;
    const afterSnapshot = temporalFixture("temporal-3");
    afterSnapshot.lineages[0]!.density[removed.cellIndex] = 0;
    afterSnapshot.biomass[removed.cellIndex] = 0;

    const after = sampleRepresentativeGlyphs(
      afterSnapshot,
      camera,
      "colony",
      options,
    );

    const retainedIds = before
      .slice(1)
      .map((glyph) => `${glyph.lineageId}:${glyph.cellIndex}`);
    const afterIds = after.map(
      (glyph) => `${glyph.lineageId}:${glyph.cellIndex}`,
    );

    expect(after).toHaveLength(4);
    expect(afterIds).not.toContain(
      `${removed.lineageId}:${removed.cellIndex}`,
    );
    for (const id of retainedIds) {
      expect(afterIds).toContain(id);
    }
  });

  it("does not mutate authoritative buffers", () => {
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
