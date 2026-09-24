import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SemanticZoomGuide } from "./SemanticZoomGuide";

function activeEntry(html: string, id: string): boolean {
  return html.includes(
    `data-semantic-view="${id}" data-active="true" aria-current="step"`,
  );
}

describe("SemanticZoomGuide", () => {
  it("marks whole-dish current at overview", () => {
    const html = renderToStaticMarkup(
      <SemanticZoomGuide level="dish" motion="full" />,
    );

    expect(html).toContain('data-semantic-level="dish"');
    expect(activeEntry(html, "dish")).toBe(true);
    expect(html.match(/aria-current="step"/g)?.length).toBe(1);
    expect(html).toContain('data-transition-treatment="animate"');
    expect(html).toContain("--semantic-guide-motion-ms:160ms");
  });

  it("moves current semantics to colony without changing explanatory copy", () => {
    const html = renderToStaticMarkup(
      <SemanticZoomGuide level="colony" motion="reduced" />,
    );

    expect(activeEntry(html, "colony")).toBe(true);
    expect(html.match(/aria-current="step"/g)?.length).toBe(1);
    expect(html).toContain('data-transition-treatment="instant"');
    expect(html).toContain("--semantic-guide-motion-ms:0ms");
    expect(html).toContain("representative visual proxies");
  });

  it("keeps representative-cell explicitly illustrative when current", () => {
    const html = renderToStaticMarkup(
      <SemanticZoomGuide level="representative-cell" motion="off" />,
    );

    expect(activeEntry(html, "representative-cell")).toBe(true);
    expect(html).toContain(
      "illustrative explanation — not literal microscopy",
    );
  });

  it("marks no level current when no renderer presentation exists", () => {
    const html = renderToStaticMarkup(
      <SemanticZoomGuide level={null} motion="off" />,
    );

    expect(html).toContain('data-semantic-level="unavailable"');
    expect(html).not.toContain('aria-current="step"');
  });
});
