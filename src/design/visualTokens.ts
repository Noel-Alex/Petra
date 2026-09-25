export const PETRA_VISUAL_COLOR_SCHEMA_VERSION = 1 as const;

/**
 * Petra's domain-neutral deep blue editorial presentation palette.
 *
 * These colors are visual language only. They never encode scientific values,
 * fitness, resistance, confidence, abundance, or causal direction by
 * themselves. Scientific surfaces must pair color with labels/pattern/shape.
 */
export const PETRA_VISUAL_COLORS = Object.freeze({
  inkDeep: 0x0f1f2c,
  ink: 0x132432,
  inkSoft: 0x1a2f42,
  cream: 0xf2e8d4,
  creamMuted: 0xaebcc8,
  teal: 0x62b7b6,
  mint: 0x7fcaa8,
  amber: 0xf1b650,
  coral: 0xec6c78,
  olive: 0x8fb76d,
  lavender: 0x9a8bbb,
});

export type PetraVisualColorToken = keyof typeof PETRA_VISUAL_COLORS;

export interface PetraCssVariableTarget {
  setProperty(name: string, value: string): void;
}

export function petraVisualColor(token: PetraVisualColorToken): number {
  return PETRA_VISUAL_COLORS[token];
}

export function petraVisualColorCss(token: PetraVisualColorToken): string {
  return `#${PETRA_VISUAL_COLORS[token].toString(16).padStart(6, "0")}`;
}

export function petraVisualColorRgbChannels(
  token: PetraVisualColorToken,
): string {
  const color = PETRA_VISUAL_COLORS[token];
  const red = (color >> 16) & 0xff;
  const green = (color >> 8) & 0xff;
  const blue = color & 0xff;
  return `${red} ${green} ${blue}`;
}

const CSS_COLOR_NAMES = Object.freeze({
  inkDeep: "--petra-color-ink-deep",
  ink: "--petra-color-ink",
  inkSoft: "--petra-color-ink-soft",
  cream: "--petra-color-cream",
  creamMuted: "--petra-color-cream-muted",
  teal: "--petra-color-teal",
  mint: "--petra-color-mint",
  amber: "--petra-color-amber",
  coral: "--petra-color-coral",
  olive: "--petra-color-olive",
  lavender: "--petra-color-lavender",
} as const satisfies Readonly<Record<PetraVisualColorToken, string>>);

export function petraVisualColorCssVariableName(
  token: PetraVisualColorToken,
): string {
  return CSS_COLOR_NAMES[token];
}

const CSS_RGB_NAMES = Object.freeze({
  inkDeep: "--petra-rgb-ink-deep",
  ink: "--petra-rgb-ink",
  inkSoft: "--petra-rgb-ink-soft",
  cream: "--petra-rgb-cream",
  creamMuted: "--petra-rgb-cream-muted",
  teal: "--petra-rgb-teal",
  mint: "--petra-rgb-mint",
  amber: "--petra-rgb-amber",
  coral: "--petra-rgb-coral",
  olive: "--petra-rgb-olive",
  lavender: "--petra-rgb-lavender",
} as const satisfies Readonly<Record<PetraVisualColorToken, string>>);

export function petraVisualCssVariableEntries(): readonly (
  readonly [name: string, value: string]
)[] {
  const entries: Array<readonly [string, string]> = [];
  for (const token of Object.keys(
    PETRA_VISUAL_COLORS,
  ) as PetraVisualColorToken[]) {
    entries.push(
      [CSS_COLOR_NAMES[token], petraVisualColorCss(token)],
      [CSS_RGB_NAMES[token], petraVisualColorRgbChannels(token)],
    );
  }
  return entries;
}

/**
 * Project the single TypeScript palette authority into browser CSS variables.
 *
 * Keeping this bridge target-shaped rather than DOM-typed makes it simple to
 * test and keeps src/design independent from React and renderer libraries.
 */
export function applyPetraVisualCssVariables(
  target: PetraCssVariableTarget,
): void {
  for (const [name, value] of petraVisualCssVariableEntries()) {
    target.setProperty(name, value);
  }
}
