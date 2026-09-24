import { describe, expect, it } from "vitest";
import { createRendererDemoSnapshot } from "../render/pixi/demoSnapshot";
import {
  AUTOMATIC_DISH_OVERLAY,
  NO_DISH_OVERLAY,
  defaultDishOverlayId,
  dishOverlayFieldSelection,
  reconcileDishOverlaySelection,
  resolveDishOverlay,
  resolveDishOverlaySelection,
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

  it("keeps the legacy null helper fallback stable until adapter migration", () => {
    const snapshot = createRendererDemoSnapshot(24);
    expect(resolveDishOverlay(snapshot, "missing-layer")?.id).toBe(
      "demo-antibiotic",
    );
  });

  it("keeps automatic selection distinct from an explicit no-overlay choice", () => {
    const snapshot = createRendererDemoSnapshot(24);

    expect(resolveDishOverlaySelection(snapshot, AUTOMATIC_DISH_OVERLAY)).toEqual({
      selection: AUTOMATIC_DISH_OVERLAY,
      field: snapshot.fields.find((field) => field.id === "demo-antibiotic"),
      rendererOverlayId: "demo-antibiotic",
    });

    expect(resolveDishOverlaySelection(snapshot, NO_DISH_OVERLAY)).toEqual({
      selection: NO_DISH_OVERLAY,
      field: null,
      rendererOverlayId: null,
    });
  });

  it("resolves an explicit field identity without replacing source metadata", () => {
    const snapshot = createRendererDemoSnapshot(24);
    const resolved = resolveDishOverlaySelection(
      snapshot,
      dishOverlayFieldSelection("demo-nutrient"),
    );

    expect(resolved.selection).toEqual({
      mode: "field",
      fieldId: "demo-nutrient",
    });
    expect(resolved.field?.id).toBe("demo-nutrient");
    expect(resolved.field?.label).toBe("Nutrient");
    expect(resolved.field?.unit).toBe("demo normalized");
    expect(resolved.rendererOverlayId).toBe("demo-nutrient");
  });

  it("preserves explicit none across ordinary snapshot updates", () => {
    const snapshot = createRendererDemoSnapshot(24);
    const nextSnapshot = {
      ...snapshot,
      snapshotId: "next-snapshot",
    };

    const reconciled = reconcileDishOverlaySelection(
      nextSnapshot,
      NO_DISH_OVERLAY,
    );

    expect(reconciled).toBe(NO_DISH_OVERLAY);
    expect(resolveDishOverlaySelection(nextSnapshot, reconciled)).toMatchObject({
      selection: { mode: "none" },
      field: null,
      rendererOverlayId: null,
    });
  });

  it("moves a selected disappearing field to automatic instead of explicit none", () => {
    const snapshot = createRendererDemoSnapshot(24);
    const withoutNutrient = {
      ...snapshot,
      snapshotId: "without-nutrient",
      fields: snapshot.fields.filter((field) => field.id !== "demo-nutrient"),
    };

    const reconciled = reconcileDishOverlaySelection(
      withoutNutrient,
      dishOverlayFieldSelection("demo-nutrient"),
    );

    expect(reconciled).toBe(AUTOMATIC_DISH_OVERLAY);
    expect(resolveDishOverlaySelection(withoutNutrient, reconciled)).toMatchObject({
      selection: { mode: "automatic" },
      rendererOverlayId: "demo-antibiotic",
    });
  });

  it("does not silently restore an old field if it later reappears", () => {
    const snapshot = createRendererDemoSnapshot(24);
    const withoutNutrient = {
      ...snapshot,
      snapshotId: "without-nutrient",
      fields: snapshot.fields.filter((field) => field.id !== "demo-nutrient"),
    };

    const afterDisappearance = reconcileDishOverlaySelection(
      withoutNutrient,
      dishOverlayFieldSelection("demo-nutrient"),
    );
    const afterReappearance = reconcileDishOverlaySelection(
      snapshot,
      afterDisappearance,
    );

    expect(afterReappearance).toBe(AUTOMATIC_DISH_OVERLAY);
    expect(
      resolveDishOverlaySelection(snapshot, afterReappearance).rendererOverlayId,
    ).toBe("demo-antibiotic");
  });

  it("keeps automatic identity even when a snapshot has no fields", () => {
    const snapshot = createRendererDemoSnapshot(24);
    const noFields = {
      ...snapshot,
      snapshotId: "no-fields",
      fields: [],
    };

    expect(resolveDishOverlaySelection(noFields, AUTOMATIC_DISH_OVERLAY)).toEqual({
      selection: AUTOMATIC_DISH_OVERLAY,
      field: null,
      rendererOverlayId: null,
    });
  });

  it("rejects malformed explicit field identities", () => {
    expect(() => dishOverlayFieldSelection("")).toThrow(/non-empty/);
    expect(() => dishOverlayFieldSelection(" demo-nutrient ")).toThrow(
      /trimmed/,
    );
  });
});
