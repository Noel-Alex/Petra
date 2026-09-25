import { describe, expect, it } from "vitest";

import { CIPROFLOXACIN_INTERVENTION_SCHEMA_VERSION } from "../sim/ciprofloxacinIntervention";
import {
  ENGINE_VERSION,
  PROTOCOL_VERSION,
  type SimulationSnapshot,
} from "../sim/protocol";
import type { ExperimentRuntimeState } from "./experimentRuntime";
import { createRuntimeInterventionFootprintFrame } from "./runtimeInterventionFootprintFrame";

function snapshot(): SimulationSnapshot {
  return {
    checkpoint: {
      identity: {
        engineVersion: ENGINE_VERSION,
        protocolVersion: PROTOCOL_VERSION,
        scenarioId: "scenario",
        scenarioVersion: "1",
        parameterSetId: "params",
        parameterSetVersion: "1",
        seed: 7,
      },
      tick: 12,
      simulationTimeHours: 0.24,
      syntheticPopulation: 1000,
      rngState: [1, 2, 3, 4],
      commandCount: 2,
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
        tick: 12,
        simulationTimeHours: 0.24,
        type: "ciprofloxacin-applied",
        commandId: "dose-1",
        intervention: {
          schemaVersion: CIPROFLOXACIN_INTERVENTION_SCHEMA_VERSION,
          concentrationMgPerL: 0.03,
          concentrationUnit: "mg/L",
          blendMode: "set",
          geometry: {
            kind: "paint",
            samples: [{ x: 0.2, y: 0.3 }, { x: 0.7, y: 0.8 }],
            brushRadiusFraction: 0.08,
          },
        },
      },
    ],
    traceHash: "trace-2",
  };
}

function state(
  source: SimulationSnapshot,
  branch = "run/generation-1",
): ExperimentRuntimeState {
  return {
    controls: {
      identity: structuredClone(source.checkpoint.identity),
      playing: false,
      speed: 1,
      acceptedCommands: [],
    },
    runBranchIdentity: branch,
    worker: {
      phase: "ready",
      latestSnapshot: source,
      pendingCommandId: null,
      queuedRequests: 0,
      error: null,
      errorCode: null,
    },
    snapshot: source,
    timeline: [],
    integrationError: null,
  };
}

describe("runtime intervention footprint frame", () => {
  it("binds detached accepted geometry to exact runtime history position", () => {
    const source = snapshot();
    const frame = createRuntimeInterventionFootprintFrame(state(source));

    expect(frame).toMatchObject({
      version: "petra-runtime-intervention-footprints/1",
      runBranchIdentity: "run/generation-1",
      tick: 12,
      simulationTimeHours: 0.24,
      acceptedCommandCount: 2,
      traceHash: "trace-2",
    });
    expect(frame?.runIdentity).toEqual(source.checkpoint.identity);
    expect(frame?.runIdentity).not.toBe(source.checkpoint.identity);
    expect(frame?.footprints).toHaveLength(1);
    expect(frame?.footprints[0]?.commandId).toBe("dose-1");
    expect(frame?.footprints[0]?.intervention).not.toBe(source.events[1]?.intervention);
  });

  it("keeps byte-equivalent histories distinct across runtime branches", () => {
    const source = snapshot();
    const first = createRuntimeInterventionFootprintFrame(state(source, "run/generation-1"));
    const restored = createRuntimeInterventionFootprintFrame(state(source, "run/generation-2"));

    expect(first?.acceptedCommandCount).toBe(restored?.acceptedCommandCount);
    expect(first?.traceHash).toBe(restored?.traceHash);
    expect(first?.runBranchIdentity).not.toBe(restored?.runBranchIdentity);
  });

  it("returns null without current authoritative runtime state", () => {
    const runtime = state(snapshot());
    expect(
      createRuntimeInterventionFootprintFrame({ ...runtime, snapshot: null }),
    ).toBeNull();
  });

  it("fails closed on foreign run identity and future event frontier", () => {
    const foreign = state(snapshot());
    foreign.controls.identity.seed = 8;
    expect(() => createRuntimeInterventionFootprintFrame(foreign)).toThrow(
      /does not match active controls/,
    );

    const future = snapshot();
    (future.events[1] as { tick: number }).tick = 13;
    expect(() => createRuntimeInterventionFootprintFrame(state(future))).toThrow(
      /checkpoint tick frontier/,
    );
  });

  it("fails closed on duplicate or regressing event sequence", () => {
    const malformed = snapshot();
    (malformed.events[1] as { sequence: number }).sequence = 0;
    expect(() =>
      createRuntimeInterventionFootprintFrame(state(malformed)),
    ).toThrow(/strictly sequence ordered/);
  });
});
