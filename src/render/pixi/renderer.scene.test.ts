import { describe, expect, it } from "vitest";
import rendererSource from "./renderer.ts?raw";

describe("Pixi dish aperture scene contract", () => {
  it("keeps scientific layers under one shared circular mask and vessel chrome outside it", () => {
    expect(rendererSource).toContain("const dishInteriorMask = new Graphics()");
    expect(rendererSource).toContain("const dataLayer = new Container()");
    expect(rendererSource).toContain(
      "dataLayer.addChild(fieldLayer, densityLayer, hyphalLayer, glyphLayer)",
    );
    expect(rendererSource).toContain("dataLayer.mask = dishInteriorMask");
    expect(rendererSource).toContain("const hyphalLayer = new Graphics()");
    expect(rendererSource).toContain('resolvePetraVectorPrimitive("hyphal-path")');
    expect(rendererSource).toContain('phase: "fungal-branch"');
    expect(rendererSource).toContain('evidence: "authoritative-state"');
    expect(rendererSource).toContain("drawHyphalPath(");
    expect(rendererSource).toContain(
      "root.addChild(plateLayer, dishInteriorMask, dataLayer, accentLayer)",
    );
    expect(rendererSource).toContain(
      ".circle(geometry.centerX, geometry.centerY, geometry.radius)",
    );
  });
});
