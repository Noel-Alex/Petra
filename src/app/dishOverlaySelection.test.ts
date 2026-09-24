import { describe, expect, it } from "vitest";
import { createRendererDemoSnapshot } from "../render/pixi/demoSnapshot";
import {
  AUTOMATIC_DISH_OVERLAY,
  NO_DISH_OVERLAY,
  resolveDishOverlaySelection,
  selectDishOverlayField,
} from "./dishOverlaySelection";

describe("dish overlay selection identity", () => {
  it("keeps automatic and explicit no-overlay as distinct identities", () => {
    const snapshot = createRendererDemoSnapshot(24);

    const automatic = resolveDishOverlaySelection(
      snapshot,
      AUTOMATIC_DISH_OVERLAY,
    );
    const none = resolveDishOverlaySelection(snapshot, NO_DISH_OVERLAY);

    expect(automatic).toMatchObject({
      effective: { mode: "automatic" },
      reason: "automatic",
      field: { id: "demo-antibiotic" },
    });
    expect(none).toEqual({
      requested: NO_DISH_OVERLAY,
      effective: NO_DISH_OVERLAY,
      field: null,
      reason: "none",
    });
  });

  it("resolves a specific source field without changing its metadata", () => {
    const snapshot = createRendererDemoSnapshot(24);
    const resolved = resolveDishOverlaySelection(
      snapshot,
      selectDishOverlayField("demo-nutrient"),
    );

    expect(resolved).toMatchObject({
      effective: { mode: "field", fieldId: "demo-nutrient" },
      reason: "field",
      field: {
        id: "demo-nutrient",
        label: "Nutrient",
        unit: "demo normalized",
      },
    });
  });

  it("reconciles a disappeared selected field to automatic", () => {
    const snapshot = createRendererDemoSnapshot(24);
    const requested = selectDishOverlayField("field-that-disappeared");

    const resolved = resolveDishOverlaySelection(snapshot, requested);

    expect(resolved).toMatchObject({
      requested: {
        mode: "field",
        fieldId: "field-that-disappeared",
      },
      effective: { mode: "automatic" },
      reason: "field-missing",
      field: { id: "demo-antibiotic" },
    });

    const later = resolveDishOverlaySelection(snapshot, resolved.effective);
    expect(later.effective).toEqual(AUTOMATIC_DISH_OVERLAY);
    expect(later.reason).toBe("automatic");
  });

  it("preserves explicit no-overlay across ordinary snapshot updates", () => {
    const first = createRendererDemoSnapshot(24);
    const second = createRendererDemoSnapshot(32);

    const firstResolution = resolveDishOverlaySelection(
      first,
      NO_DISH_OVERLAY,
    );
    const secondResolution = resolveDishOverlaySelection(
      second,
      firstResolution.effective,
    );

    expect(secondResolution.effective).toEqual(NO_DISH_OVERLAY);
    expect(secondResolution.field).toBeNull();
    expect(secondResolution.reason).toBe("none");
  });

  it("keeps automatic identity even when a snapshot has no fields", () => {
    const snapshot = createRendererDemoSnapshot(24);
    const withoutFields = { ...snapshot, fields: [] };

    const resolved = resolveDishOverlaySelection(
      withoutFields,
      AUTOMATIC_DISH_OVERLAY,
    );

    expect(resolved.effective).toEqual(AUTOMATIC_DISH_OVERLAY);
    expect(resolved.field).toBeNull();
    expect(resolved.reason).toBe("automatic");
  });

  it("rejects blank specific field identities", () => {
    expect(() => selectDishOverlayField("   ")).toThrow(
      "dish overlay field id must be non-empty",
    );
  });
});
