import { describe, expect, it } from "vitest";

import { OVERLAY_KINDS, type OverlayKind } from "./model";
import {
  overlayPatternAlpha,
  projectOverlayValue,
  resolveOverlayPresentation,
} from "./overlayPresentation";

describe("overlay presentation registry", () => {
  it("covers every declared overlay kind with bounded presentation policy", () => {
    for (const kind of OVERLAY_KINDS) {
      const spec = resolveOverlayPresentation(kind);
      expect(spec.kind).toBe(kind);
      expect(spec.alphaMinimum).toBeGreaterThanOrEqual(0);
      expect(spec.alphaMaximum).toBeGreaterThanOrEqual(spec.alphaMinimum);
      expect(spec.alphaMaximum).toBeLessThanOrEqual(1);
      expect(spec.legendScale.length).toBeGreaterThan(0);
    }
  });

  it("fails closed for an unknown runtime overlay kind", () => {
    expect(() =>
      resolveOverlayPresentation("mystery" as OverlayKind),
    ).toThrow(/unsupported overlay kind/i);
  });

  it("uses a zero-aware diverging transfer for net growth", () => {
    const negative = projectOverlayValue("net-growth", -2, -2, 2);
    const neutral = projectOverlayValue("net-growth", 0, -2, 2);
    const positive = projectOverlayValue("net-growth", 2, -2, 2);

    expect(negative.polarity).toBe("negative");
    expect(neutral.polarity).toBe("neutral");
    expect(positive.polarity).toBe("positive");
    expect(new Set([negative.color, neutral.color, positive.color]).size).toBe(3);
    expect(negative.pattern).not.toBe(positive.pattern);
    expect(neutral.visible).toBe(true);
    expect(neutral.normalizedMagnitude).toBe(0);
    expect(negative.normalizedMagnitude).toBe(1);
    expect(positive.normalizedMagnitude).toBe(1);
  });

  it("suppresses negligible sequential values without changing source data", () => {
    const low = projectOverlayValue("nutrient", 0.01, 0, 1);
    const high = projectOverlayValue("nutrient", 1, 0, 1);

    expect(low.visible).toBe(false);
    expect(high.visible).toBe(true);
    expect(high.normalizedMagnitude).toBe(1);
  });

  it("keeps uncertainty semantics explicitly source-defined", () => {
    expect(resolveOverlayPresentation("uncertainty").legendScale).toMatch(
      /source-defined uncertainty/i,
    );
  });

  it("provides bounded deterministic non-color texture multipliers", () => {
    const forward = overlayPatternAlpha("diagonal-forward", 2, 1);
    const backward = overlayPatternAlpha("diagonal-back", 2, 1);

    expect(forward).toBeGreaterThanOrEqual(0.5);
    expect(forward).toBeLessThanOrEqual(1);
    expect(backward).toBeGreaterThanOrEqual(0.5);
    expect(backward).toBeLessThanOrEqual(1);
    expect(forward).not.toBe(backward);
  });
});
