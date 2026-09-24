import { describe, expect, it } from "vitest";

// Vite resolves raw stylesheet imports at test runtime.
// @ts-expect-error Vite raw asset imports are runtime-supported but not in tsconfig globals.
import sourcesCss from "./sourcesDrawer.css?raw";
// @ts-expect-error Vite raw asset imports are runtime-supported but not in tsconfig globals.
import appSource from "./App.tsx?raw";

describe("Sources drawer motion lifecycle styles", () => {
  it("uses separate shared-token entry and exit phases", () => {
    expect(sourcesCss).toContain(
      '.sources-drawer[data-surface-phase="visible"][data-transition-treatment="animate"]',
    );
    expect(sourcesCss).toContain(
      '.sources-drawer[data-surface-phase="exiting"][data-transition-treatment="animate"]',
    );
    expect(sourcesCss).toContain("@keyframes sources-drawer-hide");
    expect(sourcesCss).toContain("var(--panel-motion-ms)");
    expect(sourcesCss).toContain("var(--panel-motion-easing)");
  });

  it("owns desktop and narrow-screen geometry in CSS rather than React inline style", () => {
    expect(sourcesCss).toContain("position: fixed");
    expect(sourcesCss).toContain("inset: 5.5rem 1rem 1rem auto");
    expect(sourcesCss).toContain("width: min(34rem, calc(100vw - 2rem))");
    expect(sourcesCss).toContain("max-height: calc(100vh - 6.5rem)");
    expect(sourcesCss).toContain("overflow: auto");
    expect(sourcesCss).toContain("@media (max-width: 640px)");
    expect(sourcesCss).toContain("inset: 7.25rem 0.65rem 0.65rem");
    expect(sourcesCss).toContain("width: auto");
    expect(sourcesCss).toContain("max-height: calc(100vh - 7.9rem)");

    expect(appSource).not.toContain("SOURCES_SURFACE_STYLE");
    expect(appSource).not.toContain('inset: "5.5rem 1rem 1rem auto"');
    expect(appSource).not.toContain('width: "min(34rem, calc(100vw - 2rem))"');
    expect(appSource).not.toContain('maxHeight: "calc(100vh - 6.5rem)"');
  });

  it("makes the exiting drawer pointer-inert and keeps instant motion static", () => {
    const exitStart = sourcesCss.indexOf(
      '.sources-drawer[data-surface-phase="exiting"]',
    );
    const nextRule = sourcesCss.indexOf("}", exitStart);
    expect(sourcesCss.slice(exitStart, nextRule)).toContain(
      "pointer-events: none",
    );
    expect(sourcesCss).toContain(
      '.sources-drawer[data-transition-treatment="instant"]',
    );
    expect(sourcesCss).toContain("animation: none");
  });
});


describe("Sources drawer visual-theme contract", () => {
  it("uses Petra shared visual variables and avoids legacy glass palette ownership", () => {
    expect(sourcesCss).toContain("--petra-color-cream");
    expect(sourcesCss).toContain("--petra-color-cream-muted");
    expect(sourcesCss).toContain("--petra-color-teal");
    expect(sourcesCss).toContain("--petra-rgb-ink-deep");

    expect(sourcesCss).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(sourcesCss).not.toMatch(/\brgba?\(\s*\d/i);
    expect(sourcesCss).not.toMatch(/backdrop-filter\s*:\s*blur/i);
  });
});
