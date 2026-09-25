import { describe, expect, it } from "vitest";
import rendererSource from "./renderer.ts?raw";

describe("Pixi dish visual continuity integration", () => {
  it("keeps authoritative snapshots separate from drawable presentation state", () => {
    expect(rendererSource).toContain(
      "let snapshot: DishRenderSnapshot | null = null;",
    );
    expect(rendererSource).toContain(
      "let drawableState: DishDrawableState | null = null;",
    );
    expect(rendererSource).toContain(
      "update(snapshot: DishRenderSnapshot): void;",
    );
    expect(rendererSource).toContain(
      "snapshot: DishRenderSnapshot,\n    overlayId: string | null,",
    );
    expect(rendererSource).not.toContain(
      "update(snapshot: DishDrawableState): void;",
    );
  });

  it("short-circuits only when snapshot and sampling identities are unchanged", () => {
    const updateStart = rendererSource.indexOf(
      "const applySnapshotOverlayUpdate = (",
    );
    const resizeStart = rendererSource.indexOf(
      "const resizeScheduler =",
      updateStart,
    );
    const updateSource = rendererSource.slice(updateStart, resizeStart);

    expect(updateSource).toContain(
      "const previousSnapshotId = snapshot?.snapshotId ?? null;",
    );
    expect(updateSource).toContain(
      "const previousSamplingIdentity = snapshot?.samplingIdentity ?? null;",
    );
    expect(updateSource).toContain(
      "previousSnapshotId === next.snapshot.snapshotId &&",
    );
    expect(updateSource).toContain(
      "previousSamplingIdentity === next.snapshot.samplingIdentity",
    );
    expect(updateSource.indexOf("previousSamplingIdentity")).toBeLessThan(
      updateSource.indexOf("planDishVisualTransition("),
    );
  });

  it("plans visual interpolation only in full motion and rebases from the rendered state", () => {
    const updateStart = rendererSource.indexOf(
      "const applySnapshotOverlayUpdate = (",
    );
    const resizeStart = rendererSource.indexOf(
      "const resizeScheduler =",
      updateStart,
    );
    const updateSource = rendererSource.slice(updateStart, resizeStart);

    expect(updateSource).toContain("const from = drawableState;");
    expect(updateSource).toContain(
      'if (motion === "full" && from !== null)',
    );
    expect(updateSource).toContain(
      "planDishVisualTransition(\n        from,\n        next.snapshot,\n        visualMotion,\n      )",
    );
    expect(updateSource).toContain(
      "drawableState = next.snapshot;",
    );
  });

  it("accepts visual continuity timing only through an explicit validated renderer input", () => {
    expect(rendererSource).toContain(
      "readonly visualMotion: DishVisualMotionSpec;",
    );
    expect(rendererSource).toContain(
      "let visualMotion = copyDishVisualMotionSpec(options.visualMotion);",
    );
    expect(rendererSource).toContain(
      "setVisualMotion(spec: DishVisualMotionSpec): void;",
    );
    expect(rendererSource).toContain(
      "visualMotion = copyDishVisualMotionSpec(nextSpec);",
    );
    expect(rendererSource).not.toContain("DEFAULT_DISH_VISUAL_MOTION");
  });

  it("advances camera and state continuity from the same elapsed-time ticker", () => {
    const tickerStart = rendererSource.indexOf("const ticker = () => {");
    const listenerStart = rendererSource.indexOf(
      "app.ticker.add(ticker);",
      tickerStart,
    );
    const tickerSource = rendererSource.slice(tickerStart, listenerStart);

    expect(tickerSource).toContain("cameraElapsedMs += app.ticker.deltaMS;");
    expect(tickerSource).toContain("visualElapsedMs += app.ticker.deltaMS;");
    expect(tickerSource).toContain("advanceDishVisualTransition(");
    expect(tickerSource).toContain("drawableState = step.state;");
    expect(tickerSource).toContain("visualTransition = null;");
    expect(tickerSource).toContain("if (changed) render();");
  });

  it("collapses reduced/off state transitions to the exact authoritative snapshot", () => {
    const modeStart = rendererSource.indexOf("setMotionMode(nextMode) {");
    const cameraStart = rendererSource.indexOf(
      "setCamera(nextCamera)",
      modeStart,
    );
    const modeSource = rendererSource.slice(modeStart, cameraStart);

    expect(modeSource).toContain('if (motion !== "full")');
    expect(modeSource).toContain("visualTransition = null;");
    expect(modeSource).toContain("visualElapsedMs = 0;");
    expect(modeSource).toContain("drawableState = snapshot;");
  });
});
