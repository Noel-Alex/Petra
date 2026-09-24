import { describe, expect, it } from "vitest";

import {
  canAdvanceDemo,
  cuesForProfile,
  currentDemoCue,
  initialDemoPresenterState,
  reduceDemoPresenter,
  resolveDemoPresenterPresentation,
  type DemoEvidenceGate,
} from "./presenter";

function satisfy(
  state: ReturnType<typeof initialDemoPresenterState>,
  gate: DemoEvidenceGate,
) {
  if (state.runIdentity === null) {
    throw new Error("test state requires a bound run");
  }
  return reduceDemoPresenter(state, {
    type: "evidence",
    gate,
    runIdentity: state.runIdentity,
  });
}

describe("expo demo presenter state", () => {
  it("keeps the 90-second deck inside its declared pacing envelope", () => {
    const cues = cuesForProfile("90-second");
    expect(cues).toHaveLength(6);
    expect(cues.at(-1)?.targetSeconds).toBe(90);
    expect(cues.map((cue) => cue.targetSeconds)).toEqual(
      [...cues].map((cue) => cue.targetSeconds).sort((a, b) => a - b),
    );
  });

  it("extends the same scientific story for the three-minute profile", () => {
    const shortIds = cuesForProfile("90-second").map((cue) => cue.id);
    const long = cuesForProfile("3-minute");

    expect(long.slice(0, shortIds.length).map((cue) => cue.id)).toEqual(shortIds);
    expect(long.at(-1)?.targetSeconds).toBe(180);
    expect(long.find((cue) => cue.id === "tradeoff")?.gate).toBe(
      "fitness-tradeoff-ready",
    );
    expect(long.find((cue) => cue.id === "spatial")?.gate).toBe(
      "spatial-evidence-ready",
    );
  });

  it("cannot advance a causal/demo beat until explicit evidence arrives", () => {
    let state = initialDemoPresenterState("90-second", "run-a");
    expect(currentDemoCue(state).id).toBe("world");
    expect(canAdvanceDemo(state)).toBe(false);

    state = reduceDemoPresenter(state, { type: "next" });
    expect(currentDemoCue(state).id).toBe("world");

    state = satisfy(state, "flagship-runtime-ready");
    state = reduceDemoPresenter(state, { type: "next" });
    expect(currentDemoCue(state).id).toBe("growth");
    expect(canAdvanceDemo(state)).toBe(false);

    state = satisfy(state, "growth-observed");
    state = reduceDemoPresenter(state, { type: "next" });
    expect(currentDemoCue(state).id).toBe("pressure");
  });

  it("never uses target wall time as an evidence gate", () => {
    const state = initialDemoPresenterState("90-second", "run-a");
    const presentation = resolveDemoPresenterPresentation(state, "full");

    expect(presentation.elapsedTargetSeconds).toBe(12);
    expect(presentation.timingMeaning).toBe("presenter-pacing-only");
    expect(presentation.waitingFor).toBe("flagship-runtime-ready");
    expect(presentation.canAdvance).toBe(false);
  });

  it("clears stale evidence when the authoritative run identity changes", () => {
    let state = initialDemoPresenterState("90-second", "run-a");
    state = satisfy(state, "flagship-runtime-ready");
    expect(canAdvanceDemo(state)).toBe(true);

    state = reduceDemoPresenter(state, {
      type: "bind-run",
      runIdentity: "run-b",
    });

    expect(state.runIdentity).toBe("run-b");
    expect(state.cueIndex).toBe(0);
    expect(state.satisfiedGates.size).toBe(0);
    expect(canAdvanceDemo(state)).toBe(false);

    const stale = reduceDemoPresenter(state, {
      type: "evidence",
      gate: "flagship-runtime-ready",
      runIdentity: "run-a",
    });
    expect(stale).toBe(state);
  });

  it("preserves evidence when switching presenter profiles within one run", () => {
    let state = initialDemoPresenterState("90-second", "run-a");
    state = satisfy(state, "flagship-runtime-ready");
    state = reduceDemoPresenter(state, {
      type: "set-profile",
      profile: "3-minute",
    });

    expect(state.cueIndex).toBe(0);
    expect(state.profile).toBe("3-minute");
    expect(state.runIdentity).toBe("run-a");
    expect(state.satisfiedGates.has("flagship-runtime-ready")).toBe(true);
    expect(canAdvanceDemo(state)).toBe(true);
  });

  it("degrades presenter motion without removing scientific boundaries", () => {
    let state = initialDemoPresenterState("90-second", "run-a");
    state = satisfy(state, "flagship-runtime-ready");
    state = reduceDemoPresenter(state, { type: "next" });

    const reduced = resolveDemoPresenterPresentation(state, "reduced");
    expect(reduced.motion.treatment).toBe("crossfade");
    expect(reduced.cue.scientificBoundary).toContain("Animation wall time");

    const off = resolveDemoPresenterPresentation(state, "off");
    expect(off.motion.treatment).toBe("static-emphasis");
    expect(off.motion.durationMs).toBe(0);
  });
});
