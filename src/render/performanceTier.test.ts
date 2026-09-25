import { describe, expect, it } from "vitest";
import { MAX_RENDERER_RESOLUTION } from "./pixi/rendererResolution";
import {
  DEFAULT_PRESENTATION_PERFORMANCE_TIER,
  PRESENTATION_PERFORMANCE_TIER_SCHEMA_VERSION,
  parsePresentationPerformanceTier,
  parseStoredPresentationPerformanceTier,
  presentationPerformancePolicyIdentity,
  resolvePresentationPerformancePolicy,
} from "./performanceTier";

describe("presentation performance tier policy", () => {
  it("keeps Standard equal to the current renderer presentation defaults", () => {
    const standard = resolvePresentationPerformancePolicy("standard");

    expect(DEFAULT_PRESENTATION_PERFORMANCE_TIER).toBe("standard");
    expect(standard).toEqual({
      schemaVersion: PRESENTATION_PERFORMANCE_TIER_SCHEMA_VERSION,
      tier: "standard",
      maxRepresentativeGlyphs: 180,
      maxRendererResolution: MAX_RENDERER_RESOLUTION,
      simulationFidelity: "unchanged",
    });
  });

  it("changes only bounded presentation work across manual tiers", () => {
    const low = resolvePresentationPerformancePolicy("low");
    const standard = resolvePresentationPerformancePolicy("standard");
    const high = resolvePresentationPerformancePolicy("high");

    expect(low.maxRepresentativeGlyphs).toBeLessThan(
      standard.maxRepresentativeGlyphs,
    );
    expect(high.maxRepresentativeGlyphs).toBeGreaterThan(
      standard.maxRepresentativeGlyphs,
    );
    expect(low.maxRendererResolution).toBeLessThan(
      standard.maxRendererResolution,
    );
    expect(high.maxRendererResolution).toBe(
      standard.maxRendererResolution,
    );

    for (const policy of [low, standard, high]) {
      expect(policy.simulationFidelity).toBe("unchanged");
      expect(Object.keys(policy).sort()).toEqual([
        "maxRendererResolution",
        "maxRepresentativeGlyphs",
        "schemaVersion",
        "simulationFidelity",
        "tier",
      ]);
    }
  });

  it("parses only explicit version-supported manual tier names", () => {
    expect(parsePresentationPerformanceTier("low")).toBe("low");
    expect(parsePresentationPerformanceTier("standard")).toBe("standard");
    expect(parsePresentationPerformanceTier("high")).toBe("high");
    expect(parseStoredPresentationPerformanceTier(null)).toBeNull();
    expect(parseStoredPresentationPerformanceTier("low")).toBe("low");

    for (const invalid of [
      "",
      "auto",
      "ultra",
      "LOW",
      1,
      null,
      undefined,
      {},
    ]) {
      expect(() => parsePresentationPerformanceTier(invalid)).toThrow(
        RangeError,
      );
    }
    expect(() =>
      parseStoredPresentationPerformanceTier("auto"),
    ).toThrow(RangeError);
  });

  it("publishes deterministic presentation-only policy identity", () => {
    expect(presentationPerformancePolicyIdentity("low")).toBe(
      "petra-presentation-performance-tier|v1|low|glyphs=96|resolution=1",
    );
    expect(presentationPerformancePolicyIdentity("standard")).toBe(
      "petra-presentation-performance-tier|v1|standard|glyphs=180|resolution=2",
    );
    expect(presentationPerformancePolicyIdentity("high")).toBe(
      "petra-presentation-performance-tier|v1|high|glyphs=260|resolution=2",
    );
  });
});
