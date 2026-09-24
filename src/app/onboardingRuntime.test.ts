import { describe, expect, it } from "vitest";

import {
  createRunIdentity,
  type SimulationEvent,
  type SimulationSnapshot,
} from "../sim/protocol";
import { createExperimentControlState } from "../ui/experimentControls";
import {
  canContinue,
  currentStage,
} from "../ui/onboarding/story";
import type { ExperimentRuntimeState } from "./experimentRuntime";
import {
  applyOnboardingUserAction,
  createOnboardingRuntimeSession,
  projectOnboardingRuntime,
  reconcileOnboardingRuntimeSession,
  type OnboardingRuntimeProjection,
} from "./onboardingRuntime";

function runtimeState(
  seed = 7,
  options: { readonly snapshot?: boolean; readonly events?: readonly SimulationEvent[] } = {},
): ExperimentRuntimeState {
  const identity = createRunIdentity({
    scenarioId: "flagship",
    scenarioVersion: "1",
    parameterSetId: "reference",
    parameterSetVersion: "1",
    seed,
  });
  const events = options.events ?? [
    { sequence: 0, tick: 0, type: "initialized" },
  ];
  const snapshot: SimulationSnapshot | null =
    options.snapshot === false
      ? null
      : {
          checkpoint: {
            identity,
            tick: 4,
            simulationTimeHours: 0.4,
            syntheticPopulation: 12,
            rngState: [1, 2, 3, 4],
            commandCount: 3,
          },
          events,
          traceHash: `trace-${seed}-${events.length}`,
        };

  return {
    controls: createExperimentControlState(identity),
    worker: {
      phase: snapshot === null ? "initializing" : "ready",
      latestSnapshot: snapshot,
      pendingCommandId: null,
      queuedRequests: 0,
      error: null,
    },
    snapshot,
    timeline: [],
    integrationError: null,
  };
}

describe("onboarding runtime bridge", () => {
  it("refuses to treat synthetic protocol activity as causal onboarding evidence", () => {
    const events: readonly SimulationEvent[] = [
      { sequence: 0, tick: 0, type: "initialized" },
      { sequence: 1, tick: 2, type: "advanced", commandId: "advance-1", value: 2 },
      {
        sequence: 2,
        tick: 2,
        type: "synthetic-pulse",
        commandId: "pulse-1",
        value: 5,
      },
      { sequence: 3, tick: 2, type: "restored", commandId: "restore-1" },
    ];

    const projection = projectOnboardingRuntime(runtimeState(7, { events }));

    expect(projection.hasAuthoritativeSnapshot).toBe(true);
    expect(projection.gates).toEqual([]);
  });

  it("keeps user navigation within one run but resets when run identity changes", () => {
    const firstProjection = projectOnboardingRuntime(runtimeState(7));
    let session = createOnboardingRuntimeSession(firstProjection);
    session = applyOnboardingUserAction(session, firstProjection, {
      type: "continue",
    });

    expect(currentStage(session.state).id).toBe("inoculation");

    const sameRun = reconcileOnboardingRuntimeSession(
      session,
      projectOnboardingRuntime(runtimeState(7)),
    );
    expect(currentStage(sameRun.state).id).toBe("inoculation");

    const differentRun = reconcileOnboardingRuntimeSession(
      sameRun,
      projectOnboardingRuntime(runtimeState(8)),
    );
    expect(currentStage(differentRun.state).id).toBe("ecosystem");
    expect(differentRun.state.satisfiedGates.size).toBe(0);
  });

  it("resets a same-identity guide when authoritative state is reinitialized", () => {
    const readyProjection = projectOnboardingRuntime(runtimeState(7));
    let session = createOnboardingRuntimeSession(readyProjection);
    session = applyOnboardingUserAction(session, readyProjection, {
      type: "continue",
    });

    expect(currentStage(session.state).id).toBe("inoculation");

    const reinitializing = projectOnboardingRuntime(
      runtimeState(7, { snapshot: false }),
    );
    session = reconcileOnboardingRuntimeSession(session, reinitializing);

    expect(currentStage(session.state).id).toBe("ecosystem");
    expect(session.hasSeenAuthoritativeSnapshot).toBe(false);
  });

  it("accepts only explicitly projected scientific gates", () => {
    const projection = projectOnboardingRuntime(runtimeState(7));
    let session = createOnboardingRuntimeSession(projection);
    session = applyOnboardingUserAction(session, projection, {
      type: "continue",
    });

    expect(canContinue(session.state)).toBe(false);

    const explicitGate: OnboardingRuntimeProjection = {
      ...projection,
      gates: ["inoculation-recorded"],
      revisionKey: `${projection.revisionKey}:inoculation-recorded`,
    };
    session = reconcileOnboardingRuntimeSession(session, explicitGate);

    expect(canContinue(session.state)).toBe(true);
    expect(session.state.satisfiedGates.has("inoculation-recorded")).toBe(true);
  });
});
