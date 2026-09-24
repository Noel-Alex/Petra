import { describe, expect, it } from "vitest";
import { planSurfaceTransition } from "../../src/ui/motion/semanticTransitions";
import {
  SEMANTIC_ZOOM_GUIDE,
  semanticZoomGuideMotionCss,
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

  it("uses shared motion policy for semantic-guide emphasis", () => {
    expect(semanticZoomGuideMotionCss("full")).toEqual({
      duration: "160ms",
      easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      treatment: "animate",
    });
    expect(semanticZoomGuideMotionCss("reduced").duration).toBe("0ms");
    expect(semanticZoomGuideMotionCss("reduced").treatment).toBe("instant");
    expect(semanticZoomGuideMotionCss("off").duration).toBe("0ms");
    expect(semanticZoomGuideMotionCss("off").treatment).toBe("instant");
  });

  it("labels representative-cell zoom as illustrative rather than literal microscopy", () => {
    const cellStory = SEMANTIC_ZOOM_GUIDE.find(
      (entry) => entry.id === "representative-cell",
    );

    expect(cellStory?.meaning).toContain("illustrative");
    expect(cellStory?.meaning).toContain("not literal microscopy");
  });
});
