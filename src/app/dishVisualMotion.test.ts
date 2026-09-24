import { describe, expect, it } from "vitest";

import { MOTION } from "../ui/motion/tokens";
import { resolveDishVisualMotion } from "./dishVisualMotion";

describe("dish visual motion adapter", () => {
  it("uses the shared field-shift token for full snapshot continuity", () => {
    const plan = resolveDishVisualMotion("full");

    expect(plan.mode).toBe("full");
    expect(plan.treatment).toBe("animate");
    expect(plan.visualMotion).toEqual({
      durationMs: MOTION.fieldShift.durationMs,
      easing: MOTION.fieldShift.easing,
    });
  });

  it("keeps reduced motion free of generic spatial interpolation", () => {
    const plan = resolveDishVisualMotion("reduced");

    expect(plan.mode).toBe("reduced");
    expect(plan.treatment).toBe("instant");
    expect(plan.visualMotion.durationMs).toBe(0);
    expect(plan.visualMotion.easing).toBe(MOTION.fieldShift.easing);
  });

  it("keeps motion-off immediate at exact authoritative snapshots", () => {
    const plan = resolveDishVisualMotion("off");

    expect(plan.mode).toBe("off");
    expect(plan.treatment).toBe("instant");
    expect(plan.visualMotion.durationMs).toBe(0);
  });
});
