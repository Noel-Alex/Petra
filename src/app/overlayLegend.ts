import type { RenderField } from "../render/model";
import { resolveOverlayPresentation } from "../render/overlayPresentation";

export interface OverlayLegendView {
  readonly id: string;
  readonly kind: RenderField["kind"];
  readonly label: string;
  readonly unit: string;
  readonly transfer: "sequential" | "diverging";
  readonly patternToken: string;
  readonly negativeCssColor: string;
  readonly neutralCssColor: string;
  readonly positiveCssColor: string;
  readonly scaleText: string;
  readonly rangeText: string;
  readonly ariaLabel: string;
}

export function buildOverlayLegend(
  field: RenderField,
): OverlayLegendView {
  const presentation = resolveOverlayPresentation(field.kind);
  const rangeText =
    `${formatScalar(field.minimum)} to ${formatScalar(field.maximum)} ${field.unit}`;
  return {
    id: field.id,
    kind: field.kind,
    label: field.label,
    unit: field.unit,
    transfer: presentation.transfer,
    patternToken: presentation.legendPatternToken,
    negativeCssColor: presentation.negativeCssColor,
    neutralCssColor: presentation.neutralCssColor,
    positiveCssColor: presentation.positiveCssColor,
    scaleText: presentation.legendSemantics,
    rangeText,
    ariaLabel:
      `${field.label}. ${presentation.legendSemantics}. Source range ${rangeText}.`,
  };
}

function formatScalar(value: number): string {
  const magnitude = Math.abs(value);
  if ((magnitude !== 0 && magnitude < 0.001) || magnitude >= 10_000) {
    return value.toExponential(2);
  }
  return String(Number(value.toFixed(3)));
}
