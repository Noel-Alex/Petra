import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import pixiDishCss from "./PixiDish.css?raw";
import pixiDishSource from "./PixiDish.tsx?raw";
import type { DishVisualMotionSpec } from "../visualInterpolation";
import type { CameraMotionSpec } from "./cameraMotion";
import {
  PixiDish,
  RendererFailureFallback,
  rendererStartupAnnouncement,
} from "./PixiDish";
import { createRendererDemoSnapshot } from "./demoSnapshot";

const CAMERA_MOTION: CameraMotionSpec = { durationMs: 0, easing: [0, 0, 1, 1] };
const VISUAL_MOTION: DishVisualMotionSpec = { durationMs: 0, easing: [0, 0, 1, 1] };

describe("PixiDish committed renderer inputs", () => {
  it("leaves live touch-action ownership to the renderer camera policy", () => {
    expect(pixiDishSource).not.toContain("touchAction:");
    expect(pixiDishSource).not.toContain('touchAction: rendererInteractive ? "none" : "auto"');
  });

  it("synchronizes async renderer refs only in commit phase", () => {
    const syncStart = pixiDishSource.indexOf("useLayoutEffect(() => {");
    const rendererLifecycleStart = pixiDishSource.indexOf(
      "useEffect(() => {",
      syncStart + 1,
    );

    expect(syncStart).toBeGreaterThan(-1);
    expect(rendererLifecycleStart).toBeGreaterThan(syncStart);

    for (const assignment of [
      "motionRef.current = motion;",
      "cameraMotionRef.current = cameraMotion;",
      "visualMotionRef.current = visualMotion;",
      "overlayRef.current = overlayId;",
      "semanticZoomCallbackRef.current = onSemanticZoomLevelChange;",
      "snapshotRef.current = renderSnapshot;",
    ]) {
      expect(pixiDishSource.split(assignment).length - 1).toBe(1);
      const index = pixiDishSource.indexOf(assignment);
      expect(index).toBeGreaterThan(syncStart);
      expect(index).toBeLessThan(rendererLifecycleStart);
    }
  });

  it("hydrates async onReady from the latest committed renderer refs", () => {
    const onReadyStart = pixiDishSource.indexOf("onReady(renderer) {");
    const onErrorStart = pixiDishSource.indexOf("onError(error) {", onReadyStart);
    const onReadySource = pixiDishSource.slice(onReadyStart, onErrorStart);

    expect(onReadyStart).toBeGreaterThan(-1);
    expect(onErrorStart).toBeGreaterThan(onReadyStart);
    expect(onReadySource).toContain(
      "renderer.setCameraMotion(cameraMotionRef.current);",
    );
    expect(onReadySource).toContain(
      "renderer.setVisualMotion(visualMotionRef.current);",
    );
    expect(onReadySource).toContain(
      "renderer.setMotionMode(motionRef.current);",
    );
    expect(onReadySource).toContain(
      "const currentSnapshot = snapshotRef.current;",
    );
    expect(onReadySource).toContain(
      "renderer.updatePresentation(currentSnapshot, overlayRef.current);",
    );
  });
});

describe("PixiDish render-source boundary", () => {
  it("renders a neutral waiting state without authoritative data", () => {
    const html = renderToStaticMarkup(
      <PixiDish
        snapshot={null}
        sourceKind="awaiting-authoritative-snapshot"
        cameraMotion={CAMERA_MOTION}
        visualMotion={VISUAL_MOTION}
      />,
    );
    expect(html).toContain('data-render-source="awaiting-authoritative-snapshot"');
    expect(html).toContain('data-render-empty="true"');
    expect(html).toContain("Waiting for authoritative simulation data");
    expect(html).not.toContain("Visual demo");
  });

  it("renders caller-supplied visual-demo state without manufacturing a fixture", () => {
    const demo = createRendererDemoSnapshot(12);
    const html = renderToStaticMarkup(
      <PixiDish
        snapshot={demo}
        sourceKind="visual-demo"
        cameraMotion={CAMERA_MOTION}
        visualMotion={VISUAL_MOTION}
      />,
    );
    expect(html).toContain('data-render-source="visual-demo"');
    expect(html).toContain('data-render-demo-disclosure="true"');
    expect(html).toContain("Visual demo — not simulation data");
  });

  it("renders caller-supplied authoritative snapshots without demo disclosure", () => {
    const html = renderToStaticMarkup(
      <PixiDish
        snapshot={createRendererDemoSnapshot(12)}
        sourceKind="authoritative-snapshot"
        cameraMotion={CAMERA_MOTION}
        visualMotion={VISUAL_MOTION}
      />,
    );
    expect(html).toContain('data-render-source="authoritative-snapshot"');
    expect(html).not.toContain('data-render-demo-disclosure="true"');
  });

  it("rejects source identity that disagrees with snapshot presence", () => {
    expect(() =>
      renderToStaticMarkup(
        <PixiDish
          snapshot={createRendererDemoSnapshot(12)}
          sourceKind="awaiting-authoritative-snapshot"
          cameraMotion={CAMERA_MOTION}
        visualMotion={VISUAL_MOTION}
        />,
      ),
    ).toThrow(/must not include a snapshot/);

    expect(() =>
      renderToStaticMarkup(
        <PixiDish
          snapshot={null}
          sourceKind="visual-demo"
          cameraMotion={CAMERA_MOTION}
        visualMotion={VISUAL_MOTION}
        />,
      ),
    ).toThrow(/visual-demo dish render source requires a snapshot/);
  });

  it("keeps one stable polite atomic renderer-status region mounted", () => {
    const html = renderToStaticMarkup(
      <PixiDish snapshot={null} cameraMotion={CAMERA_MOTION}
        visualMotion={VISUAL_MOTION} />,
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
        motionPreference="full"
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

  it.each(["full", "reduced", "off"] as const)(
    "projects %s motion into the shared renderer retry action",
    (motionPreference) => {
      const html = renderToStaticMarkup(
        <RendererFailureFallback
          errorMessage="webgl unavailable"
          descriptionId="renderer-failure-description"
          motionPreference={motionPreference}
          onRetry={() => undefined}
        />,
      );

      expect(html).toContain('class="petra-compact-action pixi-dish__retry-action"');
      expect(html).toContain(`data-motion="${motionPreference}"`);
      expect(html).toContain('aria-describedby="renderer-failure-description"');
      expect(html).toContain("Retry renderer");
      expect(html).not.toContain('role="status"');
      expect(html).not.toContain("aria-live=");
    },
  );

  it("keeps retry chrome free of renderer-local motion timing authority", () => {
    expect(pixiDishCss).toContain(".pixi-dish__retry-action");
    expect(pixiDishCss).not.toMatch(/\\b(?:transition|animation)(?:-duration)?\\s*:/);
    expect(pixiDishCss).not.toContain("prefers-reduced-motion");
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
