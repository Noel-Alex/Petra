import { describe, expect, it } from "vitest";
import {
  DEFAULT_WHEEL_ZOOM_POLICY,
  normalizeWheelDeltaY,
  wheelZoomFactor,
  WHEEL_DELTA_LINE,
  WHEEL_DELTA_PAGE,
  WHEEL_DELTA_PIXEL,
} from "./wheelZoom";

const VIEWPORT_HEIGHT = 600;

describe("wheel zoom input policy", () => {
  it("normalizes equivalent pixel, line, and page deltas equally", () => {
    const pixel = { deltaY: 120, deltaMode: WHEEL_DELTA_PIXEL, viewportHeight: VIEWPORT_HEIGHT };
    const line = { deltaY: 7.5, deltaMode: WHEEL_DELTA_LINE, viewportHeight: VIEWPORT_HEIGHT };
    const page = { deltaY: 0.2, deltaMode: WHEEL_DELTA_PAGE, viewportHeight: VIEWPORT_HEIGHT };

    expect(normalizeWheelDeltaY(pixel)).toBe(120);
    expect(normalizeWheelDeltaY(line)).toBe(120);
    expect(normalizeWheelDeltaY(page)).toBe(120);
    expect(wheelZoomFactor(pixel)).toBeCloseTo(wheelZoomFactor(line), 12);
    expect(wheelZoomFactor(line)).toBeCloseTo(wheelZoomFactor(page), 12);
  });

  it("preserves high-resolution pixel deltas without quantization", () => {
    const factor = wheelZoomFactor({
      deltaY: 0.25,
      deltaMode: WHEEL_DELTA_PIXEL,
      viewportHeight: VIEWPORT_HEIGHT,
    });

    expect(factor).toBeGreaterThan(0);
    expect(factor).not.toBe(1);
    expect(factor).toBeCloseTo(Math.exp(-0.25 * 0.0015), 12);
  });

  it("preserves zoom direction and reciprocal equal-magnitude factors", () => {
    const outward = wheelZoomFactor({
      deltaY: 80,
      deltaMode: WHEEL_DELTA_PIXEL,
      viewportHeight: VIEWPORT_HEIGHT,
    });
    const inward = wheelZoomFactor({
      deltaY: -80,
      deltaMode: WHEEL_DELTA_PIXEL,
      viewportHeight: VIEWPORT_HEIGHT,
    });

    expect(outward).toBeLessThan(1);
    expect(inward).toBeGreaterThan(1);
    expect(outward * inward).toBeCloseTo(1, 12);
  });

  it("bounds giant line and page deltas before exponentiation", () => {
    expect(
      normalizeWheelDeltaY({
        deltaY: 1000,
        deltaMode: WHEEL_DELTA_LINE,
        viewportHeight: VIEWPORT_HEIGHT,
      }),
    ).toBe(DEFAULT_WHEEL_ZOOM_POLICY.maximumDeltaPx);

    expect(
      normalizeWheelDeltaY({
        deltaY: -100,
        deltaMode: WHEEL_DELTA_PAGE,
        viewportHeight: VIEWPORT_HEIGHT,
      }),
    ).toBe(-DEFAULT_WHEEL_ZOOM_POLICY.maximumDeltaPx);
  });

  it("returns neutral factor for zero delta", () => {
    expect(
      wheelZoomFactor({
        deltaY: 0,
        deltaMode: WHEEL_DELTA_PIXEL,
        viewportHeight: VIEWPORT_HEIGHT,
      }),
    ).toBe(1);
  });

  it("rejects invalid input and policy values", () => {
    expect(() =>
      normalizeWheelDeltaY({
        deltaY: Number.NaN,
        deltaMode: WHEEL_DELTA_PIXEL,
        viewportHeight: VIEWPORT_HEIGHT,
      }),
    ).toThrow(/deltaY must be finite/);

    expect(() =>
      normalizeWheelDeltaY({
        deltaY: 1,
        deltaMode: 99,
        viewportHeight: VIEWPORT_HEIGHT,
      }),
    ).toThrow(/unsupported wheel deltaMode/);

    expect(() =>
      normalizeWheelDeltaY({
        deltaY: 1,
        deltaMode: WHEEL_DELTA_PAGE,
        viewportHeight: 0,
      }),
    ).toThrow(/viewportHeight/);

    expect(() =>
      wheelZoomFactor(
        {
          deltaY: 1,
          deltaMode: WHEEL_DELTA_PIXEL,
          viewportHeight: VIEWPORT_HEIGHT,
        },
        { ...DEFAULT_WHEEL_ZOOM_POLICY, sensitivityPerPx: 0 },
      ),
    ).toThrow(/sensitivityPerPx/);
  });
});
