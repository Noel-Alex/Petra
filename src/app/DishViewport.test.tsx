import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createRendererDemoSnapshot } from "../render/pixi/demoSnapshot";
import { DishViewport } from "./DishViewport";

describe("DishViewport render-source authority", () => {
  it("waits neutrally when authoritative state is absent by default", () => {
    const html = renderToStaticMarkup(<DishViewport motion="full" />);

    expect(html).toContain(
      'data-render-source="awaiting-authoritative-snapshot"',
    );
    expect(html).toContain("Waiting for authoritative simulation data");
    expect(html).toContain("awaiting authoritative state");
    expect(html).not.toContain("visual demo · not biology");
    expect(html).not.toContain("Visual demo — not simulation data");
    expect(html).not.toContain('aria-label="Petri dish overlay"');
    expect(html).not.toContain('aria-label="Semantic zoom meaning"');
  });

  it("renders the deterministic visual fixture only after explicit opt-in", () => {
    const html = renderToStaticMarkup(
      <DishViewport motion="full" demoMode />,
    );

    expect(html).toContain('data-render-source="visual-demo"');
    expect(html).toContain("visual demo · not biology");
    expect(html).toContain("Visual demo — not simulation data");
    expect(html).toContain('aria-label="Petri dish overlay"');
    expect(html).toContain('aria-label="Semantic zoom meaning"');
  });

  it("keeps an authoritative snapshot authoritative even when demo mode is allowed", () => {
    const authoritative = {
      ...createRendererDemoSnapshot(4),
      snapshotId: "authoritative-test-snapshot",
      samplingIdentity: "authoritative-test-run",
    };
    const html = renderToStaticMarkup(
      <DishViewport
        motion="full"
        snapshot={authoritative}
        demoMode
      />,
    );

    expect(html).toContain('data-render-source="authoritative-snapshot"');
    expect(html).toContain("authoritative snapshot");
    expect(html).not.toContain("visual demo · not biology");
    expect(html).not.toContain("Visual demo — not simulation data");
  });
});
