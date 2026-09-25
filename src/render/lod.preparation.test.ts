import { describe, expect, it } from "vitest";

import {
  prepareRepresentativeGlyphCandidates,
  sampleRepresentativeGlyphs,
  selectRepresentativeGlyphs,
} from "./lod";
import type { CameraView, RenderLineage } from "./model";
import type { DishVisualState } from "./visualInterpolation";

function lineage(
  id: string,
  density: readonly number[],
): RenderLineage {
  return {
    id,
    label: id,
    appearanceToken:
      id === "ancestor" ? "lineage-cyan" : "lineage-coral",
    patternToken:
      id === "ancestor" ? "solid-ring" : "double-ring",
    density: Float32Array.from(density),
  };
}

function fixture(): DishVisualState {
  return {
    samplingIdentity: "glyph-preparation-fixture",
    gridWidth: 5,
    gridHeight: 5,
    dishMask: Uint8Array.from([
      0, 1, 1, 1, 0,
      1, 1, 1, 1, 1,
      1, 1, 1, 1, 1,
      1, 1, 1, 1, 1,
      0, 1, 1, 1, 0,
    ]),
    biomass: new Float32Array(25),
    fields: [],
    lineages: [
      lineage("ancestor", [
        0, 0.5, 1, 0.5, 0,
        0.3, 1.5, 2.5, 1.2, 0.3,
        0.4, 2.2, 4.5, 2.1, 0.4,
        0.3, 1.1, 2.4, 1.4, 0.3,
        0, 0.4, 0.8, 0.4, 0,
      ]),
      lineage("mutant", [
        0, 0, 0.4, 0, 0,
        0, 0.6, 1.8, 0.5, 0,
        0.2, 1.4, 3.8, 1.3, 0.2,
        0, 0.5, 1.6, 0.7, 0,
        0, 0, 0.3, 0, 0,
      ]),
    ],
  };
}

describe("representative glyph preparation", () => {
  it("prepare-once/select-many is exactly equivalent to the public sampler", () => {
    const snapshot = fixture();
    const minimumDensity = 0.45;
    const prepared = prepareRepresentativeGlyphCandidates(
      snapshot,
      minimumDensity,
    );
    const cameras: readonly CameraView[] = [
      { centerX: 0.5, centerY: 0.5, zoom: 1 },
      { centerX: 0.35, centerY: 0.45, zoom: 2.25 },
      { centerX: 0.68, centerY: 0.6, zoom: 3.5 },
    ];

    for (const camera of cameras) {
      for (const maxGlyphs of [1, 3, 7, 64]) {
        expect(
          selectRepresentativeGlyphs(
            prepared,
            camera,
            maxGlyphs,
          ),
        ).toEqual(
          sampleRepresentativeGlyphs(
            snapshot,
            camera,
            "colony",
            { maxGlyphs, minimumDensity },
          ),
        );
      }
    }
  });

  it("keeps camera filtering out of candidate preparation", () => {
    const prepared = prepareRepresentativeGlyphCandidates(
      fixture(),
      0.45,
    );

    expect(prepared.length).toBeGreaterThan(7);
    expect(
      selectRepresentativeGlyphs(
        prepared,
        { centerX: 0.5, centerY: 0.5, zoom: 1 },
        64,
      ).length,
    ).toBeGreaterThan(
      selectRepresentativeGlyphs(
        prepared,
        { centerX: 0.1, centerY: 0.1, zoom: 4 },
        64,
      ).length,
    );
  });

  it("preserves option validation and dish-level suppression", () => {
    const snapshot = fixture();
    const camera: CameraView = {
      centerX: 0.5,
      centerY: 0.5,
      zoom: 1,
    };

    expect(() =>
      prepareRepresentativeGlyphCandidates(
        snapshot,
        Number.NaN,
      ),
    ).toThrow(/minimumDensity/);

    expect(() =>
      selectRepresentativeGlyphs(
        prepareRepresentativeGlyphCandidates(
          snapshot,
          0,
        ),
        camera,
        -1,
      ),
    ).toThrow(/maxGlyphs/);

    expect(
      sampleRepresentativeGlyphs(
        snapshot,
        camera,
        "dish",
        { maxGlyphs: 8, minimumDensity: 0 },
      ),
    ).toEqual([]);
  });
});
