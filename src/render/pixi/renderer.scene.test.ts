import { describe, expect, it } from "vitest";
import rendererSource from "./renderer.ts?raw";

describe("Pixi dish aperture scene contract", () => {
  it("keeps scientific layers under one shared circular mask and vessel chrome outside it", () => {
    expect(rendererSource).toContain("const dishInteriorMask = new Graphics()");
    expect(rendererSource).toContain("const dataLayer = new Container()");
    expect(rendererSource).toContain(
      "dataLayer.addChild(fieldLayer, densityLayer, glyphLayer)",
    );
    expect(rendererSource).toContain("dataLayer.mask = dishInteriorMask");
    expect(rendererSource).toContain(
      "root.addChild(plateLayer, dishInteriorMask, dataLayer, accentLayer)",
    );
    expect(rendererSource).toContain(
      ".circle(geometry.centerX, geometry.centerY, geometry.radius)",
    );
  });

  it("routes sequential nutrient/drug fields through deterministic contour extraction", () => {
    expect(rendererSource).toContain(
      'import { extractFieldContourSegments } from "../fieldContours"',
    );
    expect(rendererSource).toContain("const contours = extractFieldContourSegments({");
    expect(rendererSource).toContain("dishMask: snapshot.dishMask");
    expect(rendererSource).toContain(".lineTo(to.x, to.y)");
  });
});
