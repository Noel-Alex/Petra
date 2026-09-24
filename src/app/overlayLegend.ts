import type { RenderField } from "../render/model";
import {
  resolveOverlayPresentation,
  type OverlayPatternToken,
  type OverlayTransferKind,
} from "../render/overlayPresentation";

export interface DishOverlayLegendPresentation {
  readonly transfer: OverlayTransferKind;
  readonly pattern: OverlayPatternToken;
  readonly scaleLabel: string;
  readonly swatchBackground: string;
}

export function resolveDishOverlayLegend(
  field: RenderField,
): DishOverlayLegendPresentation {
  const spec = resolveOverlayPresentation(field.kind);
  const swatchBackground =
    spec.transfer === "diverging-zero"
      ? `linear-gradient(90deg, ${cssColor(spec.negativeColor ?? spec.color)} 0%, ${cssColor(spec.neutralColor ?? spec.color)} 50%, ${cssColor(spec.positiveColor ?? spec.color)} 100%)`
      : cssColor(spec.color);

  return {
    transfer: spec.transfer,
    pattern: spec.pattern,
    scaleLabel: spec.legendScale,
    swatchBackground,
  };
}

function cssColor(color: number): string {
  if (!Number.isInteger(color) || color < 0 || color > 0xffffff) {
    throw new RangeError("overlay color must be a 24-bit integer");
  }
  return `#${color.toString(16).padStart(6, "0")}`;
}
