import {
  DEFAULT_COLONY_MASS_PRESENTATION_POLICY,
  projectColonyMassAlpha,
  type ColonyMassPresentationPolicy,
} from "./colonyMass";
import { resolveLineageAppearance } from "./lineageAppearance";
import type { DishVisualState } from "./visualInterpolation";

/**
 * Writes one bounded RGBA colony-mass texture from all lineage density channels.
 *
 * The caller supplies one snapshot-wide lineage-density maximum, so rare
 * lineages cannot self-normalize to dominant opacity. Linear texture filtering
 * may visually soften/merge adjacent support after upload, but this raster never
 * creates one render object per occupied cell.
 */
export function writeDensityRaster(
  snapshot: DishVisualState,
  maximum: number,
  output: Uint8ClampedArray,
  policy: ColonyMassPresentationPolicy =
    DEFAULT_COLONY_MASS_PRESENTATION_POLICY,
): void {
  const cells = snapshot.gridWidth * snapshot.gridHeight;
  if (output.length !== cells * 4) {
    throw new RangeError("density raster dimensions disagree");
  }

  output.fill(0);
  for (const lineage of snapshot.lineages) {
    const color = resolveLineageAppearance(lineage.appearanceToken).color;
    const r = (color >> 16) & 255;
    const g = (color >> 8) & 255;
    const b = color & 255;

    for (let index = 0; index < cells; index += 1) {
      if (snapshot.dishMask[index] !== 1) continue;

      const alpha = projectColonyMassAlpha(
        lineage.density[index] ?? 0,
        maximum,
        policy,
      );
      if (alpha < 1 / 255) continue;

      const pixel = index * 4;
      const oldAlpha = output[pixel + 3]! / 255;
      const combined = alpha + oldAlpha * (1 - alpha);
      output[pixel] =
        (r * alpha + output[pixel]! * oldAlpha * (1 - alpha)) / combined;
      output[pixel + 1] =
        (g * alpha + output[pixel + 1]! * oldAlpha * (1 - alpha)) / combined;
      output[pixel + 2] =
        (b * alpha + output[pixel + 2]! * oldAlpha * (1 - alpha)) / combined;
      output[pixel + 3] = combined * 255;
    }
  }
}
