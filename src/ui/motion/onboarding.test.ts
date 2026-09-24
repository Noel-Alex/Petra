import { describe, expect, it } from "vitest";

import {
  advanceOnboarding,
  createOnboardingState,
  getOnboardingStage,
  ONBOARDING_STAGES,
  resolveOnboardingTransition,
  retreatOnboarding,
  skipOnboarding,
} from "./onboarding";

describe("onboarding choreography", () => {
  it("walks through the scientific story in a deterministic order", () => {
    let state = createOnboardingState();
    const visited = [getOnboardingStage(state).id];

    while (!state.complete) {
      state = advanceOnboarding(state);
      visited.push(getOnboardingStage(state).id);
    }

    expect(visited).toEqual([
      "dish",
      "growth",
      "pressure",
      "selection",
      "handoff",
      "handoff",
    ]);
  });

  it("retreats without leaving the valid range", () => {
    const start = createOnboardingState();
    expect(retreatOnboarding(start)).toEqual(start);

    const growth = advanceOnboarding(start);
    expect(getOnboardingStage(retreatOnboarding(growth)).id).toBe("dish");
  });

  it("keeps causal meaning under reduced and off motion", () => {
    const pressure = { index: 2, complete: false } as const;
    const selection = { index: 3, complete: false } as const;

    const reduced = resolveOnboardingTransition(pressure, selection, "reduced");
    const off = resolveOnboardingTransition(pressure, selection, "off");

    expect(reduced.motion.treatment).toBe("crossfade");
    expect(reduced.motion.durationMs).toBeGreaterThan(0);
    expect(off.motion).toEqual({
      treatment: "static-emphasis",
      durationMs: 0,
      loops: false,
    });
  });

  it("can skip directly to a completed handoff", () => {
    const skipped = skipOnboarding();
    expect(skipped.complete).toBe(true);
    expect(skipped.index).toBe(ONBOARDING_STAGES.length - 1);
    expect(getOnboardingStage(skipped).id).toBe("handoff");
  });
});
