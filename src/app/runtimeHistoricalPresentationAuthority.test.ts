import { describe, expect, it } from "vitest";

import { ComposedSimulationEngine } from "../sim/composedEngine";
import type { SimulationSnapshot } from "../sim/protocol";
import { buildDefaultFlagshipRun } from "./flagshipRunPreset";
import type { ExperimentRuntimeState } from "./experimentRuntime";
import { createRuntimeHistoricalKeyframeTransaction } from "./runtimeHistoricalKeyframe";
import { createRuntimeHistoricalPresentationAuthority } from "./runtimeHistoricalPresentationAuthority";

function runtimeState(
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
    ecologyObservation: null,
    timeline: [],
    integrationError: null,
  };
}

function capturePair() {
  const prepared = buildDefaultFlagshipRun();
  const engine = new ComposedSimulationEngine(
    prepared.plan.identity,
    prepared.plan.config,
  );
  const branch = "flagship-run/generation-12";
  const first = engine.snapshot();
  const second = engine.execute({
    id: "history-advance-1",
    type: "advance",
    ticks: 1,
  });

  return {
    first: createRuntimeHistoricalKeyframeTransaction({
      runtimeState: runtimeState(first, branch),
      organismPresentationAuthority: prepared.organismPresentationAuthority,
    }),
    second: createRuntimeHistoricalKeyframeTransaction({
      runtimeState: runtimeState(second, branch),
      organismPresentationAuthority: prepared.organismPresentationAuthority,
    }),
  };
}

describe("runtime historical presentation authority", () => {
  it("assembles science and dish replay from the same selected transactions", () => {
    const { first, second } = capturePair();
    const authority = createRuntimeHistoricalPresentationAuthority([
      first,
      second,
    ]);

    expect(authority.runBranchIdentity).toBe(
      first.scientific.runBranchIdentity,
    );
    expect(authority.keyframeCount).toBe(2);
    expect(authority.firstAcceptedCommandCount).toBe(
      first.scientific.snapshot.checkpoint.commandCount,
    );
    expect(authority.lastAcceptedCommandCount).toBe(
      second.scientific.snapshot.checkpoint.commandCount,
    );

    const midpoint =
      (authority.firstAcceptedCommandCount +
        authority.lastAcceptedCommandCount) /
      2;
    const scientific = authority.historyIndex.resolve(midpoint);
    const dish = authority.dishPresenter.evaluate(midpoint);

    expect(scientific.kind).toBe("between-authority");
    expect(dish?.runBranchIdentity).toBe(authority.runBranchIdentity);
    expect(dish?.lowerAcceptedCommandCount).toBe(
      authority.firstAcceptedCommandCount,
    );
    expect(dish?.upperAcceptedCommandCount).toBe(
      authority.lastAcceptedCommandCount,
    );
  });

  it("rejects a transaction whose dish command position differs from science", () => {
    const { first } = capturePair();
    const mismatched = {
      ...first,
      dish: {
        ...first.dish,
        order: {
          ...first.dish.order,
          acceptedCommandCount:
            first.dish.order.acceptedCommandCount + 1,
        },
      },
    };

    expect(() =>
      createRuntimeHistoricalPresentationAuthority([mismatched]),
    ).toThrow(/accepted-command positions differ/);
  });

  it("rejects a transaction whose dish trace differs from science", () => {
    const { first } = capturePair();
    const mismatched = {
      ...first,
      dish: {
        ...first.dish,
        snapshot: {
          ...first.dish.snapshot,
          snapshotId: "composed-trace:foreign",
        },
      },
    };

    expect(() =>
      createRuntimeHistoricalPresentationAuthority([mismatched]),
    ).toThrow(/dish trace does not match scientific snapshot/);
  });

  it("rejects selected transactions from different runtime branches", () => {
    const { first, second } = capturePair();
    const foreignBranch = "flagship-run/generation-13";
    const secondScientific = {
      ...second.scientific,
      runBranchIdentity: foreignBranch,
    };
    const secondDish = {
      ...second.dish,
      order: {
        ...second.dish.order,
        runBranchIdentity: foreignBranch,
      },
      snapshot: {
        ...second.dish.snapshot,
        samplingIdentity: `runtime-branch:${foreignBranch}`,
      },
    };

    expect(() =>
      createRuntimeHistoricalPresentationAuthority([
        first,
        {
          scientific: secondScientific,
          dish: secondDish,
        },
      ]),
    ).toThrow(/cannot mix run branches/);
  });
});
