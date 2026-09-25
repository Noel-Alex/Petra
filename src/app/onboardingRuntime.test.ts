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
    { sequence: 0, tick: 0, simulationTimeHours: 0, type: "initialized" },
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
    runBranchIdentity: `onboarding-test-${seed}/0`,
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
      { sequence: 1, tick: 2, simulationTimeHours: 0.2, type: "advanced", commandId: "advance-1", value: 2 },
      {
        sequence: 2,
        tick: 2,
        simulationTimeHours: 0.2,
        type: "synthetic-pulse",
        commandId: "pulse-1",
        value: 5,
      },
      { sequence: 3, tick: 2, simulationTimeHours: 0.2, type: "restored", commandId: "restore-1" },
    ];

    const projection = projectOnboardingRuntime(runtimeState(7, { events }));

    expect(projection.hasAuthoritativeSnapshot).toBe(true);
    expect(projection.gates).toEqual([]);
  });

  it("accepts the real ciprofloxacin command fact without inferring downstream selection", () => {
    const events: readonly SimulationEvent[] = [
      { sequence: 0, tick: 0, simulationTimeHours: 0, type: "initialized" },
      {
        sequence: 1,
        tick: 0,
        simulationTimeHours: 0,
        type: "ciprofloxacin-applied",
        commandId: "dose-1",
        intervention: {
          schemaVersion: 1,
          concentrationMgPerL: 0.125,
          concentrationUnit: "mg/L",
          blendMode: "set",
          geometry: { kind: "global" },
        },
      },
    ];

    const projection = projectOnboardingRuntime(runtimeState(7, { events }));

    expect(projection.gates).toEqual(["antibiotic-command-recorded"]);
    expect(projection.gates).not.toContain("population-growth-observed");
    expect(projection.gates).not.toContain(
      "resistant-lineage-frequency-increased",
    );
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

  it("accepts explicit science gates only from the matching authoritative run", () => {
    const runtime = runtimeState(7);
    const matching = projectOnboardingRuntime(runtime, {
      runIdentity: runtime.controls.identity,
      runBranchIdentity: "run-7/main",
      gates: [
        "inoculation-recorded",
        "population-growth-observed",
        "antibiotic-command-recorded",
      ],
    });

    expect(matching.gates).toEqual([
      "inoculation-recorded",
      "population-growth-observed",
      "antibiotic-command-recorded",
    ]);

    const otherRuntime = runtimeState(8);
    const mismatched = projectOnboardingRuntime(runtime, {
      runIdentity: otherRuntime.controls.identity,
      runBranchIdentity: "run-8/main",
      gates: ["resistant-lineage-frequency-increased"],
    });
    expect(mismatched.gates).toEqual([]);
  });

  it("resets scientific gates when the authoritative run branch changes", () => {
    const runtime = runtimeState(7);
    const firstProjection = projectOnboardingRuntime(runtime, {
      runIdentity: runtime.controls.identity,
      runBranchIdentity: "run-7/a",
      gates: [
        "inoculation-recorded",
        "population-growth-observed",
      ],
    });
    let session = createOnboardingRuntimeSession(firstProjection);
    session = reconcileOnboardingRuntimeSession(session, firstProjection);
    expect(session.state.satisfiedGates).toEqual(
      new Set([
        "inoculation-recorded",
        "population-growth-observed",
      ]),
    );

    const forkProjection = projectOnboardingRuntime(runtime, {
      runIdentity: runtime.controls.identity,
      runBranchIdentity: "run-7/b",
      gates: [],
    });
    session = reconcileOnboardingRuntimeSession(session, forkProjection);

    expect(currentStage(session.state).id).toBe("ecosystem");
    expect(session.state.satisfiedGates.size).toBe(0);
    expect(session.gateStreamIdentity).toContain("run-7/b");
  });

  it("replays the guide without mutating simulation authority", () => {
    const projection: OnboardingRuntimeProjection = {
      ...projectOnboardingRuntime(runtimeState(7)),
      gates: [
        "inoculation-recorded",
        "population-growth-observed",
        "antibiotic-command-recorded",
        "resistant-lineage-frequency-increased",
      ],
      revisionKey: "all-gates",
    };
    let session = createOnboardingRuntimeSession(projection);
    session = reconcileOnboardingRuntimeSession(session, projection);

    while (!session.state.completed) {
      session = applyOnboardingUserAction(session, projection, {
        type: "continue",
      });
    }
    expect(session.state.completed).toBe(true);

    const replayed = applyOnboardingUserAction(session, projection, {
      type: "reset",
    });
    expect(currentStage(replayed.state).id).toBe("ecosystem");
    expect(replayed.state.completed).toBe(false);
    expect(replayed.state.skipped).toBe(false);

    const synchronized = reconcileOnboardingRuntimeSession(
      replayed,
      projection,
    );
    expect(synchronized.state.satisfiedGates).toEqual(
      new Set(projection.gates),
    );
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
