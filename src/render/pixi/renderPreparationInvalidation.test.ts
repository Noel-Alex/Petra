import { describe, expect, it } from "vitest";

import {
  advanceDishRenderPreparationRevision,
  initialDishRenderPreparationRevision,
  resolveDishRenderPreparationInvalidation,
  type DishRenderPreparationRevision,
} from "./renderPreparationInvalidation";

describe("dish render preparation invalidation", () => {
  it("keeps expensive scientific preparation clean for camera/selection-only redraws", () => {
    const settled = initialDishRenderPreparationRevision();

    expect(
      resolveDishRenderPreparationInvalidation(settled, settled),
    ).toEqual({
      fieldRaster: false,
      densityRaster: false,
      fieldContours: false,
      lineageContours: false,
      representativeGlyphCandidates: false,
      representativeGlyphAppearance: false,
    });
  });

  it("invalidates every scientific-data preparation layer for a changed presentation frame", () => {
    const settled = initialDishRenderPreparationRevision();
    const next = advanceDishRenderPreparationRevision(
      settled,
      "scientific-frame",
    );

    expect(
      resolveDishRenderPreparationInvalidation(settled, next),
    ).toEqual({
      fieldRaster: true,
      densityRaster: true,
      fieldContours: true,
      lineageContours: true,
      representativeGlyphCandidates: true,
      representativeGlyphAppearance: true,
    });
  });

  it("invalidates only selected-field preparation when the overlay changes", () => {
    const settled = initialDishRenderPreparationRevision();
    const next = advanceDishRenderPreparationRevision(
      settled,
      "overlay-selection",
    );

    expect(
      resolveDishRenderPreparationInvalidation(settled, next),
    ).toEqual({
      fieldRaster: true,
      densityRaster: false,
      fieldContours: true,
      lineageContours: false,
      representativeGlyphCandidates: false,
      representativeGlyphAppearance: false,
    });
  });

  it("keeps scalar preparation clean when only organism presentation changes", () => {
    const settled = initialDishRenderPreparationRevision();
    const next = advanceDishRenderPreparationRevision(
      settled,
      "organism-presentation",
    );

    expect(
      resolveDishRenderPreparationInvalidation(settled, next),
    ).toEqual({
      fieldRaster: false,
      densityRaster: false,
      fieldContours: false,
      lineageContours: false,
      representativeGlyphCandidates: false,
      representativeGlyphAppearance: true,
    });
  });

  it("uses explicit frame revisions rather than presentation object identity", () => {
    const first = initialDishRenderPreparationRevision();
    const second = advanceDishRenderPreparationRevision(
      first,
      "scientific-frame",
    );
    const third = advanceDishRenderPreparationRevision(
      second,
      "scientific-frame",
    );

    expect(second.scientificFrame).toBe(1);
    expect(third.scientificFrame).toBe(2);
    expect(
      resolveDishRenderPreparationInvalidation(second, third)
        .densityRaster,
    ).toBe(true);
  });

  it("fails closed on invalid or exhausted revision counters", () => {
    const invalid = {
      version: 1,
      scientificFrame: -1,
      overlaySelection: 0,
      organismPresentation: 0,
    } as DishRenderPreparationRevision;
    expect(() =>
      resolveDishRenderPreparationInvalidation(
        invalid,
        initialDishRenderPreparationRevision(),
      ),
    ).toThrow(/scientificFrame/);

    const exhausted = {
      version: 1,
      scientificFrame: Number.MAX_SAFE_INTEGER,
      overlaySelection: 0,
      organismPresentation: 0,
    } as DishRenderPreparationRevision;
    expect(() =>
      advanceDishRenderPreparationRevision(
        exhausted,
        "scientific-frame",
      ),
    ).toThrow(/exhausted/);
  });
});
