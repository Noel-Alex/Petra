import { describe, expect, it } from "vitest";

import {
  PETRA_VISUAL_COLOR_SCHEMA_VERSION,
  PETRA_VISUAL_COLORS,
  applyPetraVisualCssVariables,
  petraVisualColor,
  petraVisualColorCss,
  petraVisualColorRgbChannels,
  petraVisualCssVariableEntries,
} from "./visualTokens";

describe("Petra visual token authority", () => {
  it("keeps one bounded versioned calm flat-vector palette", () => {
    expect(PETRA_VISUAL_COLOR_SCHEMA_VERSION).toBe(1);
    expect(Object.keys(PETRA_VISUAL_COLORS)).toEqual([
      "inkDeep",
      "ink",
      "inkSoft",
      "cream",
      "creamMuted",
      "teal",
      "mint",
      "amber",
      "coral",
      "olive",
      "lavender",
    ]);
  });

  it("derives CSS and renderer representations from the same numeric value", () => {
    expect(petraVisualColor("teal")).toBe(0x62b7b6);
    expect(petraVisualColorCss("teal")).toBe("#62b7b6");
    expect(petraVisualColorRgbChannels("teal")).toBe("98 183 182");
  });

  it("projects every color into both CSS hex and RGB channel variables", () => {
    const entries = petraVisualCssVariableEntries();
    expect(entries).toHaveLength(Object.keys(PETRA_VISUAL_COLORS).length * 2);
    expect(entries).toContainEqual([
      "--petra-color-cream",
      "#f1f3ee",
    ]);
    expect(entries).toContainEqual([
      "--petra-rgb-coral",
      "236 108 120",
    ]);
  });

  it("installs variables without depending on the DOM API shape", () => {
    const variables = new Map<string, string>();
    applyPetraVisualCssVariables({
      setProperty(name, value) {
        variables.set(name, value);
      },
    });

    expect(variables.get("--petra-color-ink-deep")).toBe("#101e27");
    expect(variables.get("--petra-rgb-mint")).toBe("127 202 168");
  });

  it("keeps core normal-text accent pairs at WCAG AA contrast", () => {
    const pairs = [
      ["cream", "inkDeep"],
      ["creamMuted", "ink"],
      ["teal", "ink"],
      ["mint", "ink"],
      ["amber", "ink"],
      ["coral", "ink"],
    ] as const;

    for (const [foreground, background] of pairs) {
      expect(
        contrastRatio(
          petraVisualColor(foreground),
          petraVisualColor(background),
        ),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

});


function contrastRatio(foreground: number, background: number): number {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(color: number): number {
  const channels = [
    (color >> 16) & 0xff,
    (color >> 8) & 0xff,
    color & 0xff,
  ].map((value) => {
    const channel = value / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}
