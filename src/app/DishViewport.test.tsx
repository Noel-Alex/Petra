import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { createRendererDemoSnapshot } from "../render/pixi/demoSnapshot";
import { DishViewport } from "./DishViewport";

describe("DishViewport render-source truth boundary", () => {
  it("waits for authority by default instead of substituting demo biology", () => {
    const html = renderToStaticMarkup(
      <DishViewport motion="off" snapshot={null} />,
    );

    expect(html).toContain(
      'data-render-source="awaiting-authoritative-snapshot"',
    );
    expect(html).toContain("Waiting for authoritative simulation data");
    expect(html).toContain("waiting for authority");
    expect(html).toContain("Awaiting authoritative data");
    expect(html).toContain("No authoritative field overlay");
    expect(html).not.toContain("visual demo · not biology");
    expect(html).not.toContain("visual-only renderer fixture");
  });

  it("keeps the renderer demo fixture behind explicit opt-in", () => {
    const html = renderToStaticMarkup(
      <DishViewport motion="off" snapshot={null} demoMode />,
    );

    expect(html.match(/data-render-source="visual-demo"/g)).toHaveLength(2);
    expect(html).toContain("visual demo · not biology");
    expect(html).toContain("visual-only renderer");
    expect(html).toContain("demo-antibiotic");
  });

  it("lets authoritative state win even when demo mode is enabled", () => {
    const authoritative = {
      ...createRendererDemoSnapshot(12),
      snapshotId: "authoritative-fixture",
      samplingIdentity: "authoritative-fixture",
    };

    const html = renderToStaticMarkup(
      <DishViewport motion="off" snapshot={authoritative} demoMode />,
    );

    expect(
      html.match(/data-render-source="authoritative-snapshot"/g),
    ).toHaveLength(2);
    expect(html).toContain("authoritative snapshot");
    expect(html).not.toContain("visual demo · not biology");
    expect(html).not.toContain("visual-only renderer fixture");
  });


  it("keeps overlay status in one polite atomic live region", () => {
    const html = renderToStaticMarkup(
      <DishViewport motion="full" snapshot={null} />,
    );

    expect(html.match(/aria-live="polite"/g)).toHaveLength(1);
    expect(html).toContain('aria-atomic="true"');
    expect(html).toContain('class="dish-overlay-legend"');
    expect(html).toContain('class="dish-overlay-legend__visual"');
    expect(html).toContain('data-transition-treatment="animate"');
    expect(html).toContain("No authoritative field overlay");
  });

  it("renders signed net-growth legend semantics from the shared overlay registry", () => {
    const base = createRendererDemoSnapshot(12);
    const cells = base.gridWidth * base.gridHeight;
    const netGrowth = new Float32Array(cells);
    netGrowth.fill(0);

    const authoritative = {
      ...base,
      snapshotId: "authoritative-net-growth",
      samplingIdentity: "authoritative-net-growth",
      fields: [
        {
          id: "net-growth",
          kind: "net-growth" as const,
          label: "Net growth",
          unit: "1/h",
          width: base.gridWidth,
          height: base.gridHeight,
          values: netGrowth,
          minimum: -2,
          maximum: 2,
        },
      ],
    };

    const html = renderToStaticMarkup(
      <DishViewport motion="off" snapshot={authoritative} />,
    );

    expect(html).toContain('data-overlay-kind="net-growth"');
    expect(html).toContain('data-overlay-transfer="diverging"');
    expect(html).toContain('data-overlay-pattern="signed-diagonal"');
    expect(html).toContain("Negative loss");
    expect(html).toContain("zero neutral");
    expect(html).toContain("positive growth");
    expect(html).toContain("-2 to 2 1/h");
  });
});
