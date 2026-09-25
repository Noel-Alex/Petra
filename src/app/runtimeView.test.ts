import { describe, expect, it } from "vitest";
import {
  ENGINE_VERSION,
  PROTOCOL_VERSION,
  type SimulationSnapshot,
} from "../sim/protocol";
import type { ExperimentRuntimeState } from "./experimentRuntime";
import { runtimeFailure } from "./runtimeRecovery";
import {
  projectExperimentRuntimeView,
} from "./runtimeView";

const identity = {
  engineVersion: ENGINE_VERSION,
  protocolVersion: PROTOCOL_VERSION,
  scenarioId: "test-scenario",
  scenarioVersion: "1",
  parameterSetId: "test-parameters",
  parameterSetVersion: "1",
  seed: 7,
} as const;

function runtimeState(
  phase: ExperimentRuntimeState["worker"]["phase"],
  options: {
    readonly playing?: boolean;
    readonly simulationTimeHours?: number;
    readonly integrationError?: string | null;
    readonly acceptedCommandCount?: number;
  } = {},
): ExperimentRuntimeState {
  const snapshot: SimulationSnapshot | null =
    options.simulationTimeHours === undefined
      ? null
      : {
          checkpoint: {
            identity,
            tick: 12,
            simulationTimeHours: options.simulationTimeHours,
            syntheticPopulation: 0,
            rngState: [1, 2, 3, 4],
            commandCount: 0,
          },
          events: [],
          traceHash: "runtime-view-test",
        };

  return {
    runBranchIdentity: "runtime-view-test/0",
    controls: {
      identity,
      playing: options.playing ?? false,
      speed: 4,
      acceptedCommands: Array.from(
        { length: options.acceptedCommandCount ?? 0 },
        (_, index) => ({
          id: `accepted-${index + 1}`,
          type: "advance" as const,
          ticks: 1,
        }),
      ),
    },
    worker: {
      phase,
      latestSnapshot: snapshot,
      pendingCommandId: null,
      queuedRequests: 0,
      error: phase === "error" ? "worker failed" : null,
    },
    snapshot,
    timeline: [],
    integrationError: options.integrationError ?? null,
  };
}

