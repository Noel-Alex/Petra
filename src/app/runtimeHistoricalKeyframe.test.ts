import { describe, expect, it } from "vitest";

import { ComposedSimulationEngine } from "../sim/composedEngine";
import type { SimulationSnapshot } from "../sim/protocol";
import { buildDefaultFlagshipRun } from "./flagshipRunPreset";
import type { ExperimentRuntimeState } from "./experimentRuntime";
import { createRuntimeHistoricalKeyframeTransaction } from "./runtimeHistoricalKeyframe";

function runtimeState(
  snapshot: SimulationSnapshot | null,
  runBranchIdentity = "flagship-run/generation-0",
): ExperimentRuntimeState {
  if (snapshot === null) {
    const { plan } = buildDefaultFlagshipRun();
    return {
      controls: {
        identity: structuredClone(plan.identity),
        playing: false,
        speed: 1,
        acceptedCommands: [],
      },
      runBranchIdentity,
      worker: {
        phase: "idle",
        latestSnapshot: null,
        pendingCommandId: null,
        queuedRequests: 0,
        error: null,
        errorCode: null,
      },
      snapshot: null,
      ecologyObservation: null,
      timeline: [],
      integrationError: null,
    };
  }

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
    ecologyObservation: null,
    timeline: [],
    integrationError: null,
  };
}

describe("runtime historical keyframe transaction", () => {
  it("derives scientific and dish history from one exact composed runtime transaction", () => {
    const prepared = buildDefaultFlagshipRun();
    const engine = new ComposedSimulationEngine(
      prepared.plan.identity,
      prepared.plan.config,
    );
    const snapshot = engine.snapshot();
    const branch = "flagship-run/generation-7";

    const transaction = createRuntimeHistoricalKeyframeTransaction({
      runtimeState: runtimeState(snapshot, branch),
      organismPresentationAuthority: prepared.organismPresentationAuthority,
    });

    expect(transaction.scientific.runBranchIdentity).toBe(branch);
    expect(transaction.scientific.snapshot).not.toBe(snapshot);
    expect(transaction.scientific.snapshot.traceHash).toBe(snapshot.traceHash);

    expect(transaction.dish.order.runBranchIdentity).toBe(branch);
    expect(transaction.dish.order.acceptedCommandCount).toBe(
      snapshot.checkpoint.commandCount,
    );
    expect(transaction.dish.snapshot.snapshotId).toBe(
      `composed-trace:${snapshot.traceHash}`,
    );
    expect(transaction.dish.snapshot.samplingIdentity).toBe(
      `runtime-branch:${branch}`,
    );
    expect(transaction.dish.snapshot.simulationTimeHours).toBe(
      snapshot.checkpoint.simulationTimeHours,
    );
  });

  it("captures detached history rather than retaining caller-owned scientific arrays", () => {
    const prepared = buildDefaultFlagshipRun();
    const snapshot = new ComposedSimulationEngine(
      prepared.plan.identity,
      prepared.plan.config,
    ).snapshot();

    const transaction = createRuntimeHistoricalKeyframeTransaction({
      runtimeState: runtimeState(snapshot),
    });

    const capturedResource =
      transaction.scientific.snapshot.checkpoint.composedState.resource[0];
    snapshot.checkpoint.composedState.resource[0] = capturedResource + 123;

    expect(
      transaction.scientific.snapshot.checkpoint.composedState.resource[0],
    ).toBe(capturedResource);
    const resourceField = transaction.dish.snapshot.fields.find(
      (field) => field.kind === "resource",
    );
    expect(resourceField?.values[0]).toBeCloseTo(capturedResource ?? 0);
  });

  it("fails closed when no composed runtime snapshot is current", () => {
    expect(() =>
      createRuntimeHistoricalKeyframeTransaction({
        runtimeState: runtimeState(null),
      }),
    ).toThrow(/requires composed simulation authority/);
  });
});
