import { describe, expect, it } from "vitest";
import {
  planSemanticTransition,
  planSurfaceTransition,
} from "./semanticTransitions";

describe("semantic transition planner", () => {
  it("uses named camera motion for full-motion semantic zoom", () => {
    const plan = planSemanticTransition({
      from: "dish",
      to: "colony",
      preference: "full",
      focusTargetId: "colony:alpha",
    });

    expect(plan).toMatchObject({
      treatment: "animate",
      durationMs: 520,
      preserveFocusTarget: true,
      focusTargetId: "colony:alpha",
      hide: ["dish"],
      reveal: ["colony"],
      representativeViewIsIllustrative: false,
      ariaLabel: "Colony view",
    });
  });

  it("crossfades navigational changes in reduced motion", () => {
    const plan = planSemanticTransition({
      from: "dish",
      to: "representative-cell",
      preference: "reduced",
      focusTargetId: "region:12",
    });

    expect(plan.treatment).toBe("crossfade");
    expect(plan.durationMs).toBe(150);
    expect(plan.preserveFocusTarget).toBe(true);
    expect(plan.representativeViewIsIllustrative).toBe(true);
    expect(plan.ariaLabel).toContain("explanatory");
  });

  it("makes semantic navigation instant when motion is off", () => {
    const plan = planSemanticTransition({
      from: "colony",
      to: "dish",
      preference: "off",
    });

    expect(plan.treatment).toBe("instant");
    expect(plan.durationMs).toBe(0);
    expect(plan.preserveFocusTarget).toBe(false);
  });

  it("does not animate a no-op view request", () => {
    const plan = planSemanticTransition({
      from: "colony",
      to: "colony",
      preference: "full",
      focusTargetId: "colony:alpha",
    });

    expect(plan.treatment).toBe("instant");
    expect(plan.durationMs).toBe(0);
    expect(plan.hide).toEqual([]);
    expect(plan.reveal).toEqual([]);
  });

  it("suppresses panel travel outside full motion", () => {
    expect(
      planSurfaceTransition({
        surface: "panel",
        action: "show",
        preference: "reduced",
      }),
    ).toMatchObject({
      treatment: "instant",
      durationMs: 0,
      keepMountedDuringExit: false,
    });

    expect(
      planSurfaceTransition({
        surface: "overlay",
        action: "hide",
        preference: "off",
      }),
    ).toMatchObject({
      treatment: "instant",
      durationMs: 0,
      keepMountedDuringExit: false,
    });
  });

  it("keeps an animated surface mounted through full-motion exit", () => {
    expect(
      planSurfaceTransition({
        surface: "panel",
        action: "hide",
        preference: "full",
      }),
    ).toMatchObject({
      treatment: "animate",
      durationMs: 220,
      keepMountedDuringExit: true,
    });
  });
});
