import { describe, expect, it } from "vitest";

import { resolveMicroInteraction } from "./microInteractions";

describe("resolveMicroInteraction", () => {
  it("uses named full-motion spatial emphasis", () => {
    expect(resolveMicroInteraction("hover", "full")).toMatchObject({
      translateYRem: -0.08,
      scale: 1,
      emphasis: "hover",
    });
    expect(resolveMicroInteraction("press", "full").scale).toBeLessThan(1);
  });

  it("removes spatial motion while preserving focus semantics in reduced mode", () => {
    expect(resolveMicroInteraction("focus", "reduced")).toMatchObject({
      translateYRem: 0,
      scale: 1,
      emphasis: "focus",
      showFocusRing: true,
    });
  });

  it("makes off-mode interactions static", () => {
    const presentation = resolveMicroInteraction("selected", "off");
    expect(presentation.durationMs).toBe(0);
    expect(presentation.translateYRem).toBe(0);
    expect(presentation.scale).toBe(1);
    expect(presentation.emphasis).toBe("selected");
  });

  it("keeps disabled controls static in every preference", () => {
    for (const preference of ["full", "reduced", "off"] as const) {
      expect(resolveMicroInteraction("disabled", preference)).toEqual({
        state: "disabled",
        durationMs: 0,
        translateYRem: 0,
        scale: 1,
        emphasis: "disabled",
        showFocusRing: false,
      });
    }
  });
});
