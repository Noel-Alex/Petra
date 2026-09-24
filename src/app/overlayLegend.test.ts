import { describe, expect, it } from "vitest";
import type { RenderField } from "../render/model";
import { buildOverlayLegend } from "./overlayLegend";

function field(
  kind: RenderField["kind"],
  unit = "arbitrary authoritative unit",
): RenderField {
  return {
    id: `field-${kind}`,
    kind,
    label: `Field ${kind}`,
    unit,
    width: 1,
    height: 1,
    values: new Float32Array([0]),
    minimum: kind === "net-growth" ? -2 : 0,
    maximum: 2,
  };
}

describe("overlay legend projection", () => {
  it("preserves source label, unit and numeric range", () => {
    const legend = buildOverlayLegend(field("nutrient", "mmol/L"));
    expect(legend.label).toBe("Field nutrient");
    expect(legend.unit).toBe("mmol/L");
    expect(legend.rangeText).toBe("0 to 2 mmol/L");
  });

  it("describes net growth as a signed diverging scale", () => {
    const legend = buildOverlayLegend(field("net-growth", "1/h"));
    expect(legend.transfer).toBe("diverging");
    expect(legend.scaleText).toMatch(/negative loss/i);
    expect(legend.scaleText).toMatch(/zero neutral/i);
    expect(legend.scaleText).toMatch(/positive growth/i);
    expect(legend.rangeText).toBe("-2 to 2 1/h");
  });

  it("never relabels uncertainty as confidence", () => {
    const legend = buildOverlayLegend(field("uncertainty"));
    expect(legend.scaleText).toMatch(/source-defined uncertainty/i);
    expect(legend.ariaLabel).not.toMatch(/confidence/i);
  });
});
