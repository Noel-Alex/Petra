import { describe, expect, it } from "vitest";
import {
  clampCamera,
  panCamera,
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

  it("maps the viewport center to the camera center", () => {
    expect(
      screenToDish(
        { x: 400, y: 300 },
        { width: 800, height: 600 },
        { centerX: 0.3, centerY: 0.7, zoom: 2 },
      ),
    ).toEqual({ x: 0.3, y: 0.7 });
  });

  it("zooms around a dish anchor without moving the anchor away", () => {
    expect(
      zoomAroundDishPoint(
        { centerX: 0.5, centerY: 0.5, zoom: 1 },
        { x: 0.75, y: 0.5 },
        2,
      ),
    ).toEqual({ centerX: 0.625, centerY: 0.5, zoom: 2 });
  });

  it("pans in screen pixels while respecting semantic camera bounds", () => {
    expect(
      panCamera(
        { centerX: 0.5, centerY: 0.5, zoom: 2 },
        { x: 100, y: -50 },
        { width: 800, height: 600 },
      ),
    ).toEqual({
      centerX: 0.4166666666666667,
      centerY: 0.5416666666666666,
      zoom: 2,
    });
  });
});
