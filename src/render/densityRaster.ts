import { resolveLineageAppearance } from "./lineageAppearance";
import type { DishVisualState } from "./visualInterpolation";

/** Linear-filtered display texture. No opacity floor for vanishing density. */
export function writeDensityRaster(snapshot: DishVisualState, maximum: number, output: Uint8ClampedArray): void {
  const cells = snapshot.gridWidth * snapshot.gridHeight;
  if (output.length !== cells * 4) throw new RangeError("density raster dimensions disagree");
  output.fill(0);
  if (maximum <= 0) return;
  for (const lineage of snapshot.lineages) {
    const color = resolveLineageAppearance(lineage.appearanceToken).color;
    const r = (color >> 16) & 255, g = (color >> 8) & 255, b = color & 255;
    for (let index = 0; index < cells; index++) {
      if (snapshot.dishMask[index] !== 1) continue;
      const alpha = Math.min(1, (lineage.density[index] ?? 0) / maximum) * .65;
      if (alpha < 1 / 255) continue;
      const pixel = index * 4;
      const oldAlpha = output[pixel + 3]! / 255;
      const combined = alpha + oldAlpha * (1 - alpha);
      output[pixel] = (r * alpha + output[pixel]! * oldAlpha * (1 - alpha)) / combined;
      output[pixel + 1] = (g * alpha + output[pixel + 1]! * oldAlpha * (1 - alpha)) / combined;
      output[pixel + 2] = (b * alpha + output[pixel + 2]! * oldAlpha * (1 - alpha)) / combined;
      output[pixel + 3] = combined * 255;
    }
  }
}
