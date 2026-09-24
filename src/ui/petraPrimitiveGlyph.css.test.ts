import { describe, expect, it } from "vitest";

// Vite resolves raw stylesheet imports at test runtime.
// @ts-expect-error Vite raw asset imports are runtime-supported but not in tsconfig globals.
import css from "./petraPrimitiveGlyph.css?raw";

describe("PetraPrimitiveGlyph CSS contract", () => {
  it("fails static until the React adapter projects shared motion", () => {
    const root = css.match(/\.petra-primitive-glyph\s*\{([^}]*)\}/s);
    expect(root).not.toBeNull();
    expect(root?.[1]).toContain("--petra-primitive-duration: 0ms");
    expect(root?.[1]).toContain("--petra-primitive-easing: linear");
    expect(root?.[1]).not.toContain("160ms");
    expect(css).not.toContain("prefers-reduced-motion");
  });

  it("uses the shared Petra palette rather than a second component palette", () => {
    expect(css).toContain("var(--petra-color-teal)");
    expect(css).toContain("var(--petra-rgb-cream)");
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });

  it("keeps looping presentation gated by the adapter's resolved loop flag", () => {
    expect(css).toContain('[data-state="loading"][data-loop="true"]');
    expect(css).not.toContain('[data-state="loading"] {\n  animation:');
  });
});
