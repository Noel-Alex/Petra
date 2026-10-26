import { describe, expect, it } from "vitest";

import {
  MINIMUM_RASTER_REFRESH_INTERVAL_MS,
  MINIMUM_VECTOR_REFRESH_INTERVAL_MS,
  resolveDishTransitionRefresh,
} from "./transitionRefresh";

const preparedAtZero = {
  lastVectorSourcePreparedAtMs: 0,
  lastRasterPreparedAtMs: 0,
  hasPreparedFrame: true,
};

describe("dish transition refresh scheduling", () => {
  it("skips full-buffer interpolation work between visible raster deadlines", () => {
    for (const nowMs of [1, 16, 32]) {
      expect(
        resolveDishTransitionRefresh({
          ...preparedAtZero,
          nowMs,
          elapsedMs: nowMs,
          durationMs: 400,
        }),
      ).toEqual({
        complete: false,
        evaluateFrame: false,
        refreshVectorSource: false,
        refreshRaster: false,
      });
    }
  });

  it("keeps scalar raster updates near 30 Hz and vector preparation near 10 Hz", () => {
    const raster = resolveDishTransitionRefresh({
      ...preparedAtZero,
      nowMs: MINIMUM_RASTER_REFRESH_INTERVAL_MS,
      elapsedMs: MINIMUM_RASTER_REFRESH_INTERVAL_MS,
      durationMs: 400,
    });
    expect(raster).toEqual({
      complete: false,
      evaluateFrame: true,
      refreshVectorSource: false,
      refreshRaster: true,
    });

    const vector = resolveDishTransitionRefresh({
      ...preparedAtZero,
      nowMs: MINIMUM_VECTOR_REFRESH_INTERVAL_MS,
      elapsedMs: MINIMUM_VECTOR_REFRESH_INTERVAL_MS,
      durationMs: 400,
    });
    expect(vector).toEqual({
      complete: false,
      evaluateFrame: true,
      refreshVectorSource: true,
      refreshRaster: true,
    });
  });

  it("always emits the exact target at transition completion", () => {
    const decision = resolveDishTransitionRefresh({
      ...preparedAtZero,
      nowMs: 48,
      elapsedMs: 400,
      durationMs: 400,
    });
    expect(decision).toEqual({
      complete: true,
      evaluateFrame: true,
      refreshVectorSource: true,
      refreshRaster: true,
    });
  });

  it("forces the initial frame when no source presentation has been prepared", () => {
    expect(
      resolveDishTransitionRefresh({
        nowMs: 0,
        elapsedMs: 0,
        durationMs: 400,
        lastVectorSourcePreparedAtMs: Number.NEGATIVE_INFINITY,
        lastRasterPreparedAtMs: Number.NEGATIVE_INFINITY,
        hasPreparedFrame: false,
      }),
    ).toEqual({
      complete: false,
      evaluateFrame: true,
      refreshVectorSource: true,
      refreshRaster: true,
    });
  });

  it("rejects invalid elapsed-time and refresh-clock inputs", () => {
    expect(() =>
      resolveDishTransitionRefresh({
        ...preparedAtZero,
        nowMs: Number.NaN,
        elapsedMs: 0,
        durationMs: 1,
      }),
    ).toThrow(RangeError);
    expect(() =>
      resolveDishTransitionRefresh({
        ...preparedAtZero,
        nowMs: 1,
        elapsedMs: 0,
        durationMs: 1,
        lastVectorSourcePreparedAtMs: Number.POSITIVE_INFINITY,
      }),
    ).toThrow(RangeError);
  });
});
