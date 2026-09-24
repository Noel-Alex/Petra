import { describe, expect, it } from "vitest";
import { applyKeyboardCameraKey } from "./keyboardCamera";

const viewport = { width: 800, height: 600 } as const;

describe("keyboard camera controls", () => {
  it("pans only for supported arrow keys and preserves camera bounds", () => {
    const start = { centerX: 0.5, centerY: 0.5, zoom: 2 };

    expect(applyKeyboardCameraKey(start, "ArrowLeft", viewport)).toEqual({
      handled: true,
      camera: { centerX: 0.455, centerY: 0.5, zoom: 2 },
    });
    expect(applyKeyboardCameraKey(start, "ArrowUp", viewport)).toEqual({
      handled: true,
      camera: { centerX: 0.5, centerY: 0.455, zoom: 2 },
    });
  });

  it("zooms around the current camera center", () => {
    const start = { centerX: 0.35, centerY: 0.6, zoom: 2 };
    const zoomed = applyKeyboardCameraKey(start, "+", viewport);

    expect(zoomed.handled).toBe(true);
    expect(zoomed.camera.centerX).toBe(0.35);
    expect(zoomed.camera.centerY).toBe(0.6);
    expect(zoomed.camera.zoom).toBeCloseTo(2.56);
  });

  it("resets with Home or 0 and ignores unrelated keys", () => {
    const start = { centerX: 0.2, centerY: 0.7, zoom: 4 };

    expect(applyKeyboardCameraKey(start, "Home", viewport)).toEqual({
      handled: true,
      camera: { centerX: 0.5, centerY: 0.5, zoom: 1 },
    });
    expect(applyKeyboardCameraKey(start, "x", viewport)).toEqual({
      handled: false,
      camera: start,
    });
  });
});
