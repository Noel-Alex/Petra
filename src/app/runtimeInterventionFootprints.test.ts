import { describe, expect, it } from "vitest";

import {
  CIPROFLOXACIN_INTERVENTION_SCHEMA_VERSION,
  type CiprofloxacinIntervention,
} from "../sim/ciprofloxacinIntervention";
import {
  ENGINE_VERSION,
  PROTOCOL_VERSION,
  type ComposedSimulationSnapshot,
  type RunIdentity,
  type SimulationEvent,
} from "../sim/protocol";
import type { ExperimentRuntimeState } from "./experimentRuntime";
import {
  projectRuntimeInterventionFootprintFrame,
  RUNTIME_INTERVENTION_FOOTPRINT_FRAME_VERSION,
} from "./runtimeInterventionFootprints";

const RUN_A: RunIdentity = {
  engineVersion: ENGINE_VERSION,
  protocolVersion: PROTOCOL_VERSION,
  scenarioId: "footprint-frame-fixture",
  scenarioVersion: "1",
  parameterSetId: "fixture-params",
  parameterSetVersion: "1",
  seed: 17,
};

const RUN_B: RunIdentity = {
  ...RUN_A,
  seed: 18,
};

function intervention(
  geometry: CiprofloxacinIntervention["geometry"] = {
    kind: "paint",
    samples: [
      { x: 0.2, y: 0.3 },
      { x: 0.7, y: 0.8 },
    ],
    brushRadiusFraction: 0.08,
  },
): CiprofloxacinIntervention {
  return {
    schemaVersion: CIPROFLOXACIN_INTERVENTION_SCHEMA_VERSION,
    concentrationMgPerL: 0.03,
    concentrationUnit: "mg/L",
    blendMode: "set",
    geometry,
  };
}

function appliedEvent(args: {
  sequence?: number;
  tick?: number;
  simulationTimeHours?: number;
  commandId?: string;
} = {}): SimulationEvent {
  return {
    sequence: args.sequence ?? 7,
    tick: args.tick ?? 12,
    simulationTimeHours: args.simulationTimeHours ?? 0.24,
    type: "ciprofloxacin-applied",
    commandId: args.commandId ?? "dose-7",
    intervention: intervention(),
  };
}

function composedSnapshot(args: {
  identity?: RunIdentity;
  tick?: number;
  simulationTimeHours?: number;
  commandCount?: number;
  traceHash?: string;
  events?: readonly SimulationEvent[];
} = {}): ComposedSimulationSnapshot {
  return {
    checkpoint: {
      authority: "composed",
      identity: args.identity ?? RUN_A,
      tick: args.tick ?? 12,
      simulationTimeHours: args.simulationTimeHours ?? 0.24,
      commandCount: args.commandCount ?? 4,
      // This app-layer contract reads only the checkpoint envelope. Scientific
      // state/metric validation remains the protocol/Worker trust boundary.
      composedState:
        {} as ComposedSimulationSnapshot["checkpoint"]["composedState"],
      metrics: {} as ComposedSimulationSnapshot["checkpoint"]["metrics"],
    },
    events: args.events ?? [appliedEvent()],
    traceHash: args.traceHash ?? "trace-footprint-frame-4",
  };
}

function runtimeState(
  snapshot: ComposedSimulationSnapshot | null,
  runBranchIdentity = "run-a/generation-1",
  controlsIdentity: RunIdentity = RUN_A,
): ExperimentRuntimeState {
  return {
    controls: {
      identity: controlsIdentity,
      playing: false,
      speed: 1,
      acceptedCommands: [],
    },
    runBranchIdentity,
    worker: {
      phase: snapshot === null ? "idle" : "ready",
      latestSnapshot: snapshot,
      pendingCommandId: null,
      queuedRequests: 0,
      error: null,
      errorCode: null,
    },
    snapshot,
    timeline: [],
    integrationError: null,
  };
}

