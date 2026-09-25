import type { DishRenderSnapshot } from "./model";
import {
  LINEAGE_DENSITY_PRESENTATION_SCALE_SCHEMA_VERSION,
  lineageDensityPresentationMaximum,
  validateLineageDensityPresentationScale,
  type LineageDensityPresentationScale,
  type SnapshotExtremaLineageDensityPresentationScale,
} from "./lineageDensityScale";
import type { DishVisualState } from "./visualInterpolation";

export interface LineageDensityPresentation {
  readonly visible: boolean;
  readonly normalized: number;
}

/**
 * Finds one comparable presentation scale for every lineage in a snapshot.
 *
 * Render lineage channels are sibling aggregate biomass/density channels on the
 * same snapshot scale. Only values inside the authoritative dish mask
 * participate in the denominator; renderer geometry never changes this source
 * truth.
 */
export function resolveSharedLineageDensityMaximum(
  snapshot: DishVisualState,
): number {
  let maximum = 0;

  for (const lineage of snapshot.lineages) {
    for (let index = 0; index < lineage.density.length; index += 1) {
      if (snapshot.dishMask[index] !== 1) continue;

      const weight = lineage.density[index] ?? 0;
      assertFiniteNonNegative("lineage density", weight);
      maximum = Math.max(maximum, weight);
    }
  }

  return maximum;
}


/**
 * Build the explicit non-temporally-comparable fallback contract for a single
 * exact render snapshot. Product composed runs should supply source-owned-fixed
 * authority instead.
 */
export function createSnapshotExtremaLineageDensityPresentationScale(
  snapshot: DishRenderSnapshot,
  unit: string,
): SnapshotExtremaLineageDensityPresentationScale {
  const scale: SnapshotExtremaLineageDensityPresentationScale = {
    schemaVersion: LINEAGE_DENSITY_PRESENTATION_SCALE_SCHEMA_VERSION,
    mode: "snapshot-extrema",
    unit,
    maximum: resolveSharedLineageDensityMaximum(snapshot),
    snapshotId: snapshot.snapshotId,
  };
  validateLineageDensityPresentationScale(scale);
  return Object.freeze(scale);
}

/**
 * Resolve the denominator for one drawable state from an explicit scale
 * contract. Fixed source authority is O(1); snapshot-extrema fallback retains
 * the legacy scan and verifies exact keyframe metadata when possible.
 */
export function resolveDeclaredLineageDensityPresentationMaximum(
  snapshot: DishVisualState,
  scale: LineageDensityPresentationScale,
): number {
  validateLineageDensityPresentationScale(scale);
  if (scale.mode === "source-owned-fixed") {
    return lineageDensityPresentationMaximum(scale);
  }

  const exactSnapshotId =
    "snapshotId" in snapshot &&
    typeof (snapshot as { readonly snapshotId?: unknown }).snapshotId === "string"
      ? (snapshot as { readonly snapshotId: string }).snapshotId
      : null;
  if (exactSnapshotId !== null && scale.snapshotId !== exactSnapshotId) {
    throw new Error(
      "snapshot-extrema lineage density scale does not match drawable snapshot identity",
    );
  }

  const observed = resolveSharedLineageDensityMaximum(snapshot);
  if (exactSnapshotId !== null && observed !== scale.maximum) {
    throw new Error(
      "snapshot-extrema lineage density scale maximum does not match drawable snapshot",
    );
  }
  return observed;
}

/**
 * Maps comparable source density into a dimensionless visual intensity.
 *
 * Square-root compression preserves useful display dynamic range without
 * equalizing a rare lineage to the dominant lineage. This result is
 * presentation-only and must never feed back into scientific state/metrics.
 */
export function projectComparableLineageDensity(
  weight: number,
  sharedMaximum: number,
): LineageDensityPresentation {
  assertFiniteNonNegative("lineage density", weight);
  assertFiniteNonNegative("shared lineage density maximum", sharedMaximum);

  if (weight === 0 || sharedMaximum === 0) {
    return { visible: false, normalized: 0 };
  }

  return {
    visible: true,
    normalized: Math.sqrt(Math.min(1, weight / sharedMaximum)),
  };
}

function assertFiniteNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be finite and non-negative`);
  }
}
