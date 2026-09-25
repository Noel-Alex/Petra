import { describe, expect, it } from "vitest";

import {
  LINEAGE_DENSITY_PRESENTATION_SCALE_VERSION,
  assertLineageDensityPresentationScale,
  assertLineageDensityWithinPresentationScale,
  lineageDensityPresentationScaleEqual,
  resolveLineageDensityPresentationScale,
  stableLineageDensityMaximum,
  type StableSourceLineageDensityScale,
} from "./lineageDensityScale";

function stable(
  maximum = 4,
  sourceIdentity = "run-branch-a|config-fingerprint-a",
): StableSourceLineageDensityScale {
  return {
    version: LINEAGE_DENSITY_PRESENTATION_SCALE_VERSION,
    mode: "stable-source",
    unit: "model-biomass",
    maximum,
    maximumTolerance: maximum * 2 ** -23,
    sourceIdentity,
  };
}

describe("lineage-density presentation scale authority", () => {
  it("keeps snapshot-extrema as an explicit non-stable compatibility fallback", () => {
    expect(resolveLineageDensityPresentationScale(undefined)).toEqual({
      version: LINEAGE_DENSITY_PRESENTATION_SCALE_VERSION,
      mode: "snapshot-extrema",
    });
    expect(stableLineageDensityMaximum(undefined)).toBeNull();
  });

  it("returns a stable source ceiling without a snapshot scan", () => {
    expect(stableLineageDensityMaximum(stable(4))).toBe(4);
  });

  it("accepts only the source-owned numerical tolerance above a stable ceiling", () => {
    const scale = stable(4);
    expect(() =>
      assertLineageDensityWithinPresentationScale(
        4 + scale.maximumTolerance,
        scale,
      ),
    ).not.toThrow();
    expect(() =>
      assertLineageDensityWithinPresentationScale(
        4 + scale.maximumTolerance * 2,
        scale,
      ),
    ).toThrow(/beyond source-owned representation tolerance/);
  });

  it("invalidates stable scale identity when branch/config source identity changes", () => {
    expect(lineageDensityPresentationScaleEqual(stable(), stable())).toBe(true);
    expect(
      lineageDensityPresentationScaleEqual(
        stable(4, "run-branch-a|config-fingerprint-a"),
        stable(4, "run-branch-b|config-fingerprint-a"),
      ),
    ).toBe(false);
    expect(lineageDensityPresentationScaleEqual(stable(4), stable(5))).toBe(
      false,
    );
  });

  it("rejects malformed stable-source authority rather than inventing defaults", () => {
    expect(() =>
      assertLineageDensityPresentationScale({
        ...stable(),
        unit: "",
      }),
    ).toThrow(/canonical non-empty text/);
    expect(() =>
      assertLineageDensityPresentationScale({
        ...stable(),
        maximum: 0,
      }),
    ).toThrow(/finite and positive/);
    expect(() =>
      assertLineageDensityPresentationScale({
        ...stable(),
        maximumTolerance: Number.NaN,
      }),
    ).toThrow(/finite and non-negative/);
  });
});