describe("runtime intervention footprint binding", () => {
  it("binds detached accepted geometry to the exact runtime snapshot frontier", () => {
    const snapshot = composedSnapshot();
    const frame = projectRuntimeInterventionFootprintFrame(
      runtimeState(snapshot),
    );

    expect(frame).toMatchObject({
      version: RUNTIME_INTERVENTION_FOOTPRINT_FRAME_VERSION,
      runIdentity: RUN_A,
      runBranchIdentity: "run-a/generation-1",
      acceptedCommandCount: 4,
      tick: 12,
      simulationTimeHours: 0.24,
      snapshotTraceHash: "trace-footprint-frame-4",
    });
    expect(frame.runIdentity).not.toBe(snapshot.checkpoint.identity);
    expect(frame.footprints).toHaveLength(1);
    expect(frame.footprints[0]).toMatchObject({
      eventSequence: 7,
      tick: 12,
      simulationTimeHours: 0.24,
      commandId: "dose-7",
    });

    const sourceGeometry = snapshot.events[0]!.intervention!.geometry;
    const projectedGeometry = frame.footprints[0]!.intervention.geometry;
    expect(projectedGeometry).not.toBe(sourceGeometry);
    expect(sourceGeometry.kind).toBe("paint");
    expect(projectedGeometry.kind).toBe("paint");
    if (sourceGeometry.kind !== "paint" || projectedGeometry.kind !== "paint") {
      throw new Error("expected paint geometry");
    }
    expect(projectedGeometry.samples[0]).not.toBe(sourceGeometry.samples[0]);
  });

  it("distinguishes reset/replay generations with otherwise identical authority", () => {
    const snapshot = composedSnapshot();
    const first = projectRuntimeInterventionFootprintFrame(
      runtimeState(snapshot, "run-a/generation-1"),
    );
    const replayed = projectRuntimeInterventionFootprintFrame(
      runtimeState(snapshot, "run-a/generation-2"),
    );

    expect(replayed.acceptedCommandCount).toBe(first.acceptedCommandCount);
    expect(replayed.snapshotTraceHash).toBe(first.snapshotTraceHash);
    expect(replayed.footprints).toEqual(first.footprints);
    expect(replayed.runBranchIdentity).not.toBe(first.runBranchIdentity);
  });

  it("preserves same-time mutating-command order independently of biological time", () => {
    const before = projectRuntimeInterventionFootprintFrame(
      runtimeState(
        composedSnapshot({
          commandCount: 4,
          traceHash: "trace-command-4",
          events: [appliedEvent({ sequence: 7, commandId: "dose-7" })],
        }),
      ),
    );
    const after = projectRuntimeInterventionFootprintFrame(
      runtimeState(
        composedSnapshot({
          commandCount: 5,
          traceHash: "trace-command-5",
          events: [
            appliedEvent({ sequence: 7, commandId: "dose-7" }),
            appliedEvent({ sequence: 8, commandId: "dose-8" }),
          ],
        }),
      ),
    );

    expect(after.simulationTimeHours).toBe(before.simulationTimeHours);
    expect(after.tick).toBe(before.tick);
    expect(after.acceptedCommandCount).toBe(5);
    expect(after.acceptedCommandCount).toBeGreaterThan(
      before.acceptedCommandCount,
    );
    expect(after.footprints.map((item) => item.commandId)).toEqual([
      "dose-7",
      "dose-8",
    ]);
  });

  it("fails closed for missing or foreign runtime authority", () => {
    expect(() =>
      projectRuntimeInterventionFootprintFrame(runtimeState(null)),
    ).toThrow(/authoritative runtime snapshot/);

    expect(() =>
      projectRuntimeInterventionFootprintFrame(
        runtimeState(composedSnapshot(), "run-a/generation-1", RUN_B),
      ),
    ).toThrow(/does not match active controls/);

    expect(() =>
      projectRuntimeInterventionFootprintFrame(
        runtimeState(composedSnapshot(), " run-a/generation-1 "),
      ),
    ).toThrow(/runBranchIdentity/);
  });

  it("rejects footprint history beyond the enclosing checkpoint frontier", () => {
    expect(() =>
      projectRuntimeInterventionFootprintFrame(
        runtimeState(
          composedSnapshot({
            tick: 12,
            simulationTimeHours: 0.24,
            events: [appliedEvent({ tick: 13 })],
          }),
        ),
      ),
    ).toThrow(/checkpoint tick/);

    expect(() =>
      projectRuntimeInterventionFootprintFrame(
        runtimeState(
          composedSnapshot({
            tick: 12,
            simulationTimeHours: 0.24,
            events: [appliedEvent({ simulationTimeHours: 0.25 })],
          }),
        ),
      ),
    ).toThrow(/checkpoint biological time/);
  });

  it("rejects reordered or duplicate accepted intervention event sequence", () => {
    expect(() =>
      projectRuntimeInterventionFootprintFrame(
        runtimeState(
          composedSnapshot({
            events: [
              appliedEvent({ sequence: 8, commandId: "dose-8" }),
              appliedEvent({ sequence: 7, commandId: "dose-7" }),
            ],
          }),
        ),
      ),
    ).toThrow(/strictly increasing event sequence/);
  });
});
