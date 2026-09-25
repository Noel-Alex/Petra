import { describe, expect, it } from "vitest";

import { createRendererDemoSnapshot } from "../render/pixi/demoSnapshot";
import {
  ENGINE_VERSION,
  PROTOCOL_VERSION,
  type SimulationSnapshot,
} from "../sim/protocol";
import type { ExperimentRuntimeState } from "./experimentRuntime";
import {
  createAuthoritativeDishReplayKeyframe,
  createRuntimeDishReplayKeyframe,
} from "./dishReplayKeyframe";

function simulationSnapshot(
  simulationTimeHours: number,
  commandCount: number,
): SimulationSnapshot {
  const tick = simulationTimeHours * 60;
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
      tick,
      simulationTimeHours,
      syntheticPopulation: 1000,
      rngState: [1, 2, 3, 4],
      commandCount,
    },
    events: [],
    traceHash: `trace-${commandCount}`,
  };
}

function experimentRuntimeState(
  snapshot: SimulationSnapshot,
  runBranchIdentity: string,
): ExperimentRuntimeState {
  return {
    controls: {
      identity: structuredClone(snapshot.checkpoint.identity),
      playing: false,
      speed: 1,
      acceptedCommands: [],
    },
    runBranchIdentity,
    worker: {
      phase: "ready",
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

describe("authoritative dish replay keyframe bridge", () => {
  it("binds exact runtime command order without changing biological time", () => {
    const runtime = simulationSnapshot(1, 9);
    const dish = {
      ...createRendererDemoSnapshot(8),
      snapshotId: "authoritative-9",
      samplingIdentity: "authoritative-run",
      simulationTimeHours: 1,
    };

    const keyframe = createAuthoritativeDishReplayKeyframe({
      runBranchIdentity: "run-1/branch-main",
      simulationSnapshot: runtime,
      dishSnapshot: dish,
    });

    expect(keyframe.order).toEqual({
      version: "petra-dish-replay-order/1",
      runBranchIdentity: "run-1/branch-main",
      acceptedCommandCount: 9,
    });
    expect(keyframe.snapshot).toBe(dish);
    expect(keyframe.snapshot.simulationTimeHours).toBe(1);
  });

  it("allows authoritative order to advance while biological time stays equal", () => {
    const before = createAuthoritativeDishReplayKeyframe({
      runBranchIdentity: "run-1/branch-main",
      simulationSnapshot: simulationSnapshot(1, 9),
      dishSnapshot: {
        ...createRendererDemoSnapshot(8),
        snapshotId: "before",
        samplingIdentity: "authoritative-run",
        simulationTimeHours: 1,
      },
    });
    const after = createAuthoritativeDishReplayKeyframe({
      runBranchIdentity: "run-1/branch-main",
      simulationSnapshot: simulationSnapshot(1, 10),
      dishSnapshot: {
        ...createRendererDemoSnapshot(8),
        snapshotId: "after",
        samplingIdentity: "authoritative-run",
        simulationTimeHours: 1,
      },
    });

    expect(after.order.acceptedCommandCount).toBeGreaterThan(
      before.order.acceptedCommandCount,
    );
    expect(after.snapshot.simulationTimeHours).toBe(
      before.snapshot.simulationTimeHours,
    );
  });

  it("rejects a dish projection bound to a different biological time", () => {
    expect(() =>
      createAuthoritativeDishReplayKeyframe({
        runBranchIdentity: "run-1/branch-main",
        simulationSnapshot: simulationSnapshot(1, 9),
        dishSnapshot: {
          ...createRendererDemoSnapshot(8),
          snapshotId: "wrong-time",
          samplingIdentity: "authoritative-run",
          simulationTimeHours: 2,
        },
      }),
    ).toThrow(/exactly match runtime checkpoint time/);
  });

  it("rejects non-canonical branch identity and malformed command order", () => {
    expect(() =>
      createAuthoritativeDishReplayKeyframe({
        runBranchIdentity: " branch-main ",
        simulationSnapshot: simulationSnapshot(1, 9),
        dishSnapshot: {
          ...createRendererDemoSnapshot(8),
          snapshotId: "bad-branch",
          samplingIdentity: "authoritative-run",
          simulationTimeHours: 1,
        },
      }),
    ).toThrow(/runBranchIdentity/);

    const malformed = simulationSnapshot(1, 9) as {
      checkpoint: SimulationSnapshot["checkpoint"];
      events: SimulationSnapshot["events"];
      traceHash: string;
    };
    (malformed.checkpoint as { commandCount: number }).commandCount = 1.5;

    expect(() =>
      createAuthoritativeDishReplayKeyframe({
        runBranchIdentity: "run-1/branch-main",
        simulationSnapshot: malformed,
        dishSnapshot: {
          ...createRendererDemoSnapshot(8),
          snapshotId: "bad-order",
          samplingIdentity: "authoritative-run",
          simulationTimeHours: 1,
        },
      }),
    ).toThrow(/acceptedCommandCount/);
  });
  it("binds equal command positions to distinct runtime-owned history generations", () => {
    const snapshot = simulationSnapshot(1, 9);
    const dish = {
      ...createRendererDemoSnapshot(8),
      snapshotId: "runtime-bound",
      samplingIdentity: "authoritative-run",
      simulationTimeHours: 1,
    };

    const first = createRuntimeDishReplayKeyframe({
      runtimeState: experimentRuntimeState(snapshot, "run-1/generation-1"),
      dishSnapshot: dish,
    });
    const restored = createRuntimeDishReplayKeyframe({
      runtimeState: experimentRuntimeState(snapshot, "run-1/generation-2"),
      dishSnapshot: { ...dish, snapshotId: "runtime-bound-restored" },
    });

    expect(first.order.acceptedCommandCount).toBe(9);
    expect(restored.order.acceptedCommandCount).toBe(9);
    expect(first.order.runBranchIdentity).toBe("run-1/generation-1");
    expect(restored.order.runBranchIdentity).toBe("run-1/generation-2");
    expect(restored.order.runBranchIdentity).not.toBe(
      first.order.runBranchIdentity,
    );
  });

});
