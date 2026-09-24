import { describe, expect, it } from "vitest";

// Vite resolves raw stylesheet imports at test runtime.
// @ts-expect-error Vite raw asset imports are runtime-supported but not in tsconfig globals.
import sourcesCss from "./sourcesDrawer.css?raw";

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
