import type { RenderField } from "./model";
import type { DishVisualState } from "./visualInterpolation";
import { overlayPatternMultiplier, projectOverlayScalar, resolveOverlayPresentation } from "./overlayPresentation";

/** One field texture, preserving the shared transfer and non-color pattern. */
export function writeFieldRaster(snapshot: DishVisualState, field: RenderField | null, output: Uint8ClampedArray): void {
  const cells = snapshot.gridWidth * snapshot.gridHeight;
  if (output.length !== cells * 4) throw new RangeError("field raster dimensions disagree");
  output.fill(0);
  if (field === null) return;
  const presentation = resolveOverlayPresentation(field.kind);
  for (let index = 0; index < cells; index++) {
    if (snapshot.dishMask[index] !== 1) continue;
    const projected = projectOverlayScalar(presentation, field.values[index] ?? field.minimum, field.minimum, field.maximum);
    if (!projected.visible) continue;
    const pixel = index * 4;
    output[pixel] = (projected.color >> 16) & 255;
    output[pixel + 1] = (projected.color >> 8) & 255;
    output[pixel + 2] = projected.color & 255;
    output[pixel + 3] = 255 * projected.alpha * overlayPatternMultiplier(projected.patternToken, Math.floor(index / snapshot.gridWidth), index % snapshot.gridWidth);
  }
}
