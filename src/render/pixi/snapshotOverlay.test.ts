import { describe, expect, it } from "vitest";
import type { DishRenderSnapshot } from "../model";
import { createRendererDemoSnapshot } from "./demoSnapshot";
import { resolveSnapshotOverlayUpdate } from "./snapshotOverlay";

function snapshotWithFields(
  snapshotId: string,
  fieldIds: readonly string[],
): DishRenderSnapshot {
  const base = createRendererDemoSnapshot(12);
  return {
    ...base,
    snapshotId,
    fields: base.fields.filter((field) => fieldIds.includes(field.id)),
  };
}

describe("snapshot + overlay transaction", () => {
  const nutrientId = "demo-nutrient";
  const antibioticId = "demo-antibiotic";

  it("accepts an overlay that exists only in the incoming snapshot", () => {
    const oldSnapshot = snapshotWithFields("old", [nutrientId]);
    const nextSnapshot = snapshotWithFields("next", [antibioticId]);

    expect(
      resolveSnapshotOverlayUpdate(
        { snapshot: oldSnapshot, overlayId: nutrientId },
        nextSnapshot,
        antibioticId,
      ),
    ).toEqual({ snapshot: nextSnapshot, overlayId: antibioticId });
  });

  it("clears a previously valid selection when that overlay disappears", () => {
    const oldSnapshot = snapshotWithFields("old", [nutrientId]);
    const nextSnapshot = snapshotWithFields("next", [antibioticId]);

    expect(
      resolveSnapshotOverlayUpdate(
        { snapshot: oldSnapshot, overlayId: nutrientId },
        nextSnapshot,
        nutrientId,
      ),
    ).toEqual({ snapshot: nextSnapshot, overlayId: null });
  });

  it("keeps the same overlay when it remains available", () => {
    const oldSnapshot = snapshotWithFields("old", [nutrientId]);
    const nextSnapshot = snapshotWithFields("next", [
      nutrientId,
      antibioticId,
    ]);

    expect(
      resolveSnapshotOverlayUpdate(
        { snapshot: oldSnapshot, overlayId: nutrientId },
        nextSnapshot,
        nutrientId,
      ),
    ).toEqual({ snapshot: nextSnapshot, overlayId: nutrientId });
  });

  it("still rejects an unknown incoming overlay", () => {
    const oldSnapshot = snapshotWithFields("old", [nutrientId]);
    const nextSnapshot = snapshotWithFields("next", [antibioticId]);

    expect(() =>
      resolveSnapshotOverlayUpdate(
        { snapshot: oldSnapshot, overlayId: nutrientId },
        nextSnapshot,
        "missing-overlay",
      ),
    ).toThrow(/unknown render overlay: missing-overlay/);
  });
});
