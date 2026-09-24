import { describe, expect, it } from "vitest";

import { MOTION } from "./tokens";
import {
  DISH_MOTION_PHASES,
  planDishMotionPhase,
  type DishMotionPhase,
} from "./dishVocabulary";

describe("dish semantic motion vocabulary", () => {
  it("covers every named phase with a deterministic plan or refusal", () => {
    for (const phase of DISH_MOTION_PHASES) {
      expect(() =>
        planDishMotionPhase({
          phase,
          preference: "full",
          evidence: evidenceFor(phase),
        }),
      ).not.toThrow();
    }
  });

  it("fails closed when biological-looking growth lacks authority", () => {
    expect(
      planDishMotionPhase({
        phase: "grow",
        preference: "full",
      }),
    ).toEqual({
      eligible: false,
      phase: "grow",
      reason: "evidence-mismatch",
      receivedEvidence: "none",
      acceptedEvidence: ["authoritative-state", "authoritative-event"],
    });
  });

  it("requires an authoritative event before presenting division", () => {
    expect(
      planDishMotionPhase({
        phase: "divide",
        preference: "full",
        evidence: "authoritative-state",
      }),
    ).toMatchObject({
      eligible: false,
      acceptedEvidence: ["authoritative-event"],
    });

    expect(
      planDishMotionPhase({
        phase: "divide",
        preference: "full",
        evidence: "authoritative-event",
      }),
    ).toMatchObject({
      eligible: true,
      treatment: "animate",
      semanticBoundary: "authoritative-change-presentation",
      preserveUserCamera: true,
    });
  });

  it("marks visual aggregation merge as LOD rather than biological fusion", () => {
    const plan = planDishMotionPhase({
      phase: "aggregate-merge",
      preference: "full",
      evidence: "presentation-lod",
    });

    expect(plan).toMatchObject({
      eligible: true,
      semanticBoundary: "presentation-only-lod",
      channels: ["opacity", "density", "contour"],
      preserveUserCamera: true,
    });
  });

  it("keeps causal changes perceptible when motion is off", () => {
    expect(
      planDishMotionPhase({
        phase: "recede",
        preference: "off",
        evidence: "authoritative-state",
      }),
    ).toMatchObject({
      eligible: true,
      treatment: "static-emphasis",
      durationMs: 0,
    });
  });

  it("reduces selection to a short non-spatial crossfade", () => {
    expect(
      planDishMotionPhase({
        phase: "select",
        preference: "reduced",
        evidence: "presentation-intent",
      }),
    ).toMatchObject({
      eligible: true,
      treatment: "crossfade",
      durationMs: 150,
      semanticBoundary: "presentation-only-interaction",
    });
  });

  it("removes placement travel in reduced motion", () => {
    expect(
      planDishMotionPhase({
        phase: "intervention-placement",
        preference: "reduced",
        evidence: "presentation-intent",
      }),
    ).toMatchObject({
      eligible: true,
      treatment: "instant",
      durationMs: 0,
    });
  });

  it("uses only existing named Petra timing tokens", () => {
    const evidence = evidenceFor("fungal-branch");
    const plan = planDishMotionPhase({
      phase: "fungal-branch",
      preference: "full",
      evidence,
    });
    if (!plan.eligible) throw new Error("expected eligible phase");

    expect(MOTION[plan.token].durationMs).toBe(plan.durationMs);
    expect(MOTION[plan.token].easing).toEqual(plan.easing);
  });

  it("rejects unknown phase values at runtime", () => {
    expect(() =>
      planDishMotionPhase({
        phase: "sparkle" as DishMotionPhase,
        preference: "full",
        evidence: "presentation-intent",
      }),
    ).toThrow(/unknown dish motion phase/);
  });
});

function evidenceFor(
  phase: DishMotionPhase,
):
  | "authoritative-state"
  | "authoritative-event"
  | "presentation-intent"
  | "presentation-lod" {
  if (phase === "divide") return "authoritative-event";
  if (phase === "aggregate-merge") return "presentation-lod";
  if (
    phase === "select" ||
    phase === "intervention-placement" ||
    phase === "focus"
  ) {
    return "presentation-intent";
  }
  return "authoritative-state";
}
