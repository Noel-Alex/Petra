import { describe, expect, it } from "vitest";

import type { RenderField } from "../render/model";
import { resolveDishOverlayLegend } from "./overlayLegend";

function field(kind: RenderField["kind"]): RenderField {
  return {
    id: kind,
    kind,
    label: kind,
    unit: "model unit",
    width: 1,
    height: 1,
    values: new Float32Array([0]),
    minimum: kind === "net-growth" ? -1 : 0,
    maximum: 1,
  };
}

describe("dish overlay legend presentation", () => {
  it("uses the same sequential semantics as the renderer registry", () => {
    const legend = resolveDishOverlayLegend(field("nutrient"));

    expect(legend.transfer).toBe("sequential");
    expect(legend.scaleLabel).toMatch(/low.*high nutrient/i);
    expect(legend.swatchBackground).toBe("#f0bd4e");
  });

  it("makes signed net growth visibly zero-aware", () => {
    const legend = resolveDishOverlayLegend(field("net-growth"));

    expect(legend.transfer).toBe("diverging-zero");
    expect(legend.scaleLabel).toMatch(/negative.*0.*positive/i);
    expect(legend.swatchBackground).toMatch(/linear-gradient/i);
  });

  it("does not rename source-defined uncertainty as confidence", () => {
    const legend = resolveDishOverlayLegend(field("uncertainty"));

    expect(legend.scaleLabel).toMatch(/source-defined uncertainty/i);
    expect(legend.scaleLabel).not.toMatch(/confidence/i);
  });
});
