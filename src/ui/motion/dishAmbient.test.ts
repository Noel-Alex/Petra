import { describe, expect, it } from "vitest";

import { resolveDishAmbient } from "./dishAmbient";
import { MOTION } from "./tokens";

describe("resolveDishAmbient", () => {
  it("allows a slow decorative loop only in full motion", () => {
    expect(resolveDishAmbient("full")).toEqual({
      motion: {
        treatment: "animate",
        durationMs: MOTION.dishAmbient.durationMs,
        loops: true,
      },
      easing: MOTION.dishAmbient.easing,
    });
  });

  it.each(["reduced", "off"] as const)(
    "keeps %s mode static with no decorative loop",
    (preference) => {
      const presentation = resolveDishAmbient(preference);

      expect(presentation.motion.durationMs).toBe(0);
      expect(presentation.motion.loops).toBe(false);
      expect(presentation.motion.treatment).toBe("instant");
      expect(presentation.easing).toBe(MOTION.dishAmbient.easing);
    },
  );
});
