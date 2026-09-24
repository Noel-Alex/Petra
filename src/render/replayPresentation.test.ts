import { describe, expect, it } from "vitest";

import { LINEAGE_APPEARANCE_TOKENS } from "./lineageAppearance";
import type { DishRenderSnapshot } from "./model";
import {
  createDishReplayPresenter,
  resolveDishReplayPresentation,
} from "./replayPresentation";
import {
  DISH_REPLAY_ORDER_VERSION,
  type AuthoritativeDishReplayKeyframe,
} from "./replayIdentity";

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
        appearanceToken: LINEAGE_APPEARANCE_TOKENS[0],
        patternToken: "solid-ring",
        density: new Float32Array(biomass),
      },
    ],
    events: [],
  };
}

function keyframe(
  id: string,
  simulationTimeHours: number,
  acceptedCommandCount: number,
  biomass: readonly number[],
  samplingIdentity = "run-1",
  runBranchIdentity = "branch-1",
): AuthoritativeDishReplayKeyframe {
  return {
    order: {
      version: DISH_REPLAY_ORDER_VERSION,
      runBranchIdentity,
      acceptedCommandCount,
    },
    snapshot: snapshot(
      id,
      simulationTimeHours,
      biomass,
      samplingIdentity,
    ),
  };
}

describe("dish replay presentation", () => {
  it("evaluates intermediate replay-order positions deterministically", () => {
    const a = keyframe("a", 0, 0, [0, 4]);
    const b = keyframe("b", 2, 2, [10, 8]);

    const first = resolveDishReplayPresentation({
      keyframes: [a, b],
      requestedOrderPosition: 1,
    });
    const second = resolveDishReplayPresentation({
      keyframes: [a, b],
      requestedOrderPosition: 1,
    });

    expect(first?.mode).toBe("interpolated-presentation");
    expect(first?.stateAuthority).toBe("presentation-only");
    expect(first?.progress).toBe(0.5);
    expect(first?.lowerSimulationTimeHours).toBe(0);
    expect(first?.upperSimulationTimeHours).toBe(2);
    expect(Array.from(first!.state.biomass)).toEqual([5, 6]);
    expect(Array.from(second!.state.biomass)).toEqual([5, 6]);
  });

  it("reuses the active interval presentation buffers during interactive scrubbing", () => {
    const a = keyframe("a", 0, 0, [0, 0]);
    const b = keyframe("b", 2, 2, [10, 20]);
    const c = keyframe("c", 4, 4, [20, 40]);
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
    const a = keyframe("a", 2, 4, [2, 2]);
    const b = keyframe("b", 4, 5, [4, 4]);

    expect(
      resolveDishReplayPresentation({
        keyframes: [a, b],
        requestedOrderPosition: 0,
      })?.state,
    ).toBe(a.snapshot);
    expect(
      resolveDishReplayPresentation({
        keyframes: [a, b],
        requestedOrderPosition: 8,
      })?.state,
    ).toBe(b.snapshot);
  });

  it("snaps to previous authority when interpolation is disabled", () => {
    const a = keyframe("a", 0, 0, [0, 0]);
    const b = keyframe("b", 1, 1, [10, 10]);

    const result = resolveDishReplayPresentation({
      keyframes: [a, b],
      requestedOrderPosition: 0.75,
      motion: "snap-to-authority",
    });

    expect(result).toMatchObject({
      mode: "previous-authority-snap",
      state: a.snapshot,
      stateAuthority: "authoritative",
      progress: 0.75,
    });
  });

  it("fails closed to previous authority when keyframes cannot be morphed", () => {
    const a = keyframe("a", 0, 0, [0, 0], "run-a");
    const b = keyframe("b", 1, 1, [10, 10], "run-b");

    expect(
      resolveDishReplayPresentation({
        keyframes: [a, b],
        requestedOrderPosition: 0.5,
      }),
    ).toMatchObject({
      mode: "previous-authority-snap",
      state: a.snapshot,
      interpolationRefusalReason: "sampling-identity-mismatch",
    });
  });

  it("replays distinct same-time keyframes in authoritative accepted-command order", () => {
    const beforePulse = keyframe("before-pulse", 1, 7, [2, 2]);
    const afterPulse = keyframe("after-pulse", 1, 8, [8, 4]);
    const presenter = createDishReplayPresenter([
      beforePulse,
      afterPulse,
    ]);

    expect(presenter.evaluate(7)).toMatchObject({
      mode: "authoritative-keyframe",
      state: beforePulse.snapshot,
      lowerSimulationTimeHours: 1,
      upperSimulationTimeHours: 1,
    });

    expect(presenter.evaluate(7.5)).toMatchObject({
      mode: "interpolated-presentation",
      stateAuthority: "presentation-only",
      progress: 0.5,
      lowerAcceptedCommandCount: 7,
      upperAcceptedCommandCount: 8,
      lowerSimulationTimeHours: 1,
      upperSimulationTimeHours: 1,
    });

    expect(presenter.evaluate(8)).toMatchObject({
      mode: "authoritative-keyframe",
      state: afterPulse.snapshot,
      lowerSimulationTimeHours: 1,
      upperSimulationTimeHours: 1,
    });
  });

  it("rejects duplicate or regressing authoritative order identity", () => {
    expect(() =>
      createDishReplayPresenter([
        keyframe("a", 1, 7, [1, 1]),
        keyframe("b", 1, 7, [2, 2]),
      ]),
    ).toThrow(/strictly increasing/);

    expect(() =>
      createDishReplayPresenter([
        keyframe("a", 1, 8, [1, 1]),
        keyframe("b", 1, 7, [2, 2]),
      ]),
    ).toThrow(/strictly increasing/);
  });

  it("rejects mixed run-branch scopes instead of inferring ancestry", () => {
    expect(() =>
      createDishReplayPresenter([
        keyframe("a", 1, 7, [1, 1], "run-1", "branch-a"),
        keyframe("b", 1, 8, [2, 2], "run-1", "branch-b"),
      ]),
    ).toThrow(/one runBranchIdentity/);
  });

  it("rejects biological-time regression inside one run branch", () => {
    expect(() =>
      createDishReplayPresenter([
        keyframe("a", 2, 7, [1, 1]),
        keyframe("b", 1, 8, [2, 2]),
      ]),
    ).toThrow(/non-decreasing/);
  });

  it("returns null for an empty authoritative history", () => {
    expect(
      resolveDishReplayPresentation({
        keyframes: [],
        requestedOrderPosition: 0,
      }),
    ).toBeNull();
  });
});
