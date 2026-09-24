import { describe, expect, it } from "vitest";

import {
  OVERLAY_KINDS,
  validateRenderSnapshot,
  type OverlayKind,
} from "./model";
import {
  overlayPatternMultiplier,
  projectOverlayScalar,
  resolveOverlayPresentation,
} from "./overlayPresentation";
import { createRendererDemoSnapshot } from "./pixi/demoSnapshot";

describe("overlay presentation registry", () => {
  it("covers every current overlay kind explicitly", () => {
    expect(
      OVERLAY_KINDS.map((kind) => resolveOverlayPresentation(kind).kind),
    ).toEqual(OVERLAY_KINDS);
  });

  it("keeps sequential alpha bounded and suppresses only visual floor values", () => {
    const presentation = resolveOverlayPresentation("nutrient");
    const low = projectOverlayScalar(presentation, 0, 0, 1);
    const high = projectOverlayScalar(presentation, 1, 0, 1);

    expect(low.visible).toBe(false);
    expect(high.visible).toBe(true);
    expect(high.alpha).toBeLessThanOrEqual(presentation.alphaCeiling);
    expect(high.alpha).toBeGreaterThanOrEqual(presentation.alphaFloor);
  });

  it("makes signed net growth zero-aware and non-color sign-distinct", () => {
    const presentation = resolveOverlayPresentation("net-growth");
    const negative = projectOverlayScalar(presentation, -2, -2, 2);
    const neutral = projectOverlayScalar(presentation, 0, -2, 2);
    const positive = projectOverlayScalar(presentation, 2, -2, 2);

    expect(negative.visible).toBe(true);
    expect(neutral.visible).toBe(true);
    expect(positive.visible).toBe(true);
    expect(negative.normalized).toBe(-1);
    expect(neutral.normalized).toBe(0);
    expect(positive.normalized).toBe(1);
    expect(negative.color).not.toBe(positive.color);
    expect(negative.patternToken).toBe("diagonal-back");
    expect(positive.patternToken).toBe("diagonal-forward");
    expect(neutral.patternToken).toBe("neutral-grid");
  });

  it("keeps pattern modulation deterministic and bounded", () => {
    const first = overlayPatternMultiplier("speckle", 7, 11);
    expect(first).toBe(overlayPatternMultiplier("speckle", 7, 11));
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThanOrEqual(1);
  });

  it("labels uncertainty as source-defined uncertainty rather than confidence", () => {
    const presentation = resolveOverlayPresentation("uncertainty");
    expect(presentation.legendSemantics).toMatch(/source-defined uncertainty/i);
    expect(presentation.legendSemantics).not.toMatch(/confidence/i);
  });

  it("fails visibly for unknown overlay kinds", () => {
    expect(() => resolveOverlayPresentation("mystery")).toThrow(
      /unsupported overlay kind/,
    );

    const base = createRendererDemoSnapshot(12);
    const invalid = {
      ...base,
      fields: [
        {
          ...base.fields[0]!,
          kind: "mystery" as OverlayKind,
        },
      ],
    };

    expect(() => validateRenderSnapshot(invalid)).toThrow(
      /unsupported overlay kind/,
    );
  });
});
