import { describe, expect, it } from "vitest";

import { MOTION } from "../ui/motion/tokens";
import { resolveDishHyphalMotion } from "./dishHyphalMotion";

describe("dish hyphal motion adapter", () => {
  it("uses the evidence-gated fungal branch phase for full path growth", () => {
    const plan = resolveDishHyphalMotion("full");

    expect(plan.mode).toBe("full");
    expect(plan.treatment).toBe("animate");
    expect(plan.motion).toEqual({
      durationMs: MOTION.fieldShift.durationMs,
      easing: MOTION.fieldShift.easing,
    });
  });

  it("settles reduced motion immediately on exact fungal geometry", () => {
    const plan = resolveDishHyphalMotion("reduced");

    expect(plan.treatment).toBe("crossfade");
    expect(plan.motion.durationMs).toBe(0);
    expect(plan.motion.easing).toBe(MOTION.fieldShift.easing);
  });

  it("keeps motion-off static and exact", () => {
    const plan = resolveDishHyphalMotion("off");

    expect(plan.treatment).toBe("static-emphasis");
    expect(plan.motion.durationMs).toBe(0);
  });
});
