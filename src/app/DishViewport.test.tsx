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
});
