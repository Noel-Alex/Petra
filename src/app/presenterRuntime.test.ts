import { describe, expect, it } from "vitest";

import {
  ENGINE_VERSION,
  PROTOCOL_VERSION,
  type SimulationSnapshot,
} from "../sim/protocol";
import type { ExperimentRuntimeState } from "./experimentRuntime";
import {
  applyPresenterUserEvent,
  createPresenterRuntimeSession,
  projectPresenterRuntime,
  reconcilePresenterRuntimeSession,
} from "./presenterRuntime";
import { runIdentityKey } from "./runIdentityKey";

const flagship = {
  id: "ecoli-ciprofloxacin-spatial",
  version: "1.2.0-research",
} as const;

const identity = {
  engineVersion: ENGINE_VERSION,
  protocolVersion: PROTOCOL_VERSION,
  scenarioId: flagship.id,
  scenarioVersion: flagship.version,
  parameterSetId: "test-parameters",
  parameterSetVersion: "1",
  seed: 7,
} as const;

function runtimeState(
  options: {
    readonly seed?: number;
    readonly scenarioId?: string;
    readonly scenarioVersion?: string;
    readonly snapshot?: boolean;
    readonly phase?: ExperimentRuntimeState["worker"]["phase"];
    readonly integrationError?: string | null;
  } = {},
): ExperimentRuntimeState {
  const nextIdentity = {
    ...identity,
    seed: options.seed ?? identity.seed,
    scenarioId: options.scenarioId ?? identity.scenarioId,
    scenarioVersion: options.scenarioVersion ?? identity.scenarioVersion,
  };
  const snapshot: SimulationSnapshot | null =
    options.snapshot === false
      ? null
      : {
          checkpoint: {
            identity: nextIdentity,
            tick: 2,
            simulationTimeHours: 0.2,
            syntheticPopulation: 0,
            rngState: [1, 2, 3, 4],
            commandCount: 0,
          },
          events: [
            {
              sequence: 0,
              tick: 0,
              simulationTimeHours: 0,
              type: "initialized",
            },
            {
              sequence: 1,
              tick: 2,
              simulationTimeHours: 0.2,
              type: "advanced",
            },
          ],
          traceHash: "presenter-runtime-test",
        };

  return {
    controls: {
      identity: nextIdentity,
      playing: false,
      speed: 1,
      acceptedCommands: [],
    },
    worker: {
      phase: options.phase ?? "ready",
      latestSnapshot: snapshot,
      pendingCommandId: null,
      queuedRequests: 0,
      error: null,
    },
    snapshot,
    timeline: [],
    integrationError: options.integrationError ?? null,
  };
}

describe("Presenter runtime authority adapter", () => {
  it("uses the complete authoritative run identity as its stable binding key", () => {
    const key = runIdentityKey(identity);
    expect(key).toContain(ENGINE_VERSION);
    expect(key).toContain(flagship.id);
    expect(runIdentityKey({ ...identity, seed: 8 })).not.toBe(key);
  });

  it("admits only exact flagship runtime readiness from current protocol evidence", () => {
    const projection = projectPresenterRuntime(runtimeState(), flagship);

    expect(projection.hasAuthoritativeSnapshot).toBe(true);
    expect(projection.gates).toEqual(["flagship-runtime-ready"]);
    expect(projection.gates).not.toContain("growth-observed");
    expect(projection.gates).not.toContain("intervention-recorded");
    expect(projection.gates).not.toContain("selection-evidence-ready");
  });

  it("does not call another scenario, a missing snapshot, or an errored session flagship-ready", () => {
    expect(
      projectPresenterRuntime(
        runtimeState({ scenarioId: "another-scenario" }),
        flagship,
      ).gates,
    ).toEqual([]);
    expect(
      projectPresenterRuntime(runtimeState({ snapshot: false }), flagship).gates,
    ).toEqual([]);
    expect(
      projectPresenterRuntime(
        runtimeState({ integrationError: "foreign snapshot" }),
        flagship,
      ).gates,
    ).toEqual([]);
  });

  it("rebinds to a changed run and refuses stale progress/evidence", () => {
    const firstProjection = projectPresenterRuntime(runtimeState(), flagship);
    let session = createPresenterRuntimeSession(firstProjection);
    session = reconcilePresenterRuntimeSession(session, firstProjection);
    session = applyPresenterUserEvent(session, firstProjection, { type: "next" });

    expect(session.state.cueIndex).toBe(1);

    const secondProjection = projectPresenterRuntime(
      runtimeState({ seed: 8 }),
      flagship,
    );
    session = reconcilePresenterRuntimeSession(session, secondProjection);

    expect(session.state.runIdentity).toBe(secondProjection.runIdentityKey);
    expect(session.state.cueIndex).toBe(0);
    expect([...session.state.satisfiedGates]).toEqual([
      "flagship-runtime-ready",
    ]);
  });

  it("clears progress when authority drops during same-identity reset/replay reinitialization", () => {
    const readyProjection = projectPresenterRuntime(runtimeState(), flagship);
    let session = createPresenterRuntimeSession(readyProjection);
    session = reconcilePresenterRuntimeSession(session, readyProjection);
    session = applyPresenterUserEvent(session, readyProjection, { type: "next" });
    expect(session.state.cueIndex).toBe(1);

    const resettingProjection = projectPresenterRuntime(
      runtimeState({ snapshot: false, phase: "initializing" }),
      flagship,
    );
    session = reconcilePresenterRuntimeSession(session, resettingProjection);

    expect(session.state.runIdentity).toBe(readyProjection.runIdentityKey);
    expect(session.state.cueIndex).toBe(0);
    expect(session.state.satisfiedGates.size).toBe(0);
  });
});
