import { describe, expect, it } from "vitest";
import {
  planPanelCssTransition,
  planSurfaceCssTransition,
} from "./surfaceCss";

describe("surface CSS transition adapter", () => {
  it("projects full panel motion from the shared planner", () => {
    expect(planPanelCssTransition("full")).toEqual({
      treatment: "animate",
      durationCss: "220ms",
      easingCss: "cubic-bezier(0.16, 1, 0.3, 1)",
      keepMountedDuringExit: false,
    });
  });

  it("does not reintroduce spatial travel for reduced or off motion", () => {
    expect(planPanelCssTransition("reduced")).toMatchObject({
      treatment: "instant",
      durationCss: "0ms",
    });
    expect(planPanelCssTransition("off")).toMatchObject({
      treatment: "instant",
      durationCss: "0ms",
    });
  });

  it("preserves the planner's exit lifecycle decision", () => {
    expect(
      planSurfaceCssTransition({
        surface: "overlay",
        action: "hide",
        preference: "full",
      }),
    ).toMatchObject({
      treatment: "animate",
      durationCss: "220ms",
      keepMountedDuringExit: true,
    });
  });
});
