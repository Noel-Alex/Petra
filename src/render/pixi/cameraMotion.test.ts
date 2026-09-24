import { describe, expect, it } from "vitest";
import {
  cameraTransitionComplete,
  cubicBezierProgress,
  interpolateCameraTransition,
} from "./cameraMotion";

const easing = [0.16, 1, 0.3, 1] as const;

describe("camera motion", () => {
  it("is driven by elapsed wall time rather than frame count", () => {
    const from = { centerX: 0.5, centerY: 0.5, zoom: 1 };
    const to = { centerX: 0.25, centerY: 0.75, zoom: 3 };

    const at260ms = interpolateCameraTransition({
      from,
      to,
      elapsedMs: 260,
      motion: { durationMs: 520, easing },
    });

    const sameWallTimeFromManyFrames = interpolateCameraTransition({
      from,
      to,
      elapsedMs: 26 * 10,
      motion: { durationMs: 520, easing },
    });

    expect(sameWallTimeFromManyFrames).toEqual(at260ms);
    expect(at260ms.zoom).toBeGreaterThan(1);
    expect(at260ms.zoom).toBeLessThan(3);
  });

  it("lands exactly on the target at or after the duration", () => {
    const from = { centerX: 0.5, centerY: 0.5, zoom: 1 };
    const to = { centerX: 0.2, centerY: 0.8, zoom: 4 };

    expect(
      interpolateCameraTransition({
        from,
        to,
        elapsedMs: 520,
        motion: { durationMs: 520, easing },
      }),
    ).toEqual(to);
    expect(cameraTransitionComplete({ elapsedMs: 800, durationMs: 520 })).toBe(
      true,
    );
  });

  it("supports an immediate zero-duration treatment", () => {
    const from = { centerX: 0.5, centerY: 0.5, zoom: 1 };
    const to = { centerX: 0.1, centerY: 0.9, zoom: 2 };

    expect(
      interpolateCameraTransition({
        from,
        to,
        elapsedMs: 0,
        motion: { durationMs: 0, easing },
      }),
    ).toEqual(to);
  });

  it("resolves CSS-style easing endpoints and monotonic progress", () => {
    expect(cubicBezierProgress(0, easing)).toBe(0);
    expect(cubicBezierProgress(1, easing)).toBe(1);

    const samples = [0.1, 0.25, 0.5, 0.75, 0.9].map((progress) =>
      cubicBezierProgress(progress, easing),
    );

    for (let index = 1; index < samples.length; index += 1) {
      expect(samples[index]).toBeGreaterThan(samples[index - 1] ?? -1);
    }
  });
});
