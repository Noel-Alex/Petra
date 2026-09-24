import { describe, expect, it } from "vitest";

import { MOTION } from "../ui/motion/tokens";
import { resolveDishCameraMotion } from "./dishCameraMotion";

describe("dish camera motion adapter", () => {
  it("uses the named camera token for full spatial travel", () => {
    const plan = resolveDishCameraMotion("full");

    expect(plan.mode).toBe("full");
    expect(plan.treatment).toBe("animate");
    expect(plan.cameraMotion).toEqual({
      durationMs: MOTION.cameraFocus.durationMs,
      easing: MOTION.cameraFocus.easing,
    });
  });

  it("does not encode spatial travel in reduced motion", () => {
    const plan = resolveDishCameraMotion("reduced");

    expect(plan.mode).toBe("reduced");
    expect(plan.treatment).toBe("crossfade");
    expect(plan.cameraMotion.durationMs).toBe(0);
    expect(plan.cameraMotion.easing).toBe(MOTION.cameraFocus.easing);
  });

  it("keeps motion-off instant and travel-free", () => {
    const plan = resolveDishCameraMotion("off");

    expect(plan.mode).toBe("off");
    expect(plan.treatment).toBe("instant");
    expect(plan.cameraMotion.durationMs).toBe(0);
  });
});
