import { describe, expect, it } from "vitest";
import {
  MAX_CAMERA_ZOOM,
  MIN_CAMERA_ZOOM,
  panCamera,
  zoomCameraAroundPoint,
} from "./camera";

describe("dish camera", () => {
  it("pans in normalized world coordinates without leaving the dish domain", () => {
    const next = panCamera(
      { centerX: 0.5, centerY: 0.5, zoom: 2 },
      { x: 100, y: -50 },
      1000,
    );

    expect(next).toEqual({
      centerX: 0.45,
      centerY: 0.525,
      zoom: 2,
    });
  });

  it("keeps the point under the cursor stable while zooming", () => {
    const camera = { centerX: 0.5, centerY: 0.5, zoom: 1 };
    const pointer = { x: 750, y: 250 };
    const viewport = { x: 1000, y: 1000 };

    const next = zoomCameraAroundPoint(camera, pointer, viewport, 2);

    const beforeWorldX = camera.centerX + 0.25;
    const beforeWorldY = camera.centerY - 0.25;
    const afterWorldX =
      next.centerX + (pointer.x - 500) / (1000 * next.zoom);
    const afterWorldY =
      next.centerY + (pointer.y - 500) / (1000 * next.zoom);

    expect(afterWorldX).toBeCloseTo(beforeWorldX);
    expect(afterWorldY).toBeCloseTo(beforeWorldY);
  });

  it("clamps zoom to the renderer-supported semantic range", () => {
    expect(
      zoomCameraAroundPoint(
        { centerX: 0.5, centerY: 0.5, zoom: MIN_CAMERA_ZOOM },
        { x: 50, y: 50 },
        { x: 100, y: 100 },
        0.01,
      ).zoom,
    ).toBe(MIN_CAMERA_ZOOM);

    expect(
      zoomCameraAroundPoint(
        { centerX: 0.5, centerY: 0.5, zoom: MAX_CAMERA_ZOOM },
        { x: 50, y: 50 },
        { x: 100, y: 100 },
        100,
      ).zoom,
    ).toBe(MAX_CAMERA_ZOOM);
  });
});
