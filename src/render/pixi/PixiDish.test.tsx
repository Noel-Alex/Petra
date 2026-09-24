import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CameraMotionSpec } from "./cameraMotion";
import {
  PixiDish,
  RendererFailureFallback,
  rendererStatusAnnouncement,
} from "./PixiDish";
import { createRendererDemoSnapshot } from "./demoSnapshot";

const CAMERA_MOTION: CameraMotionSpec = { durationMs: 0, easing: [0, 0, 1, 1] };

describe("PixiDish render-source boundary", () => {
  it("renders a neutral waiting state without authoritative data", () => {
    const html = renderToStaticMarkup(<PixiDish snapshot={null} cameraMotion={CAMERA_MOTION} />);
    expect(html).toContain('data-render-source="awaiting-authoritative-snapshot"');
    expect(html).toContain('data-render-empty="true"');
    expect(html).toContain("Waiting for authoritative simulation data");
    expect(html).not.toContain("Visual demo");
  });

  it("requires explicit demoMode for presentation-only biology", () => {
    const html = renderToStaticMarkup(<PixiDish snapshot={null} cameraMotion={CAMERA_MOTION} demoMode />);
    expect(html).toContain('data-render-source="visual-demo"');
    expect(html).toContain('data-render-demo-disclosure="true"');
    expect(html).toContain("Visual demo — not simulation data");
  });

  it("authoritative snapshots take precedence over demo mode", () => {
    const html = renderToStaticMarkup(
      <PixiDish snapshot={createRendererDemoSnapshot(12)} cameraMotion={CAMERA_MOTION} demoMode />,
    );
    expect(html).toContain('data-render-source="authoritative-snapshot"');
    expect(html).not.toContain('data-render-demo-disclosure="true"');
  });
});


describe("PixiDish renderer status narration", () => {
  it("keeps a stable non-interactive live region mounted with renderer content", () => {
    const html = renderToStaticMarkup(
      <PixiDish snapshot={createRendererDemoSnapshot(12)} cameraMotion={CAMERA_MOTION} />,
    );

    expect(html).toContain('data-render-status-region="true"');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-atomic="true"');
  });

  it("keeps retry outside the live-region subtree and describes it from status copy", () => {
    const html = renderToStaticMarkup(
      <RendererFailureFallback
        errorMessage="WebGL unavailable"
        statusRegionId="renderer-status"
        onRetry={() => undefined}
      />,
    );

    expect(html).toContain('data-render-fallback="true"');
    expect(html).toContain('aria-describedby="renderer-status"');
    expect(html).toContain(">Retry renderer</button>");
    expect(html).not.toContain('role="status"');
    expect(html).not.toContain('aria-live=');
  });

  it("announces startup and failure without narrating settled renderer state", () => {
    expect(rendererStatusAnnouncement(true, "initializing")).toBe(
      "Starting interactive Petra dish renderer.",
    );
    expect(rendererStatusAnnouncement(true, "failed")).toBe(
      "Interactive dish unavailable. The WebGL renderer could not start. Petra has not substituted demonstration biology or changed the simulation state.",
    );
    expect(rendererStatusAnnouncement(true, "ready")).toBe("");
    expect(rendererStatusAnnouncement(false, "failed")).toBe("");
  });
});
