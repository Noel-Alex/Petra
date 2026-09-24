import { describe, expect, it } from "vitest";
import {
  DECORATIVE_LOOP_SCHEMA_VERSION,
  resolveDecorativeLoop,
} from "./decorativeLoops";

describe("decorative loop motion authority", () => {
  it("keeps named onboarding loops asynchronous in full motion", () => {
    const primary = resolveDecorativeLoop("onboardingAmbientPrimary", "full");
    const secondary = resolveDecorativeLoop("onboardingAmbientSecondary", "full");
    const orbit = resolveDecorativeLoop("onboardingFocusOrbit", "full");

    expect(DECORATIVE_LOOP_SCHEMA_VERSION).toBe(1);
    expect(primary.motion).toEqual({
      treatment: "animate",
      durationMs: 8_000,
      loops: true,
    });
    expect(secondary.motion.durationMs).toBe(11_000);
    expect(secondary.motion.loops).toBe(true);
    expect(orbit.motion.durationMs).toBe(12_000);
    expect(orbit.motion.loops).toBe(true);
    expect(primary.easing).toEqual([0.42, 0, 0.58, 1]);
    expect(orbit.easing).toEqual([0, 0, 1, 1]);
  });

  it.each(["reduced", "off"] as const)(
    "collapses decorative loops to static presentation in %s motion",
    (preference) => {
      for (const name of [
        "onboardingAmbientPrimary",
        "onboardingAmbientSecondary",
        "onboardingFocusOrbit",
      ] as const) {
        const resolved = resolveDecorativeLoop(name, preference);
        expect(resolved.motion.durationMs).toBe(0);
        expect(resolved.motion.loops).toBe(false);
        expect(resolved.motion.treatment).toBe("instant");
      }
    },
  );
});
