import { describe, expect, it } from "vitest";
import {
  canContinue,
  currentStage,
  initialOnboardingState,
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
