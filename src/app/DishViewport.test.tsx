import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { createRendererDemoSnapshot } from "../render/pixi/demoSnapshot";
import { DishViewport } from "./DishViewport";

const dishViewportSource = readFileSync(
  fileURLToPath(new URL("./DishViewport.tsx", import.meta.url)),
  "utf8",
);

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

  it("commits render-source cache transitions outside the render body", () => {
    expect(dishViewportSource).not.toContain(
      "useRef(INITIAL_DISH_RENDER_SOURCE_STATE)",
    );
    expect(dishViewportSource).not.toContain("renderSourceStateRef.current");
    expect(dishViewportSource).toContain(
      "const [renderSourceState, setRenderSourceState] = useState(",
    );
    expect(dishViewportSource).toContain(
      "if (renderSourceResolution.state === renderSourceState) return;",
    );
    expect(dishViewportSource).toContain(
      "setRenderSourceState(renderSourceResolution.state);",
    );
  });

  it("keeps the renderer demo fixture behind explicit opt-in", () => {
    const html = renderToStaticMarkup(
      <DishViewport motion="off" snapshot={null} demoMode />,
    );

    expect(html).toContain('data-render-source="visual-demo"');
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

    expect(html).toContain('data-render-source="authoritative-snapshot"');
    expect(html).toContain("authoritative snapshot");
    expect(html).not.toContain("visual demo · not biology");
    expect(html).not.toContain("visual-only renderer fixture");
  });


  it("projects live dish continuity through the shared app motion adapter", () => {
    expect(dishViewportSource).toContain(
      'import { resolveDishVisualMotion } from "./dishVisualMotion";',
    );
    expect(dishViewportSource).toContain(
      "const visualPlan = useMemo(",
    );
    expect(dishViewportSource).toContain(
      "visualMotion={visualPlan.visualMotion}",
    );
  });

  it("renders explicit Automatic and None overlay identities from one selection authority", () => {
    const authoritative = {
      ...createRendererDemoSnapshot(12),
      snapshotId: "authoritative-overlay-options",
      samplingIdentity: "authoritative-overlay-options",
    };

    const html = renderToStaticMarkup(
      <DishViewport motion="off" snapshot={authoritative} />,
    );

    expect(html).toContain('data-overlay-selection-mode="automatic"');
    expect(html).toContain('data-overlay-resolved-id="demo-antibiotic"');
    expect(html).toContain('value="automatic"');
    expect(html).toContain(">Automatic</option>");
    expect(html).toContain('value="none"');
    expect(html).toContain(">None</option>");
    expect(html).toContain('value="field:demo-antibiotic"');
    expect(html).toContain('value="field:demo-nutrient"');

    expect(dishViewportSource).toContain(
      "useState<DishOverlaySelection>(AUTOMATIC_DISH_OVERLAY)",
    );
    expect(dishViewportSource).toContain("reconcileDishOverlaySelection(");
    expect(dishViewportSource).toContain(
      "dishOverlaySelectionFromControlValue(event.target.value)",
    );
    expect(dishViewportSource).not.toContain("requestedOverlayId");
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
