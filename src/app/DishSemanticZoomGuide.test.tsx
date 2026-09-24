import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DishSemanticZoomGuide } from "./DishSemanticZoomGuide";

describe("DishSemanticZoomGuide", () => {
  it("marks whole-dish overview current by default", () => {
    const html = renderToStaticMarkup(
      <DishSemanticZoomGuide
        previousLevel="dish"
        currentLevel="dish"
        motion="full"
      />,
    );

    expect(html).toContain('data-semantic-level="dish"');
    expect(html).toContain('data-semantic-view="dish"');
    expect(html).toContain('aria-current="true"');
    expect(html.match(/aria-current="true"/g)).toHaveLength(1);
    expect(html).toContain("Current");
  });

  it("moves current semantics to colony without hiding other meanings", () => {
    const html = renderToStaticMarkup(
      <DishSemanticZoomGuide
        previousLevel="dish"
        currentLevel="colony"
        motion="full"
      />,
    );

    expect(html).toContain('data-semantic-level="colony"');
    expect(html).toContain("Whole dish");
    expect(html).toContain("Colony");
    expect(html).toContain("Cell story");
    expect(html.match(/aria-current="true"/g)).toHaveLength(1);
    expect(html).toContain('data-transition-treatment="animate"');
  });

  it("keeps the representative-cell truth boundary while marking it current", () => {
    const html = renderToStaticMarkup(
      <DishSemanticZoomGuide
        previousLevel="colony"
        currentLevel="representative-cell"
        motion="full"
      />,
    );

    expect(html).toContain('data-semantic-level="representative-cell"');
    expect(html).toContain("illustrative explanation — not literal microscopy");
    expect(html.match(/aria-current="true"/g)).toHaveLength(1);
  });

  it("uses crossfade-only treatment for reduced motion", () => {
    const html = renderToStaticMarkup(
      <DishSemanticZoomGuide
        previousLevel="dish"
        currentLevel="colony"
        motion="reduced"
      />,
    );

    expect(html).toContain('data-transition-treatment="crossfade"');
  });

  it("uses an instant static state when motion is off", () => {
    const html = renderToStaticMarkup(
      <DishSemanticZoomGuide
        previousLevel="colony"
        currentLevel="dish"
        motion="off"
      />,
    );

    expect(html).toContain('data-transition-treatment="instant"');
    expect(html).toContain("--semantic-guide-motion-ms:0ms");
  });
});
