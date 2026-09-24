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
    expect(petraVisualColor("teal")).toBe(0x5d9e98);
    expect(petraVisualColorCss("teal")).toBe("#5d9e98");
    expect(petraVisualColorRgbChannels("teal")).toBe("93 158 152");
  });

  it("projects every color into both CSS hex and RGB channel variables", () => {
    const entries = petraVisualCssVariableEntries();
    expect(entries).toHaveLength(Object.keys(PETRA_VISUAL_COLORS).length * 2);
    expect(entries).toContainEqual([
      "--petra-color-cream",
      "#f4ead7",
    ]);
    expect(entries).toContainEqual([
      "--petra-rgb-coral",
      "215 120 111",
    ]);
  });

  it("installs variables without depending on the DOM API shape", () => {
    const variables = new Map<string, string>();
    applyPetraVisualCssVariables({
      setProperty(name, value) {
        variables.set(name, value);
      },
    });

    expect(variables.get("--petra-color-ink-deep")).toBe("#172033");
    expect(variables.get("--petra-rgb-mint")).toBe("131 184 154");
  });
});
