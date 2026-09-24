import { describe, expect, it } from "vitest";
import {
  resolveMotion,
  resolveMotionPreference,
  type MotionRequest,
} from "./policy";

const causal: MotionRequest = {
  kind: "causal",
  durationMs: 420,
  loops: true,
};

describe("resolveMotionPreference", () => {
  it("uses the explicit in-app preference over the OS preference", () => {
    expect(
      resolveMotionPreference({
        explicit: "full",
        prefersReducedMotion: true,
      }),
    ).toBe("full");
  });

  it("maps prefers-reduced-motion to reduced when no override exists", () => {
    expect(
      resolveMotionPreference({
        prefersReducedMotion: true,
      }),
    ).toBe("reduced");
  });
});

describe("resolveMotion", () => {
  it("preserves the requested treatment in full mode", () => {
    expect(resolveMotion("full", causal)).toEqual({
      treatment: "animate",
      durationMs: 420,
      loops: true,
    });
  });

  it("retains causal meaning as a bounded crossfade in reduced mode", () => {
    expect(resolveMotion("reduced", causal)).toEqual({
      treatment: "crossfade",
      durationMs: 180,
      loops: false,
    });
  });

  it("turns spatial and decorative movement into instant state in reduced mode", () => {
    expect(
      resolveMotion("reduced", {
        kind: "spatial",
        durationMs: 800,
        distancePx: 900,
        loops: true,
      }),
    ).toEqual({
      treatment: "instant",
      durationMs: 0,
      loops: false,
    });
  });

  it("keeps static causal emphasis when motion is off", () => {
    expect(resolveMotion("off", causal)).toEqual({
      treatment: "static-emphasis",
      durationMs: 0,
      loops: false,
    });
  });

  it("rejects invalid wall-clock durations", () => {
    expect(() =>
      resolveMotion("full", {
        kind: "decorative",
        durationMs: Number.NaN,
      }),
    ).toThrow(RangeError);

    expect(() =>
      resolveMotion("full", {
        kind: "decorative",
        durationMs: -1,
      }),
    ).toThrow(RangeError);
  });
});
