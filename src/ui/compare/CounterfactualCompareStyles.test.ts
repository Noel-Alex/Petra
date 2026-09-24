import { describe, expect, it } from "vitest";

// Vite resolves raw assets in the Vitest runtime; this project intentionally omits vite/client globals.
// @ts-expect-error Vite raw asset import is runtime-supported but not declared in tsconfig types.
import compareCss from "./CounterfactualCompare.css?raw";

describe("CounterfactualCompare resolved motion CSS", () => {
  it("does not let raw OS media queries override an explicit Full preference", () => {
    expect(compareCss).not.toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("keeps reduced/off suppression behind resolved treatment attributes", () => {
    expect(compareCss).toContain(
      '.petra-compare[data-motion-treatment="crossfade"] .petra-compare__stage',
    );
    expect(compareCss).toContain(
      '.petra-compare[data-motion-treatment="instant"] *',
    );
    expect(compareCss).toContain(
      '.petra-compare[data-motion-treatment="static-emphasis"] *',
    );
  });

  it("keeps the native swipe range at Petra's minimum touch target height", () => {
    expect(compareCss).toContain(".petra-compare__reveal input {");
    expect(compareCss).toContain("min-height: 2.75rem;");
    expect(compareCss).toContain("width: 100%;");
    expect(compareCss).not.toContain("min-width: 2.75rem;");
  });

  it("retains full-treatment transition definitions", () => {
    expect(compareCss).toContain(
      "transition:\n    opacity var(--compare-motion-ms) var(--compare-easing)",
    );
    expect(compareCss).toContain("transform var(--compare-motion-ms) var(--compare-easing)");
  });
});
