import { describe, expect, it } from "vitest";
import { validateRenderSnapshot } from "../model";
import { createRendererDemoSnapshot } from "./demoSnapshot";

describe("renderer demo snapshot", () => {
  it("is a valid presentation-only render snapshot", () => {
    const snapshot = createRendererDemoSnapshot(24);
    expect(() => validateRenderSnapshot(snapshot)).not.toThrow();
    expect(snapshot.fields.every((field) => field.unit === "demo normalized")).toBe(true);
    expect(snapshot.snapshotId).toContain("renderer-demo");
  });

  it("does not imply one glyph or density cell equals one bacterium", () => {
    const snapshot = createRendererDemoSnapshot(24);
    expect(snapshot.lineages.length).toBeGreaterThan(0);
    expect(snapshot.biomass.some((value) => value > 0)).toBe(true);
  });
});
