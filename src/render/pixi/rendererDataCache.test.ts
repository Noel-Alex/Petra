import { describe, expect, it } from "vitest";
import rendererSource from "./renderer.ts?raw";

describe("Pixi dish data-space cache integration", () => {
  it("keeps camera-only redraws off full-grid raster and contour preparation", () => {
    expect(rendererSource).toContain(
      'import { createDishSceneDataCache } from "./sceneDataCache"',
    );
    expect(rendererSource).toContain("let visualStateRevision = 0");
    expect(rendererSource).toContain(
      "sceneDataCache.resolve(drawableState, visualStateRevision, overlayId)",
    );
    expect(rendererSource).toContain(
      "if (densityTextureRevision === visualStateRevision) return;",
    );
    expect(rendererSource).toContain(
      "fieldTextureRevision === visualStateRevision",
    );
  });

  it("marks interpolation and authoritative snapshot changes as data-dirty", () => {
    expect(rendererSource).toContain("const markVisualStateChanged = () =>");
    expect(rendererSource).toContain("drawableState = step.state;\n      markVisualStateChanged();");
    expect(rendererSource).toContain("drawableState = next.snapshot;\n    markVisualStateChanged();");
  });
});
