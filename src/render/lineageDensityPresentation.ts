import type { DishRenderSnapshot } from "./model";

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
  snapshot: DishRenderSnapshot,
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
