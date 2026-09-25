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

  it("rejects duplicate field identities before overlay selection", () => {
    const snapshot = fixture();
    const first = snapshot.fields[0]!;
    const duplicate = {
      ...first,
      kind: "antibiotic" as const,
      label: "Different field with same id",
      unit: "ug/mL",
      values: new Float32Array([1, 0, 1, 0, 0.25, 0, 1, 0, 1]),
    };

    expect(() =>
      validateRenderSnapshot({
        ...snapshot,
        fields: [first, duplicate],
      }),
    ).toThrow(/duplicate render field id: nutrient/i);
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

  it("rejects in-mask field values below the declared transfer domain", () => {
    const snapshot = fixture();
    const field = snapshot.fields[0]!;
    const values = Float32Array.from(field.values);
    values[1] = -0.25;

    expect(() =>
      validateRenderSnapshot({
        ...snapshot,
        fields: [{ ...field, values }],
      }),
    ).toThrow(/outside its declared domain/i);
  });

  it("rejects in-mask field values above the declared transfer domain", () => {
    const snapshot = fixture();
    const field = snapshot.fields[0]!;
    const values = Float32Array.from(field.values);
    values[4] = 1.25;

    expect(() =>
      validateRenderSnapshot({
        ...snapshot,
        fields: [{ ...field, values }],
      }),
    ).toThrow(/outside its declared domain/i);
  });

  it("accepts a broad fixed domain even when observed values do not reach its extrema", () => {
    const snapshot = fixture();
    const field = snapshot.fields[0]!;

    expect(() =>
      validateRenderSnapshot({
        ...snapshot,
        fields: [{ ...field, minimum: -2, maximum: 3 }],
      }),
    ).not.toThrow();
  });

  it("excludes off-mask storage from field-domain containment", () => {
    const snapshot = fixture();
    const field = snapshot.fields[0]!;
    const values = Float32Array.from(field.values);
    values[0] = 99;

    expect(() =>
      validateRenderSnapshot({
        ...snapshot,
        fields: [{ ...field, values }],
      }),
    ).not.toThrow();
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

  it("does not let off-aperture candidates consume the bounded glyph budget", () => {
    const density = new Float32Array(100);
    density[57] = 100;
    density[56] = 1;

    const snapshot: DishRenderSnapshot = {
      snapshotId: "aperture-budget",
      samplingIdentity: "aperture-budget-run",
      simulationTimeHours: 1,
      gridWidth: 10,
      gridHeight: 10,
      dishMask: new Uint8Array(100).fill(1),
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

    const glyphs = sampleRepresentativeGlyphs(
      snapshot,
      { centerX: 0.5, centerY: 0.5, zoom: 2 },
      "colony",
      { maxGlyphs: 1, minimumDensity: 0.1 },
    );

    expect(glyphs).toHaveLength(1);
    expect(glyphs[0]?.cellIndex).toBe(56);
    expect(glyphs[0]?.x).toBeCloseTo(0.65);
    expect(glyphs[0]?.y).toBeCloseTo(0.55);
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
