import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { createRendererDemoSnapshot } from "../render/pixi/demoSnapshot";
import { DishViewport } from "./DishViewport";
// @ts-expect-error Vite raw asset imports are runtime-supported but not in tsconfig globals.
import dishViewportSource from "./DishViewport.tsx?raw";
// @ts-expect-error Vite raw asset imports are runtime-supported but not in tsconfig globals.
import appSource from "./App.tsx?raw";

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

  it("keeps Escape single-consumer from dish first refusal through the App Sources owner", () => {
    const handlerStart = dishViewportSource.indexOf("const handleDishKeyDown");
    const handlerEnd = dishViewportSource.indexOf("\n\n  return (", handlerStart);
    const handler = dishViewportSource.slice(handlerStart, handlerEnd);

    expect(handlerStart).toBeGreaterThanOrEqual(0);
    expect(handlerEnd).toBeGreaterThan(handlerStart);
    expect(handler).toContain(
      "const editableTarget = isEditableTarget(event.target);",
    );

    const preflight = handler.indexOf("dishEscapeAllowsFirstRefusal");
    const higherPriority = handler.indexOf(
      "onEscapeBeforeOverview?.() === true",
    );
    const fallback = handler.indexOf("const action = dishEscapeAction");

    expect(preflight).toBeGreaterThanOrEqual(0);
    expect(higherPriority).toBeGreaterThan(preflight);
    expect(fallback).toBeGreaterThan(higherPriority);

    const consumedBranch = handler.slice(higherPriority, fallback);
    expect(consumedBranch).toContain("event.preventDefault();");
    expect(consumedBranch).toContain("event.stopPropagation();");
    expect(consumedBranch).toContain("return;");

    expect(appSource).toContain("onEscapeBeforeOverview={() => {");
    expect(appSource).toContain(
      "if (!sourcesLifecycle.requestedOpen) return false;",
    );
    expect(appSource).toContain("closeSources();");
    expect(appSource).toContain("return true;");
  });
});
