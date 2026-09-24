import { describe, expect, it } from "vitest";
import {
  canContinue,
  currentStage,
  initialOnboardingState,
  ONBOARDING_STAGES,
  reduceOnboarding,
  resolveOnboardingPresentation,
  type ScientificGate,
} from "./story";

function satisfy(
  state: ReturnType<typeof initialOnboardingState>,
  gate: ScientificGate,
) {
  return reduceOnboarding(state, { type: "scientific-gate", gate });
}

describe("onboarding story", () => {
  it("starts with the whole-dish ecosystem story", () => {
    const state = initialOnboardingState();
    expect(currentStage(state).id).toBe("ecosystem");
    expect(canContinue(state)).toBe(true);
  });

  it("uses one deterministic canonical stage order", () => {
    expect(ONBOARDING_STAGES.map((stage) => stage.id)).toEqual([
      "ecosystem",
      "inoculation",
      "growth",
      "pressure",
      "selection",
      "handoff",
    ]);
  });

  it("cannot narratively fake gated scientific progress", () => {
    let state = initialOnboardingState();
    state = reduceOnboarding(state, { type: "continue" });
    expect(currentStage(state).id).toBe("inoculation");
    expect(canContinue(state)).toBe(false);

    const unchanged = reduceOnboarding(state, { type: "continue" });
    expect(currentStage(unchanged).id).toBe("inoculation");

    state = satisfy(state, "inoculation-recorded");
    state = reduceOnboarding(state, { type: "continue" });
    expect(currentStage(state).id).toBe("growth");
  });

  it("requires authoritative gates in causal order", () => {
    let state = initialOnboardingState();
    state = reduceOnboarding(state, { type: "continue" });

    const gates: readonly ScientificGate[] = [
      "inoculation-recorded",
      "population-growth-observed",
      "antibiotic-command-recorded",
      "resistant-lineage-frequency-increased",
    ];

    const expected = ["growth", "pressure", "selection", "handoff"] as const;

    for (let index = 0; index < gates.length; index += 1) {
      state = satisfy(state, gates[index]!);
      state = reduceOnboarding(state, { type: "continue" });
      expect(currentStage(state).id).toBe(expected[index]);
    }

    state = reduceOnboarding(state, { type: "continue" });
    expect(state.completed).toBe(true);
    expect(state.skipped).toBe(false);
  });

  it("retreats without escaping the canonical sequence", () => {
    const start = initialOnboardingState();
    expect(reduceOnboarding(start, { type: "back" })).toEqual(start);

    const inoculation = reduceOnboarding(start, { type: "continue" });
    const back = reduceOnboarding(inoculation, { type: "back" });
    expect(currentStage(back).id).toBe("ecosystem");
  });

  it("skip exits onboarding without manufacturing scientific gates", () => {
    const skipped = reduceOnboarding(initialOnboardingState(), { type: "skip" });
    expect(skipped.completed).toBe(true);
    expect(skipped.skipped).toBe(true);
    expect(skipped.satisfiedGates.size).toBe(0);
    expect(currentStage(skipped).id).toBe("handoff");
  });

  it("degrades causal choreography accessibly", () => {
    let state = initialOnboardingState();
    state = reduceOnboarding(state, { type: "continue" });

    const reduced = resolveOnboardingPresentation(state, "reduced");
    expect(reduced.stage.motionKind).toBe("causal");
    expect(reduced.stage.motionToken).toBe("interventionPulse");
    expect(reduced.easing).toEqual([0.22, 0.78, 0.28, 1]);
    expect(reduced.motion.treatment).toBe("crossfade");
    expect(reduced.motion.loops).toBe(false);
    expect(reduced.announceText).toContain("Start with a population.");

    const off = resolveOnboardingPresentation(state, "off");
    expect(off.motion.treatment).toBe("static-emphasis");
    expect(off.motion.durationMs).toBe(0);
  });

  it("reset restores a clean replayable story", () => {
    let state = initialOnboardingState();
    state = reduceOnboarding(state, {
      type: "scientific-gate",
      gate: "inoculation-recorded",
    });
    state = reduceOnboarding(state, { type: "skip" });
    state = reduceOnboarding(state, { type: "reset" });

    expect(state).toEqual(initialOnboardingState());
  });
});
