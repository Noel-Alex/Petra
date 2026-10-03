import { describe, expect, it } from "vitest";

import source from "./DishViewport.tsx?raw";

describe("DishViewport overlay live-region source contract", () => {
  it("keeps animation identity off the stable live-region node", () => {
    const liveRegionStart = source.indexOf('className="dish-overlay-legend"');
    const visualStart = source.indexOf('className="dish-overlay-legend__visual"');

    expect(liveRegionStart).toBeGreaterThan(-1);
    expect(visualStart).toBeGreaterThan(liveRegionStart);

    // Bound the slice to the live-region element's own opening tag. The legend
    // renders an inner animation node that is legitimately keyed, so cutting at
    // the inner `className="dish-overlay-legend__visual"` would otherwise fold
    // that child's `key` into the parent's attribute list.
    const openingWindow = source.slice(liveRegionStart, visualStart);
    const liveRegionOpening = openingWindow.slice(
      0,
      openingWindow.lastIndexOf("<div"),
    );
    expect(liveRegionOpening).toContain('aria-live="polite"');
    expect(liveRegionOpening).toContain('aria-atomic="true"');
    expect(liveRegionOpening).not.toContain("key={");

    const visualWindow = source.slice(Math.max(0, visualStart - 100), visualStart + 180);
    expect(visualWindow).toContain(
      'key={`${effectiveOverlaySelection.mode}:${resolvedOverlayId ?? "none"}`}',
    );
    expect(visualWindow).toContain("data-transition-treatment={overlayMotion.treatment}");
  });

  it("does not create a second hidden live-region announcer", () => {
    expect(source.match(/aria-live=/g)).toHaveLength(1);
  });
});
