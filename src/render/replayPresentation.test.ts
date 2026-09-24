import { describe, expect, it } from "vitest";

import type { DishRenderSnapshot } from "./model";
import {
  createDishReplayPresenter,
  resolveDishReplayPresentation,
} from "./replayPresentation";

function snapshot(
  id: string,
  simulationTimeHours: number,
  biomass: readonly number[],
  samplingIdentity = "run-1",
): DishRenderSnapshot {
  return {
    snapshotId: id,
    samplingIdentity,
    simulationTimeHours,
    gridWidth: 2,
    gridHeight: 1,
    dishMask: new Uint8Array([1, 1]),
    biomass: new Float32Array(biomass),
    fields: [
      {
        id: "nutrient",
        kind: "nutrient",
        label: "Nutrient",
        unit: "a.u.",
        width: 2,
        height: 1,
        values: new Float32Array(biomass),
        minimum: 0,
        maximum: 20,
      },
    ],
    lineages: [
      {
        id: "ancestor",
        label: "Ancestor",
        appearanceToken: "lineage-cyan",
        patternToken: "solid-ring",
        density: new Float32Array(biomass),
      },
    ],
    events: [],
  };
}

describe("dish replay presentation", () => {
  it("evaluates intermediate scrub positions deterministically", () => {
    const a = snapshot("a", 0, [0, 4]);
    const b = snapshot("b", 2, [10, 8]);

    const first = resolveDishReplayPresentation({
      snapshots: [a, b],
      requestedSimulationTimeHours: 1,
    });
    const second = resolveDishReplayPresentation({
      snapshots: [a, b],
      requestedSimulationTimeHours: 1,
    });

    expect(first?.mode).toBe("interpolated-presentation");
    expect(first?.stateAuthority).toBe("presentation-only");
    expect(first?.progress).toBe(0.5);
    expect(Array.from(first!.state.biomass)).toEqual([5, 6]);
    expect(Array.from(second!.state.biomass)).toEqual([5, 6]);
  });

  it("reuses the active interval presentation buffers during interactive scrubbing", () => {
    const a = snapshot("a", 0, [0, 0]);
    const b = snapshot("b", 2, [10, 20]);
    const c = snapshot("c", 4, [20, 40]);
    const presenter = createDishReplayPresenter([a, b, c]);

    const first = presenter.evaluate(0.5);
    if (first === null) throw new Error("expected replay presentation");
    const reusedFrame = first.state;
    expect(Array.from(reusedFrame.biomass)).toEqual([2.5, 5]);

    const second = presenter.evaluate(1.5);
    expect(second?.state).toBe(reusedFrame);
    expect(Array.from(second!.state.biomass)).toEqual([7.5, 15]);

    const nextInterval = presenter.evaluate(3);
    expect(nextInterval?.state).not.toBe(reusedFrame);
    expect(Array.from(nextInterval!.state.biomass)).toEqual([15, 30]);
  });

  it("returns exact authoritative endpoints outside the recorded range", () => {
    const a = snapshot("a", 2, [2, 2]);
    const b = snapshot("b", 4, [4, 4]);

    expect(
      resolveDishReplayPresentation({
        snapshots: [a, b],
        requestedSimulationTimeHours: 0,
      })?.state,
    ).toBe(a);
    expect(
      resolveDishReplayPresentation({
        snapshots: [a, b],
        requestedSimulationTimeHours: 8,
      })?.state,
    ).toBe(b);
  });

  it("snaps to previous authority when interpolation is disabled", () => {
    const a = snapshot("a", 0, [0, 0]);
    const b = snapshot("b", 1, [10, 10]);

    const result = resolveDishReplayPresentation({
      snapshots: [a, b],
      requestedSimulationTimeHours: 0.75,
      motion: "snap-to-authority",
    });

    expect(result).toMatchObject({
      mode: "previous-authority-snap",
      state: a,
      stateAuthority: "authoritative",
      progress: 0.75,
    });
  });

  it("fails closed to previous authority when keyframes cannot be morphed", () => {
    const a = snapshot("a", 0, [0, 0], "run-a");
    const b = snapshot("b", 1, [10, 10], "run-b");

    expect(
      resolveDishReplayPresentation({
        snapshots: [a, b],
        requestedSimulationTimeHours: 0.5,
      }),
    ).toMatchObject({
      mode: "previous-authority-snap",
      state: a,
      interpolationRefusalReason: "sampling-identity-mismatch",
    });
  });

  it("rejects ambiguous duplicate simulation-time keyframes", () => {
    expect(() =>
      resolveDishReplayPresentation({
        snapshots: [
          snapshot("a", 1, [1, 1]),
          snapshot("b", 1, [2, 2]),
        ],
        requestedSimulationTimeHours: 1,
      }),
    ).toThrow(/strictly increasing/);
  });

  it("returns null for an empty authoritative history", () => {
    expect(
      resolveDishReplayPresentation({
        snapshots: [],
        requestedSimulationTimeHours: 0,
      }),
    ).toBeNull();
  });
});
