import type { DishRenderSnapshot } from "./model";

export const DISH_RENDER_SOURCE_KINDS = [
  "authoritative-snapshot",
  "visual-demo",
  "awaiting-authoritative-snapshot",
] as const;

export type DishRenderSourceKind =
  (typeof DISH_RENDER_SOURCE_KINDS)[number];

/**
 * Validates the presentation-source identity separately from snapshot presence.
 *
 * A snapshot object is not authority by itself: callers must explicitly label
 * whether it came from authoritative runtime state or the visual-only fixture.
 */
export function assertDishRenderSourceSnapshot(
  source: DishRenderSourceKind,
  snapshot: DishRenderSnapshot | null,
): void {
  if (source === "awaiting-authoritative-snapshot") {
    if (snapshot !== null) {
      throw new RangeError(
        "awaiting-authoritative-snapshot requires a null render snapshot",
      );
    }
    return;
  }

  if (snapshot === null) {
    throw new RangeError(
      `${source} requires an explicit render snapshot transaction`,
    );
  }
}
