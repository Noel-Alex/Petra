import { describe, expect, it } from "vitest";
import {
  clampCamera,
  DISH_VIEWPORT_DIAMETER_FRACTION,
  dishToScreen,
  panCamera,
  resolveDishViewportGeometry,
  screenToDish,
  zoomAroundDishPoint,
} from "./camera";

describe("Pixi dish camera helpers", () => {
  it("clamps overview and zoomed cameras inside the normalized dish", () => {
    expect(clampCamera({ centerX: -2, centerY: 3, zoom: 1 })).toEqual({
      centerX: 0.5,
      centerY: 0.5,
      zoom: 1,
    });

    expect(clampCamera({ centerX: 0, centerY: 1, zoom: 4 })).toEqual({
      centerX: 0.125,
      centerY: 0.875,
      zoom: 4,
    });
  });

  it("resolves one visible dish aperture for drawing and input math", () => {
    const geometry = resolveDishViewportGeometry({
      width: 800,
      height: 600,
    });

    expect(geometry).toEqual({
      centerX: 400,
      centerY: 300,
      diameter: 600 * DISH_VIEWPORT_DIAMETER_FRACTION,
      radius: 300 * DISH_VIEWPORT_DIAMETER_FRACTION,
    });
  });

  it("maps the viewport center to the camera center", () => {
    expect(
      screenToDish(
        { x: 400, y: 300 },
        { width: 800, height: 600 },
        { centerX: 0.3, centerY: 0.7, zoom: 2 },
      ),
    ).toEqual({ x: 0.3, y: 0.7 });
  });

  it("maps the actual visible rim to the normalized dish rim", () => {
    const viewport = { width: 800, height: 600 };
    const geometry = resolveDishViewportGeometry(viewport);

    expect(
      screenToDish(
        { x: geometry.centerX + geometry.radius, y: geometry.centerY },
        viewport,
        { centerX: 0.5, centerY: 0.5, zoom: 1 },
      ),
    ).toEqual({ x: 1, y: 0.5 });
  });

  it("round-trips dish coordinates through the same geometry on non-square viewports", () => {
    for (const viewport of [
      { width: 800, height: 600 },
      { width: 600, height: 900 },
      { width: 1200, height: 500 },
    ]) {
      const geometry = resolveDishViewportGeometry(viewport);
      const camera = { centerX: 0.42, centerY: 0.58, zoom: 2.7 };
      const dishPoint = { x: 0.47, y: 0.61 };
      const screenPoint = dishToScreen(dishPoint, camera, geometry);
      const roundTrip = screenToDish(screenPoint, viewport, camera);

      expect(roundTrip.x).toBeCloseTo(dishPoint.x, 12);
      expect(roundTrip.y).toBeCloseTo(dishPoint.y, 12);
    }
  });

  it("zooms around a dish anchor without moving its visible pixel", () => {
    const viewport = { width: 800, height: 600 };
    const geometry = resolveDishViewportGeometry(viewport);
    const camera = { centerX: 0.5, centerY: 0.5, zoom: 1 };
    const anchor = { x: 0.62, y: 0.44 };
    const before = dishToScreen(anchor, camera, geometry);
    const zoomed = zoomAroundDishPoint(camera, anchor, 2);
    const after = dishToScreen(anchor, zoomed, geometry);

    expect(after.x).toBeCloseTo(before.x, 12);
    expect(after.y).toBeCloseTo(before.y, 12);
  });

  it("pans by exact visible screen pixels using the shared dish diameter", () => {
    const viewport = { width: 800, height: 600 };
    const geometry = resolveDishViewportGeometry(viewport);
    const camera = { centerX: 0.5, centerY: 0.5, zoom: 2 };
    const referencePoint = { x: 0.5, y: 0.5 };
    const before = dishToScreen(referencePoint, camera, geometry);
    const panned = panCamera(camera, { x: 100, y: -50 }, viewport);
    const after = dishToScreen(referencePoint, panned, geometry);

    expect(panned.centerX).toBeCloseTo(0.4103942652329749, 12);
    expect(panned.centerY).toBeCloseTo(0.5448028673835126, 12);
    expect(after.x - before.x).toBeCloseTo(100, 12);
    expect(after.y - before.y).toBeCloseTo(-50, 12);
  });

  it("rejects invalid viewport geometry before coordinate conversion", () => {
    expect(() =>
      resolveDishViewportGeometry({ width: 0, height: 600 }),
    ).toThrow(/viewport dimensions/);
    expect(() =>
      screenToDish(
        { x: 0, y: 0 },
        { width: Number.NaN, height: 600 },
        { centerX: 0.5, centerY: 0.5, zoom: 1 },
      ),
    ).toThrow(/viewport dimensions/);
  });
});
