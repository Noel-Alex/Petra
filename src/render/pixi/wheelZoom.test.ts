import { describe, expect, it } from "vitest";
import {
  DEFAULT_WHEEL_ZOOM_POLICY,
  normalizeWheelDeltaY,
  validateWheelZoomPolicy,
  wheelZoomFactor,
} from "./wheelZoom";

describe("wheel zoom normalization", () => {
  it("normalizes equivalent pixel, line, and page inputs identically", () => {
    const pixel = normalizeWheelDeltaY({
      deltaY: 120,
      deltaMode: 0,
      viewportHeight: 600,
    });
    const line = normalizeWheelDeltaY({
      deltaY: 7.5,
      deltaMode: 1,
      viewportHeight: 600,
    });
    const page = normalizeWheelDeltaY({
      deltaY: 0.2,
      deltaMode: 2,
      viewportHeight: 600,
    });

    expect(pixel).toBe(120);
    expect(line).toBe(pixel);
    expect(page).toBe(pixel);

    expect(
      wheelZoomFactor({ deltaY: 120, deltaMode: 0, viewportHeight: 600 }),
    ).toBeCloseTo(
      wheelZoomFactor({ deltaY: 7.5, deltaMode: 1, viewportHeight: 600 }),
      14,
    );
    expect(
      wheelZoomFactor({ deltaY: 0.2, deltaMode: 2, viewportHeight: 600 }),
    ).toBeCloseTo(
      wheelZoomFactor({ deltaY: 120, deltaMode: 0, viewportHeight: 600 }),
      14,
    );
  });

  it("preserves high-resolution trackpad deltas without quantization", () => {
    const factor = wheelZoomFactor({
      deltaY: 0.25,
      deltaMode: 0,
      viewportHeight: 600,
    });

    expect(factor).not.toBe(1);
    expect(factor).toBeCloseTo(Math.exp(-0.25 * 0.0015), 14);
  });

  it("preserves direction and reciprocal symmetry before camera clamping", () => {
    const inFactor = wheelZoomFactor({
      deltaY: -80,
      deltaMode: 0,
      viewportHeight: 600,
    });
    const outFactor = wheelZoomFactor({
      deltaY: 80,
      deltaMode: 0,
      viewportHeight: 600,
    });

    expect(inFactor).toBeGreaterThan(1);
    expect(outFactor).toBeLessThan(1);
    expect(inFactor * outFactor).toBeCloseTo(1, 14);
  });

  it("caps giant line and page deltas before exponentiation", () => {
    expect(
      normalizeWheelDeltaY({
        deltaY: 1_000,
        deltaMode: 1,
        viewportHeight: 600,
      }),
    ).toBe(DEFAULT_WHEEL_ZOOM_POLICY.maximumDeltaPx);
    expect(
      normalizeWheelDeltaY({
        deltaY: -100,
        deltaMode: 2,
        viewportHeight: 600,
      }),
    ).toBe(-DEFAULT_WHEEL_ZOOM_POLICY.maximumDeltaPx);
  });

  it("maps zero intent to an identity zoom factor", () => {
    expect(
      wheelZoomFactor({ deltaY: 0, deltaMode: 0, viewportHeight: 600 }),
    ).toBe(1);
  });

  it("fails closed on unsupported input or invalid presentation policy", () => {
    expect(() =>
      normalizeWheelDeltaY({
        deltaY: Number.NaN,
        deltaMode: 0,
        viewportHeight: 600,
      }),
    ).toThrow(/deltaY must be finite/);
    expect(() =>
      normalizeWheelDeltaY({
        deltaY: 1,
        deltaMode: 99,
        viewportHeight: 600,
      }),
    ).toThrow(/unsupported wheel deltaMode/);
    expect(() =>
      normalizeWheelDeltaY({
        deltaY: 1,
        deltaMode: 0,
        viewportHeight: 0,
      }),
    ).toThrow(/viewportHeight/);

    expect(() =>
      validateWheelZoomPolicy({
        ...DEFAULT_WHEEL_ZOOM_POLICY,
        lineEquivalentPx: 0,
      }),
    ).toThrow(/lineEquivalentPx/);
    expect(() =>
      validateWheelZoomPolicy({
        ...DEFAULT_WHEEL_ZOOM_POLICY,
        maximumDeltaPx: Number.POSITIVE_INFINITY,
      }),
    ).toThrow(/maximumDeltaPx/);
    expect(() =>
      validateWheelZoomPolicy({
        ...DEFAULT_WHEEL_ZOOM_POLICY,
        sensitivityPerPx: -1,
      }),
    ).toThrow(/sensitivityPerPx/);
  });
});
