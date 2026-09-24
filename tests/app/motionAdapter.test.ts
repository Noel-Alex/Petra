import { describe, expect, it } from "vitest";
import { planSurfaceTransition } from "../../src/ui/motion/semanticTransitions";
import {
  SEMANTIC_ZOOM_GUIDE,
  surfaceMotionCss,
} from "../../src/app/motionAdapter";

describe("app motion adapter", () => {
  it("projects the shared full-motion surface plan into CSS tokens", () => {
    const css = surfaceMotionCss(
      planSurfaceTransition({
        surface: "panel",
        action: "show",
        preference: "full",
      }),
    );

    expect(css).toEqual({
      duration: "220ms",
      easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      treatment: "animate",
    });
  });

  it("keeps reduced/off chrome free of travel animation", () => {
    const reduced = surfaceMotionCss(
      planSurfaceTransition({
        surface: "overlay",
        action: "show",
        preference: "reduced",
      }),
    );
    const off = surfaceMotionCss(
      planSurfaceTransition({
        surface: "panel",
        action: "show",
        preference: "off",
      }),
    );

    expect(reduced.duration).toBe("0ms");
    expect(reduced.treatment).toBe("instant");
    expect(off.duration).toBe("0ms");
    expect(off.treatment).toBe("instant");
  });

  it("labels representative-cell zoom as illustrative rather than literal microscopy", () => {
    const cellStory = SEMANTIC_ZOOM_GUIDE.find(
      (entry) => entry.id === "representative-cell",
    );

    expect(cellStory?.meaning).toContain("illustrative");
    expect(cellStory?.meaning).toContain("not literal microscopy");
  });
});
