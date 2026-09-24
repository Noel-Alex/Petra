import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CameraMotionSpec } from "./cameraMotion";
import {
  PixiDish,
  RendererFailureFallback,
  rendererStartupAnnouncement,
} from "./PixiDish";
import { createRendererDemoSnapshot } from "./demoSnapshot";

const CAMERA_MOTION: CameraMotionSpec = { durationMs: 0, easing: [0, 0, 1, 1] };

describe("PixiDish render-source boundary", () => {
  it("renders a neutral waiting state without authoritative data", () => {
    const html = renderToStaticMarkup(
      <PixiDish
        snapshot={null}
        source="awaiting-authoritative-snapshot"
        cameraMotion={CAMERA_MOTION}
      />,
    );
    expect(html).toContain('data-render-source="awaiting-authoritative-snapshot"');
    expect(html).toContain('data-render-empty="true"');
    expect(html).toContain("Waiting for authoritative simulation data");
    expect(html).not.toContain("Visual demo");
  });

  it("keeps a non-null visual fixture explicitly demo-labelled", () => {
    const html = renderToStaticMarkup(
      <PixiDish
        snapshot={createRendererDemoSnapshot(12)}
        source="visual-demo"
        cameraMotion={CAMERA_MOTION}
      />,
    );
    expect(html).toContain('data-render-source="visual-demo"');
    expect(html).toContain('data-render-demo-disclosure="true"');
    expect(html).toContain("Visual demo — not simulation data");
  });

  it("renders authoritative identity only when the caller explicitly supplies it", () => {
    const html = renderToStaticMarkup(
      <PixiDish
        snapshot={createRendererDemoSnapshot(12)}
        source="authoritative-snapshot"
        cameraMotion={CAMERA_MOTION}
      />,
    );
    expect(html).toContain('data-render-source="authoritative-snapshot"');
    expect(html).not.toContain('data-render-demo-disclosure="true"');
  });

  it("rejects source and snapshot presence mismatches", () => {
    expect(() =>
      renderToStaticMarkup(
        <PixiDish
          snapshot={createRendererDemoSnapshot(12)}
          source="awaiting-authoritative-snapshot"
          cameraMotion={CAMERA_MOTION}
        />,
      ),
    ).toThrow(/requires a null render snapshot/);

    expect(() =>
      renderToStaticMarkup(
        <PixiDish
          snapshot={null}
          source="visual-demo"
          cameraMotion={CAMERA_MOTION}
        />,
      ),
    ).toThrow(/requires an explicit render snapshot transaction/);
  });

  it("keeps one stable polite atomic renderer-status region mounted", () => {
    const html = renderToStaticMarkup(
      <PixiDish
        snapshot={null}
        source="awaiting-authoritative-snapshot"
        cameraMotion={CAMERA_MOTION}
      />,
    );

    expect(html.match(/role="status"/g)).toHaveLength(1);
    expect(html).toContain('data-render-status-announcement="true"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-atomic="true"');
    expect(html).not.toContain("Retry renderer");
  });

  it("keeps the interactive retry action outside live-region semantics", () => {
    const html = renderToStaticMarkup(
      <RendererFailureFallback
        errorMessage="webgl unavailable"
        descriptionId="renderer-failure-description"
        onRetry={() => undefined}
      />,
    );

    expect(html).toContain('data-render-fallback="true"');
    expect(html).toContain('title="webgl unavailable"');
    expect(html).toContain("Interactive dish unavailable");
    expect(html).toContain(
      "Petra has not substituted demonstration biology or changed the simulation state.",
    );
    expect(html).toContain("Retry renderer");
    expect(html).toContain(
      'aria-describedby="renderer-failure-description"',
    );
    expect(html).not.toContain('role="status"');
    expect(html).not.toContain("aria-live=");
  });

  it("announces renderer startup/failure state without interactive copy", () => {
    expect(rendererStartupAnnouncement("idle")).toBe("");
    expect(rendererStartupAnnouncement("ready")).toBe("");
    expect(rendererStartupAnnouncement("initializing")).toBe(
      "Starting interactive Petra dish renderer.",
    );
    expect(rendererStartupAnnouncement("failed")).toContain(
      "Interactive dish unavailable.",
    );
    expect(rendererStartupAnnouncement("failed")).not.toContain(
      "Retry renderer",
    );
  });
});
