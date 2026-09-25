import { projectColonyMassAlpha } from "./colonyMassPresentation";
import { resolveLineageAppearance } from "./lineageAppearance";
import type { DishVisualState } from "./visualInterpolation";

/**
 * Dense colony mass opacity is presentation engineering only. The scientific
 * quantity remains the source lineage density; this cap controls only how much
 * of the lineage color is composited into the linearly filtered display raster.
 */
export const COLONY_MASS_RASTER_MAX_ALPHA = 0.86;

/**
 * Linear-filtered display texture for authoritative lineage density.
 *
 * Each lineage uses the same snapshot-wide density denominator. Exact source
 * zero stays transparent; the continuous colony-mass transfer suppresses sparse
 * noise while making dense, contiguous source regions read as coherent masses.
 * There is no renderer-side biological merge, dilation, blur, or cell-count
 * interpretation.
 */
export function writeDensityRaster(
  snapshot: DishVisualState,
  maximum: number,
  output: Uint8ClampedArray,
): void {
  const cells = snapshot.gridWidth * snapshot.gridHeight;
  if (output.length !== cells * 4) {
    throw new RangeError("density raster dimensions disagree");
  }
  output.fill(0);
  if (maximum <= 0) return;

  for (const lineage of snapshot.lineages) {
    const color = resolveLineageAppearance(lineage.appearanceToken).color;
    const r = (color >> 16) & 255;
    const g = (color >> 8) & 255;
    const b = color & 255;

    for (let index = 0; index < cells; index += 1) {
      if (snapshot.dishMask[index] !== 1) continue;

      const massAlpha =
        projectColonyMassAlpha(lineage.density[index] ?? 0, maximum) *
        COLONY_MASS_RASTER_MAX_ALPHA;
      if (massAlpha < 1 / 255) continue;

      const pixel = index * 4;
      const oldAlpha = output[pixel + 3]! / 255;
      const combined = massAlpha + oldAlpha * (1 - massAlpha);
      output[pixel] =
        (r * massAlpha +
          output[pixel]! * oldAlpha * (1 - massAlpha)) /
        combined;
      output[pixel + 1] =
        (g * massAlpha +
          output[pixel + 1]! * oldAlpha * (1 - massAlpha)) /
        combined;
      output[pixel + 2] =
        (b * massAlpha +
          output[pixel + 2]! * oldAlpha * (1 - massAlpha)) /
        combined;
      output[pixel + 3] = combined * 255;
    }
  }
}
