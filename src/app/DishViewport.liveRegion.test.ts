import { describe, expect, it } from "vitest";

import source from "./DishViewport.tsx?raw";

describe("DishViewport overlay live-region source contract", () => {
  it("keeps animation identity off the stable live-region node", () => {
    const liveRegionStart = source.indexOf('className="dish-overlay-legend"');
    const visualStart = source.indexOf('className="dish-overlay-legend__visual"');

    expect(liveRegionStart).toBeGreaterThan(-1);
    expect(visualStart).toBeGreaterThan(liveRegionStart);

    const liveRegionOpening = source.slice(liveRegionStart, visualStart);
    expect(liveRegionOpening).toContain('aria-live="polite"');
    expect(liveRegionOpening).toContain('aria-atomic="true"');
    expect(liveRegionOpening).not.toContain("key={");

    const visualWindow = source.slice(Math.max(0, visualStart - 100), visualStart + 180);
    expect(visualWindow).toContain('key={resolvedOverlayId ?? "none"}');
    expect(visualWindow).toContain("data-transition-treatment={overlayMotion.treatment}");
  });

  it("does not create a second hidden live-region announcer", () => {
    expect(source.match(/aria-live=/g)).toHaveLength(1);
  });
});
