import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CameraMotionSpec } from "./cameraMotion";
import { PixiDish } from "./PixiDish";
import { createRendererDemoSnapshot } from "./demoSnapshot";

const CAMERA_MOTION: CameraMotionSpec = {
  durationMs: 0,
  easing: [0, 0, 1, 1],
};

describe("PixiDish render-source boundary", () => {
  it("renders a neutral waiting state when authoritative data is absent", () => {
    const html = renderToStaticMarkup(
      <PixiDish snapshot={null} cameraMotion={CAMERA_MOTION} />,
    );

    expect(html).toContain('data-render-source="awaiting-authoritative-snapshot"');
    expect(html).toContain('data-render-empty="true"');
    expect(html).toContain("Waiting for authoritative simulation data");
    expect(html).not.toContain("Visual demo");
  });

  it("requires explicit demoMode before presentation-only biology is selected", () => {
    const html = renderToStaticMarkup(
      <PixiDish snapshot={null} cameraMotion={CAMERA_MOTION} demoMode />,
    );

    expect(html).toContain('data-render-source="visual-demo"');
    expect(html).toContain('data-render-demo-disclosure="true"');
    expect(html).toContain("Visual demo — not simulation data");
    expect(html).not.toContain('data-render-empty="true"');
  });

  it("authoritative snapshots always take precedence over demo mode", () => {
    const html = renderToStaticMarkup(
      <PixiDish
        snapshot={createRendererDemoSnapshot(12)}
        cameraMotion={CAMERA_MOTION}
        demoMode
      />,
    );

    expect(html).toContain('data-render-source="authoritative-snapshot"');
    expect(html).not.toContain('data-render-demo-disclosure="true"');
    expect(html).not.toContain('data-render-empty="true"');
  });
});
