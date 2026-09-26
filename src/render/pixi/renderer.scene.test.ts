import { describe, expect, it } from "vitest";
import rawRendererSource from "./renderer.ts?raw";

const rendererSource = rawRendererSource.replace(/\r\n/g, "\n");

describe("Pixi dish aperture scene contract", () => {
  it("keeps scientific layers under one shared circular mask and vessel chrome outside it", () => {
    expect(rendererSource).toContain("const dishInteriorMask = new Graphics()");
    expect(rendererSource).toContain("const dataLayer = new Container()");
    expect(rendererSource).toContain(
      "const preparedCameraLayer = new Container()",
    );
    expect(rendererSource).toContain(
      "preparedCameraLayer.addChild(\n    fieldSprite,\n    fieldLayer,\n    densitySprite,\n    densityLayer,\n  )",
    );
    expect(rendererSource).toContain(
      "dataLayer.addChild(preparedCameraLayer, glyphLayer)",
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
    expect(rendererSource).toContain("extractFieldContourSegments({");
    expect(rendererSource).toContain("dishMask: drawableState!.dishMask");
    expect(rendererSource).toContain(".lineTo(to.x, to.y)");
  });

  it("draws shared-scale lineage density contours with existing pattern geometry", () => {
    expect(rendererSource).toContain(
      'import { extractLineageDensityContourSegments } from "../lineageDensityContours"',
    );
    expect(rendererSource).toContain(
      "const contours = extractLineageDensityContourSegments({",
    );
    expect(rendererSource).toContain("sharedMaximum: maximum");
    expect(rendererSource).toContain(
      "const contourPattern = resolveLineagePattern(patternToken)",
    );
    expect(rendererSource).toContain("color: LINEAGE_PATTERN_COLOR");
  });
});
