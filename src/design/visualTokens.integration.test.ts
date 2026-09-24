import { describe, expect, it } from "vitest";

import mainSource from "../main.tsx?raw";
import themeSource from "../app/visualTheme.css?raw";
import lineageSource from "../render/lineageAppearance.ts?raw";
import rendererSource from "../render/pixi/renderer.ts?raw";

describe("shared visual-token integration", () => {
  it("installs the TypeScript token authority before React mounts", () => {
    expect(mainSource).toContain("applyPetraVisualCssVariables");
    expect(mainSource.indexOf("applyPetraVisualCssVariables(")).toBeLessThan(
      mainSource.indexOf("createRoot(root).render"),
    );
    expect(mainSource).toContain('./app/visualTheme.css');
  });

  it("keeps the theme on shared custom properties instead of a second palette", () => {
    expect(themeSource).toContain("var(--petra-color-ink-deep)");
    expect(themeSource).toContain("var(--petra-color-cream)");
    expect(themeSource).toContain("var(--petra-color-teal)");
    expect(themeSource).toContain("var(--petra-color-coral)");
    expect(themeSource).not.toMatch(/#[0-9a-fA-F]{6}/);
  });

  it("binds lineage and Pixi vessel chrome to the same token module", () => {
    expect(lineageSource).toContain('../design/visualTokens');
    expect(rendererSource).toContain('../../design/visualTokens');
    expect(rendererSource).toContain('petraVisualColor("ink")');
    expect(rendererSource).toContain('petraVisualColor("creamMuted")');
    expect(rendererSource).toContain('petraVisualColor("teal")');
  });

  it("removes the previous electric Pixi vessel constants", () => {
    expect(rendererSource).not.toContain("0xbcecff");
    expect(rendererSource).not.toContain("0x8fdcff");
    expect(rendererSource).not.toContain("0x0b1f33");
  });
});
