import { describe, expect, it } from "vitest";
import rawRendererSource from "./renderer.ts?raw";

const rendererSource = rawRendererSource.replace(/\r\n/g, "\n");

describe("Pixi camera transform fast path", () => {
  it("keeps prepared raster/contour geometry in one transformable masked layer", () => {
    expect(rendererSource).toContain(
      "const preparedCameraLayer = new Container()",
    );
    expect(rendererSource).toContain(
      "preparedCameraLayer.addChild(\n    fieldSprite,\n    fieldLayer,\n    densitySprite,\n    densityLayer,\n  )",
    );
    expect(rendererSource).toContain(
      "dataLayer.addChild(preparedCameraLayer, glyphLayer)",
    );
    expect(rendererSource).toContain(
      "resolvePreparedCameraLayerTransform(",
    );
    expect(rendererSource).toContain(
      "preparedCameraLayer.position.set(transform.x, transform.y)",
    );
    expect(rendererSource).toContain(
      "preparedCameraLayer.scale.set(transform.scale, transform.scale)",
    );
  });

  it("uses the transform path for pointer camera movement instead of replaying the full scene", () => {
    const pointerStart = rendererSource.indexOf(
      "const onPointerMove = (event: PointerEvent) => {",
    );
    const pointerEnd = rendererSource.indexOf(
      "const finishPointer = (",
      pointerStart,
    );
    const pointerSource = rendererSource.slice(
      pointerStart,
      pointerEnd,
    );

    expect(pointerSource).toContain("renderCameraOnly();");
    expect(pointerSource).not.toContain("render();");
    expect(pointerSource).not.toContain("drawField(");
    expect(pointerSource).not.toContain("drawLineageDensity(");
  });

  it("rebakes zoom once when a direct multi-pointer gesture settles", () => {
    const finishStart = rendererSource.indexOf(
      "const finishPointer = (",
    );
    const wheelStart = rendererSource.indexOf(
      "const onWheel = (event: WheelEvent) => {",
      finishStart,
    );
    const finishSource = rendererSource.slice(
      finishStart,
      wheelStart,
    );

    expect(finishSource).toContain(
      "gestureState.active.length === 0",
    );
    expect(finishSource).toContain(
      "camera.zoom !== preparedCamera.zoom",
    );
    expect(finishSource).toContain("render();");
  });

  it("keeps scientific interpolation conservative while camera-only ticker frames stay transform-only", () => {
    const tickerStart = rendererSource.indexOf(
      "const ticker = () => {",
    );
    const tickerEnd = rendererSource.indexOf(
      "app.ticker.add(ticker);",
      tickerStart,
    );
    const tickerSource = rendererSource.slice(
      tickerStart,
      tickerEnd,
    );

    expect(tickerSource).toContain("let cameraChanged = false;");
    expect(tickerSource).toContain("let visualChanged = false;");
    expect(tickerSource).toContain("if (visualChanged) {");
    expect(tickerSource).toContain("render();");
    expect(tickerSource).toContain("else if (cameraChanged) {");
    expect(tickerSource).toContain("renderCameraState(true);");
  });

  it("redraws semantic glyph/selection presentation on every camera fast frame", () => {
    const fastStart = rendererSource.indexOf(
      "const renderCameraOnly = () => {",
    );
    const fastEnd = rendererSource.indexOf(
      "const renderCameraState = (",
      fastStart,
    );
    const fastSource = rendererSource.slice(fastStart, fastEnd);

    expect(fastSource).toContain(
      "semanticZoomObserver.update(semanticZoomLevel(camera.zoom))",
    );
    expect(fastSource).toContain(
      "drawGlyphAndSelectionLayer({",
    );
    expect(fastSource).not.toContain("drawScene({");
  });
});
