export const CALM_VECTOR_PALETTE = {
  ink: "#0f171b",
  inkPanel: "#172329",
  inkRaised: "#1d2d31",
  inkEdge: "#34464a",
  cream: "#eadfc8",
  mist: "#aebbb2",
  slate: "#748681",
  teal: "#5f9d8f",
  mint: "#91bea0",
  amber: "#d2a25d",
  coral: "#c97868",
  olive: "#7f8f60",
} as const;

export type CalmVectorTone =
  | "cream"
  | "mist"
  | "teal"
  | "mint"
  | "amber"
  | "coral"
  | "olive";

export type CalmVectorCssVariable =
  | "--petra-calm-ink"
  | "--petra-calm-ink-panel"
  | "--petra-calm-ink-raised"
  | "--petra-calm-ink-edge"
  | "--petra-calm-cream"
  | "--petra-calm-mist"
  | "--petra-calm-slate"
  | "--petra-calm-teal"
  | "--petra-calm-mint"
  | "--petra-calm-amber"
  | "--petra-calm-coral"
  | "--petra-calm-olive";

/**
 * Canonical calm-vector color projection shared by DOM/SVG adapters and
 * available to future Pixi/WebGL adapters. These colors are presentation-only;
 * scientific meaning still requires labels/patterns/shape where critical.
 */
export function calmVectorCssVariables(): Readonly<
  Record<CalmVectorCssVariable, string>
> {
  return {
    "--petra-calm-ink": CALM_VECTOR_PALETTE.ink,
    "--petra-calm-ink-panel": CALM_VECTOR_PALETTE.inkPanel,
    "--petra-calm-ink-raised": CALM_VECTOR_PALETTE.inkRaised,
    "--petra-calm-ink-edge": CALM_VECTOR_PALETTE.inkEdge,
    "--petra-calm-cream": CALM_VECTOR_PALETTE.cream,
    "--petra-calm-mist": CALM_VECTOR_PALETTE.mist,
    "--petra-calm-slate": CALM_VECTOR_PALETTE.slate,
    "--petra-calm-teal": CALM_VECTOR_PALETTE.teal,
    "--petra-calm-mint": CALM_VECTOR_PALETTE.mint,
    "--petra-calm-amber": CALM_VECTOR_PALETTE.amber,
    "--petra-calm-coral": CALM_VECTOR_PALETTE.coral,
    "--petra-calm-olive": CALM_VECTOR_PALETTE.olive,
  };
}

export function calmVectorColor(tone: CalmVectorTone): string {
  return CALM_VECTOR_PALETTE[tone];
}
