import { describe, expect, it } from "vitest";
import { writeDensityRaster } from "./densityRaster";
import { writeFieldRaster } from "./fieldRaster";
import { createRendererDemoSnapshot } from "./pixi/demoSnapshot";
import { projectOverlayScalar, resolveOverlayPresentation, overlayPatternMultiplier } from "./overlayPresentation";

function fixture() {
  const base = createRendererDemoSnapshot(12);
  const density = new Float32Array(144);
  density.set([0, 1e-12, 1, 2, 2]);
  const dishMask = new Uint8Array(144).fill(1); dishMask[4] = 0;
  return { ...base, dishMask, lineages: [{ ...base.lineages[0]!, density }] };
}

describe("bounded density and overlay textures", () => {
  it("preserves concentration, masks, zero, and vanishing density without an opacity floor", () => {
    const state = fixture(), output = new Uint8ClampedArray(144 * 4);
    writeDensityRaster(state, 2, output);
    expect(output[3]).toBe(0); expect(output[7]).toBe(0);
    expect(output[11]).toBe(83); expect(output[15]).toBe(166); expect(output[19]).toBe(0);
    expect(state.lineages[0]!.density[3]).toBe(2);
  });
  it("clears reusable storage and rejects a mismatched buffer", () => {
    const state = fixture(), output = new Uint8ClampedArray(144 * 4).fill(255);
    writeDensityRaster(state, 0, output);
    expect(output.every(value => value === 0)).toBe(true);
    expect(() => writeDensityRaster(state, 1, new Uint8ClampedArray(4))).toThrow();
  });
  it("keeps dense overlays on the same transfer and pattern policy as the legend", () => {
    const state = fixture(), field = state.fields[0]!, output = new Uint8ClampedArray(144 * 4);
    writeFieldRaster(state, field, output);
    for (let i = 0; i < 144; i++) {
      const projected = projectOverlayScalar(resolveOverlayPresentation(field.kind), field.values[i]!, field.minimum, field.maximum);
      const expected = state.dishMask[i] === 1 && projected.visible ? 255 * projected.alpha * overlayPatternMultiplier(projected.patternToken, Math.floor(i / 12), i % 12) : 0;
      expect(output[i * 4 + 3]).toBe(new Uint8ClampedArray([expected])[0]);
    }
    writeFieldRaster(state, null, output);
    expect(output.every(value => value === 0)).toBe(true);
  });
});
