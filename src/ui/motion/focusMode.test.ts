import { describe, expect, it } from "vitest";
import { resolveDishFocusPresentation } from "./focusMode";

describe("dish focus presentation", () => {
  it("makes the dish primary and compacts surrounding chrome", () => {
    expect(resolveDishFocusPresentation("focus", "full")).toMatchObject({
      mode: "focus",
      dishPriority: "primary",
      sideChrome: "collapsed",
      timelineDensity: "compact",
      treatment: "animate",
      durationMs: 220,
      ariaLabel: "Dish focus mode",
      presentationOnly: true,
    });
  });

  it("uses a short non-spatial treatment for reduced motion", () => {
    expect(resolveDishFocusPresentation("focus", "reduced")).toMatchObject({
      treatment: "crossfade",
      durationMs: 150,
      sideChrome: "collapsed",
    });
  });

  it("settles immediately when motion is off", () => {
    expect(resolveDishFocusPresentation("workspace", "off")).toMatchObject({
      treatment: "instant",
      durationMs: 0,
      dishPriority: "balanced",
      sideChrome: "expanded",
      timelineDensity: "full",
    });
  });

  it("rejects unknown presentation modes at runtime", () => {
    expect(() =>
      resolveDishFocusPresentation(
        "cinematic" as never,
        "full",
      ),
    ).toThrow(/unknown dish focus mode/);
  });
});
