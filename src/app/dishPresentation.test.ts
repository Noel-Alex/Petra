import { describe, expect, it } from "vitest";
import { createRendererDemoSnapshot } from "../render/pixi/demoSnapshot";
import {
  defaultDishOverlayId,
  resolveDishOverlay,
} from "./dishPresentation";

describe("dish presentation overlay selection", () => {
  it("prefers the antibiotic layer when the snapshot provides one", () => {
    const snapshot = createRendererDemoSnapshot(24);
    expect(defaultDishOverlayId(snapshot)).toBe("demo-antibiotic");
  });

  it("resolves explicit source metadata without inventing a unit", () => {
    const snapshot = createRendererDemoSnapshot(24);
    const field = resolveDishOverlay(snapshot, "demo-nutrient");

    expect(field?.label).toBe("Nutrient");
    expect(field?.unit).toBe("demo normalized");
  });

  it("falls back safely when a previous snapshot overlay no longer exists", () => {
    const snapshot = createRendererDemoSnapshot(24);
    expect(resolveDishOverlay(snapshot, "missing-layer")?.id).toBe(
      "demo-antibiotic",
    );
  });
});
