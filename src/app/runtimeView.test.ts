import { describe, expect, it } from "vitest";
import {
  ENGINE_VERSION,
  PROTOCOL_VERSION,
  type SimulationSnapshot,
} from "../sim/protocol";
import type { ExperimentRuntimeState } from "./experimentRuntime";
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
            rngState: { seed: 7, state: 7 },
            commandCount: 0,
          },
          events: [],
          traceHash: "runtime-view-test",
        };

  return {
    controls: {
      identity,
      playing: options.playing ?? false,
      speed: 4,
      acceptedCommands: [],
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

  it("quarantines runtime and setup errors", () => {
    const runtimeError = projectExperimentRuntimeView(
      runtimeState("ready", { integrationError: "foreign snapshot" }),
    );
    expect(runtimeError.status).toBe("error");
    expect(runtimeError.statusRole).toBe("alert");
    expect(runtimeError.canTogglePlayback).toBe(false);

    const setupError = projectExperimentRuntimeView(
      null,
      "runtime factory failed",
    );
    expect(setupError.status).toBe("error");
    expect(setupError.statusText).toBe("runtime factory failed");
  });
});
