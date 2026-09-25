import { describe, expect, it } from "vitest";

import { projectColonyMassAlpha } from "./colonyMassPresentation";
import { projectComparableLineageDensity } from "./lineageDensityPresentation";
import {
  LINEAGE_DENSITY_PRESENTATION_SCALE_SCHEMA_VERSION,
  assertLineageDensityWithinPresentationScale,
  lineageDensityPresentationMaximum,
  validateLineageDensityPresentationScale,
  type LineageDensityPresentationScale,
} from "./lineageDensityScale";

function fixedScale(
  maximum = 32,
  overflowTolerance = 0,
): LineageDensityPresentationScale {
  return {
    schemaVersion: LINEAGE_DENSITY_PRESENTATION_SCALE_SCHEMA_VERSION,
    mode: "source-owned-fixed",
    unit: "model-biomass",
    maximum,
    sourceIdentity: "fixture-config-fingerprint-v1",
    overflowTolerance,
  };
}

function snapshotScale(
  snapshotId: string,
  maximum: number,
): LineageDensityPresentationScale {
  return {
    schemaVersion: LINEAGE_DENSITY_PRESENTATION_SCALE_SCHEMA_VERSION,
    mode: "snapshot-extrema",
    unit: "model-biomass",
    maximum,
    snapshotId,
  };
}

describe("lineage density presentation scale", () => {
  it("keeps equal absolute density visually comparable across time under one fixed source scale", () => {
    const scale = fixedScale(8);

    const earlier = projectColonyMassAlpha(
      4,
      lineageDensityPresentationMaximum(scale),
    );
    const later = projectColonyMassAlpha(
      4,
      lineageDensityPresentationMaximum(scale),
    );
    const comparableEarlier = projectComparableLineageDensity(
      4,
      lineageDensityPresentationMaximum(scale),
    );
    const comparableLater = projectComparableLineageDensity(
      4,
      lineageDensityPresentationMaximum(scale),
    );

    expect(later).toBe(earlier);
    expect(comparableLater).toEqual(comparableEarlier);
  });

  it("makes a uniform density reduction visibly weaker instead of renormalizing it to full intensity", () => {
    const stable = fixedScale(8);

    expect(
      projectColonyMassAlpha(
        8,
        lineageDensityPresentationMaximum(stable),
      ),
    ).toBe(1);
    expect(
      projectColonyMassAlpha(
        4,
        lineageDensityPresentationMaximum(stable),
      ),
    ).toBeLessThan(1);

    const snapshotBefore = snapshotScale("snapshot-before", 8);
    const snapshotAfter = snapshotScale("snapshot-after", 4);
    expect(
      projectColonyMassAlpha(
        8,
        lineageDensityPresentationMaximum(snapshotBefore),
      ),
    ).toBe(1);
    expect(
      projectColonyMassAlpha(
        4,
        lineageDensityPresentationMaximum(snapshotAfter),
      ),
    ).toBe(1);
  });

  it("preserves zero transparency and cross-lineage ordering on one shared fixed scale", () => {
    const scale = fixedScale(32);
    const maximum = lineageDensityPresentationMaximum(scale);

    expect(projectColonyMassAlpha(0, maximum)).toBe(0);
    const rare = projectComparableLineageDensity(2, maximum);
    const dominant = projectComparableLineageDensity(16, maximum);

    expect(rare.visible).toBe(true);
    expect(dominant.visible).toBe(true);
    expect(rare.normalized).toBeLessThan(dominant.normalized);
  });

  it("uses only the explicitly source-supplied numerical tolerance for fixed-scale overflow", () => {
    const scale = fixedScale(32, 0.0001);

    expect(() =>
      assertLineageDensityWithinPresentationScale(32.00005, scale),
    ).not.toThrow();
    expect(() =>
      assertLineageDensityWithinPresentationScale(32.001, scale),
    ).toThrow(/exceeds declared source-owned-fixed presentation maximum/);
  });

  it("fails closed on malformed scale metadata and snapshot-extrema overflow", () => {
    expect(() =>
      validateLineageDensityPresentationScale({
        ...fixedScale(),
        sourceIdentity: " padded ",
      }),
    ).toThrow(/canonical non-empty text/);
    expect(() =>
      validateLineageDensityPresentationScale({
        ...fixedScale(),
        extra: true,
      }),
    ).toThrow(/unsupported field/);
    expect(() =>
      validateLineageDensityPresentationScale({
        schemaVersion: LINEAGE_DENSITY_PRESENTATION_SCALE_SCHEMA_VERSION,
        mode: "source-owned-fixed",
        unit: "model-biomass",
        maximum: 0,
        sourceIdentity: "fixture-config-fingerprint-v1",
        overflowTolerance: 0,
      }),
    ).toThrow(/must be finite and > 0/);

    const observed = snapshotScale("snapshot-a", 4);
    expect(() =>
      assertLineageDensityWithinPresentationScale(4.000001, observed),
    ).toThrow(/exceeds declared snapshot-extrema presentation maximum/);
  });
});