describe("experiment runtime view", () => {
  it("keeps the shell explicitly unavailable without an injected runtime", () => {
    const view = projectExperimentRuntimeView(null);
    expect(view.status).toBe("unavailable");
    expect(view.canTogglePlayback).toBe(false);
    expect(view.simulationTimeLabel).toBe("Simulation time —");
  });

  it("keeps scientific time blank while initialization has no snapshot", () => {
    const view = projectExperimentRuntimeView(runtimeState("initializing"));
    expect(view.status).toBe("starting");
    expect(view.simulationTimeLabel).toBe("Simulation time —");
  });

  it("projects authoritative snapshot time only after a snapshot exists", () => {
    const view = projectExperimentRuntimeView(
      runtimeState("ready", { simulationTimeHours: 1.25 }),
    );
    expect(view.status).toBe("ready");
    expect(view.simulationTimeLabel).toBe("Simulation time 1.25 h");
    expect(view.canTogglePlayback).toBe(true);
  });

  it("allows a running pending simulation to be paused", () => {
    const view = projectExperimentRuntimeView(
      runtimeState("pending", { playing: true }),
    );
    expect(view.status).toBe("pending");
    expect(view.playing).toBe(true);
    expect(view.canTogglePlayback).toBe(true);
  });

  it("keeps continuous-playback live copy stable across ready/pending request churn", () => {
    const ready = projectExperimentRuntimeView(
      runtimeState("ready", { playing: true }),
    );
    const pending = projectExperimentRuntimeView(
      runtimeState("pending", { playing: true }),
    );

    expect(ready.status).toBe("ready");
    expect(pending.status).toBe("pending");
    expect(ready.workerPhase).toBe("ready");
    expect(pending.workerPhase).toBe("pending");
    expect(ready.statusText).toBe("Simulation running");
    expect(pending.statusText).toBe(ready.statusText);
    expect(pending.statusRole).toBe("status");
  });

  it("projects one run-control authority across unavailable, busy, and ready states", () => {
    const unavailable = projectExperimentRuntimeView(null);
    expect(unavailable.runControls).toEqual({
      seed: null,
      acceptedCommandCount: 0,
      canStep: false,
      canReset: false,
      canReplay: false,
      canSetSeed: false,
    });

    const initializing = projectExperimentRuntimeView(runtimeState("initializing"));
    expect(initializing.runControls.seed).toBe(identity.seed);
    expect(initializing.runControls.canStep).toBe(false);
    expect(initializing.runControls.canReset).toBe(false);
    expect(initializing.runControls.canSetSeed).toBe(false);

    const pending = projectExperimentRuntimeView(runtimeState("pending"));
    expect(pending.runControls.canStep).toBe(false);
    expect(pending.runControls.canReset).toBe(false);
    expect(pending.runControls.canReplay).toBe(false);
    expect(pending.runControls.canSetSeed).toBe(false);

    const ready = projectExperimentRuntimeView(runtimeState("ready"));
    expect(ready.runControls).toMatchObject({
      seed: identity.seed,
      acceptedCommandCount: 0,
      canStep: true,
      canReset: true,
      canReplay: false,
      canSetSeed: true,
    });
  });

  it("enables replay only from accepted runtime history and disables Step during playback", () => {
    const withHistory = projectExperimentRuntimeView(
      runtimeState("ready", { acceptedCommandCount: 2 }),
    );
    expect(withHistory.runControls.acceptedCommandCount).toBe(2);
    expect(withHistory.runControls.canReplay).toBe(true);

    const playing = projectExperimentRuntimeView(
      runtimeState("ready", {
        playing: true,
        acceptedCommandCount: 2,
      }),
    );
    expect(playing.runControls.canStep).toBe(false);
    expect(playing.runControls.canReset).toBe(true);
    expect(playing.runControls.canReplay).toBe(true);
    expect(playing.runControls.canSetSeed).toBe(true);
  });

  it("keeps reinitialization controls available for recoverable runtime errors without enabling Step", () => {
    const integrationError = projectExperimentRuntimeView(
      runtimeState("ready", {
        integrationError: "foreign snapshot",
        acceptedCommandCount: 1,
      }),
    );
    expect(integrationError.status).toBe("error");
    expect(integrationError.runControls).toMatchObject({
      seed: identity.seed,
      canStep: false,
      canReset: true,
      canReplay: true,
      canSetSeed: true,
    });

    const workerError = projectExperimentRuntimeView(
      runtimeState("error", { acceptedCommandCount: 1 }),
    );
    expect(workerError.runControls.canStep).toBe(false);
    expect(workerError.runControls.canReset).toBe(true);
    expect(workerError.runControls.canReplay).toBe(true);
    expect(workerError.runControls.canSetSeed).toBe(true);
  });

  it("quarantines runtime and setup errors", () => {
    const runtimeError = projectExperimentRuntimeView(
      runtimeState("ready", { integrationError: "foreign snapshot" }),
    );
    expect(runtimeError.status).toBe("error");
    expect(runtimeError.statusRole).toBe("alert");
    expect(runtimeError.canTogglePlayback).toBe(false);

    const setupFailure = projectExperimentRuntimeView(
      null,
      runtimeFailure("runtime", "setup", "runtime factory failed"),
    );
    expect(setupFailure.status).toBe("error");
    expect(setupFailure.statusText).toContain("authoritative simulation");
    expect(setupFailure.statusText).not.toContain("runtime factory failed");
    expect(setupFailure.error).toBe("runtime factory failed");
    expect(setupFailure.failure?.kind).toBe("runtime");
  });
});
