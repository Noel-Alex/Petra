import { describe, expect, it } from "vitest";
import { resolveCausalEventChoreography } from "./events";

describe("causal event choreography", () => {
  it("keeps full-motion event cues deterministic and bounded to named tokens", () => {
    const plan = resolveCausalEventChoreography(
      "intervention-applied",
      "full",
    );

    expect(plan.motionToken).toBe("interventionPulse");
    expect(plan.cameraPolicy).toBe("preserve-user-view");
    expect(plan.requiresAuthoritativeEvent).toBe(true);
    expect(plan.timingMeaning).toBe("presentation-wall-time-only");
    expect(plan.cues).toEqual([
      expect.objectContaining({
        visual: "field-wave",
        essential: true,
        startMs: 0,
        treatment: "animate",
      }),
      expect.objectContaining({
        visual: "impact-ring",
        essential: false,
        treatment: "animate",
      }),
    ]);
  });

  it("preserves essential scientific emphasis under reduced motion", () => {
    const plan = resolveCausalEventChoreography(
      "mutation-observed",
      "reduced",
    );

    expect(plan.cues.every((cue) => cue.startMs === 0)).toBe(true);
    expect(
      plan.cues.find((cue) => cue.visual === "lineage-branch"),
    ).toMatchObject({
      essential: true,
      treatment: "crossfade",
    });
    expect(
      plan.cues.find((cue) => cue.visual === "mutation-spark"),
    ).toMatchObject({
      essential: false,
      treatment: "instant",
      durationMs: 0,
    });
  });

  it("drops decorative cues but retains static causal meaning when motion is off", () => {
    const plan = resolveCausalEventChoreography(
      "selection-shift-observed",
      "off",
    );

    expect(plan.cues).toEqual([
      expect.objectContaining({
        visual: "lineage-outline",
        essential: true,
        startMs: 0,
        durationMs: 0,
        treatment: "static-emphasis",
      }),
    ]);
  });

  it("uses dedicated field and lysis tokens within the documented event budgets", () => {
    const depletion = resolveCausalEventChoreography(
      "nutrient-depletion-observed",
      "full",
    );
    const lysis = resolveCausalEventChoreography("lysis-observed", "full");

    expect(depletion.motionToken).toBe("fieldShift");
    expect(lysis.motionToken).toBe("lysisBurst");
    expect(
      Math.max(...lysis.cues.map((cue) => cue.startMs + cue.durationMs)),
    ).toBeLessThanOrEqual(440);
  });

  it("never uses animation callbacks as scientific authority", () => {
    for (const kind of [
      "intervention-applied",
      "mutation-observed",
      "selection-shift-observed",
      "nutrient-depletion-observed",
      "lysis-observed",
    ] as const) {
      const plan = resolveCausalEventChoreography(kind, "full");
      expect(plan.requiresAuthoritativeEvent).toBe(true);
      expect(plan.cameraPolicy).toBe("preserve-user-view");
      expect(plan.cues.every((cue) => cue.durationMs >= 0)).toBe(true);
    }
  });
});
