import { describe, expect, it } from "vitest";

import { ComposedSimulationEngine } from "../sim/composedEngine";
import type { ComposedSimulationSnapshot } from "../sim/protocol";
import { buildDefaultFlagshipRun } from "./flagshipRunPreset";
import { projectHistoricalPresentation } from "./historicalPresentation";
import {
  RuntimeHistoricalPresentationHistory,
  historicalDishSnapshot,
  historicalRegionInspectorState,
  historicalSimulationTimeLabel,
} from "./runtimeHistoricalPresentation";

function fixture() {
  const { plan } = buildDefaultFlagshipRun();
  const engine = new ComposedSimulationEngine(plan.identity, plan.config);
  const history = new RuntimeHistoricalPresentationHistory(
    "run:historical-presentation/main",
  );
  return { engine, history };
}

describe("runtime historical presentation history", () => {
  it("derives paired dish replay data from the exact accepted composed snapshots", () => {
    const { engine, history } = fixture();
    const start = engine.snapshot();
    expect(history.append(start)).toBe(true);

    engine.execute({ id: "advance-history-1", type: "advance", ticks: 1 });
    const next = engine.snapshot();
    expect(history.append(next)).toBe(true);

    const view = history.view();
    expect(view).not.toBeNull();
    if (view === null) throw new Error("expected history");

    expect(view.keyframeCount).toBe(2);
    expect(view.latestCommandCount).toBe(
      next.checkpoint.commandCount,
    );
    expect(view.latestDishSnapshot.snapshotId).toBe(
      `composed-trace:${next.traceHash}`,
    );
    expect(view.latestDishSnapshot.samplingIdentity).toBe(
      "runtime-branch:run:historical-presentation/main",
    );

    const exact = view.history.resolve(next.checkpoint.commandCount);
    expect(exact.kind).toBe("authoritative");

    const dish = view.dishPresenter.evaluate(
      next.checkpoint.commandCount,
      "snap-to-authority",
    );
    expect(dish).toMatchObject({
      mode: "authoritative-keyframe",
      stateAuthority: "authoritative",
      runBranchIdentity: "run:historical-presentation/main",
      lowerAcceptedCommandCount: next.checkpoint.commandCount,
      upperAcceptedCommandCount: next.checkpoint.commandCount,
    });
  });

  it("treats repeat delivery of the exact accepted snapshot as idempotent", () => {
    const { engine, history } = fixture();
    const snapshot = engine.snapshot();

    expect(history.append(snapshot)).toBe(true);
    expect(history.append(structuredClone(snapshot))).toBe(false);
    expect(history.view()?.keyframeCount).toBe(1);
  });

  it("rejects conflicting replacement at one accepted command position", () => {
    const { engine, history } = fixture();
    const snapshot = engine.snapshot();
    history.append(snapshot);

    const conflicting = structuredClone(snapshot) as ComposedSimulationSnapshot;
    (conflicting as { traceHash: string }).traceHash =
      `${snapshot.traceHash}-conflict`;

    expect(() => history.append(conflicting)).toThrow(
      /conflicting snapshot/,
    );
    expect(history.view()?.keyframeCount).toBe(1);
  });

  it("refuses branch and biological-history rewrites before publication", () => {
    expect(
      () => new RuntimeHistoricalPresentationHistory(" history-branch "),
    ).toThrow(/canonical/);

    const { engine, history } = fixture();
    const start = engine.snapshot();
    history.append(start);
    engine.execute({ id: "advance-history-2", type: "advance", ticks: 1 });
    const next = engine.snapshot();
    history.append(next);

    const regressed = structuredClone(start);
    expect(() => history.append(regressed)).toThrow(
      /cannot move backward in accepted command position/,
    );
  });

  it("keeps sparse in-between cursors presentation-only across dish, inspector, and time", () => {
    const { engine, history } = fixture();
    history.append(engine.snapshot());

    engine.execute({ id: "advance-history-gap-1", type: "advance", ticks: 1 });
    engine.execute({ id: "advance-history-gap-2", type: "advance", ticks: 1 });
    history.append(engine.snapshot());

    const view = history.view();
    if (view === null) throw new Error("expected history");

    const resolution = view.history.resolve(1);
    expect(resolution.kind).toBe("between-authority");
    const frame = projectHistoricalPresentation({
      resolution,
      dishPresenter: view.dishPresenter,
      dishMotion: "snap-to-authority",
      regionSelection: {
        id: "historical-center",
        centerX: 0.5,
        centerY: 0.5,
        radius: 0.05,
      },
    });

    expect(frame.kind).toBe("between-authority");
    expect(frame.scientificCheckpoint).toBeNull();
    expect(frame.regionInspection).toBeNull();

    const origin = view.history.resolve(0);
    if (origin.kind !== "authoritative") {
      throw new Error("expected authoritative origin");
    }
    expect(historicalDishSnapshot(frame).snapshotId).toBe(
      `composed-trace:${origin.keyframe.snapshot.traceHash}`,
    );
    expect(historicalRegionInspectorState(frame, true)).toMatchObject({
      status: "unavailable",
      reason:
        "Scientific region inspection is unavailable between authoritative historical checkpoints.",
    });
    expect(historicalSimulationTimeLabel(frame)).toContain(
      "presentation only",
    );
  });

});
