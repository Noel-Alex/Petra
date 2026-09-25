import { describe, expect, it } from "vitest";

import type { DishRenderSnapshot } from "../render/model";
import {
  createAspergillusNo10SurfaceCheckpoint,
  type AspergillusNo10SurfaceCheckpoint,
} from "../sim/fungi/aspergillusNo10Surface";
import {
  createRunIdentity,
  type ComposedSimulationSnapshot,
} from "../sim/protocol";
import { createDishSceneTransaction } from "./dishSceneTransaction";

function composedSnapshot(
  simulationTimeHours = 0,
  traceHash = "scene-trace-a",
): ComposedSimulationSnapshot {
  return {
    events: [],
    traceHash,
    checkpoint: {
      authority: "composed",
      identity: createRunIdentity({
        scenarioId: "dish-scene-fixture",
        scenarioVersion: "1",
        parameterSetId: "dish-scene-fixture",
        parameterSetVersion: "1",
        seed: 7,
      }),
      tick: 4,
      simulationTimeHours,
      commandCount: 3,
      rngState: [1, 2, 3, 4],
      composedState:
        {} as ComposedSimulationSnapshot["checkpoint"]["composedState"],
      metrics: {} as ComposedSimulationSnapshot["checkpoint"]["metrics"],
    },
  };
}

function dishFor(
  snapshot: ComposedSimulationSnapshot,
  runBranchIdentity = "scene-branch-a",
): DishRenderSnapshot {
  return {
    snapshotId: `composed-trace:${snapshot.traceHash}`,
    samplingIdentity: `runtime-branch:${runBranchIdentity}`,
    simulationTimeHours: snapshot.checkpoint.simulationTimeHours,
    gridWidth: 1,
    gridHeight: 1,
    dishMask: new Uint8Array([1]),
    biomass: new Float32Array([2]),
    fields: [],
    lineages: [],
    acceptedInterventionFootprints: [],
    events: [],
  };
}

describe("dish scene transaction", () => {
  it("binds an exact composed runtime dish without copying scientific grid buffers", () => {
    const snapshot = composedSnapshot(1.25);
    const dish = dishFor(snapshot);

    const scene = createDishSceneTransaction({
      composedRuntime: {
        snapshot,
        runBranchIdentity: "scene-branch-a",
        dish,
      },
    });

    expect(scene.authorityMode).toBe("composed-runtime");
    if (scene.authorityMode !== "composed-runtime") {
      throw new Error("expected composed-runtime scene");
    }

    expect(scene.acceptedRuntime).toMatchObject({
      runBranchIdentity: "scene-branch-a",
      traceHash: snapshot.traceHash,
      tick: 4,
      acceptedCommandCount: 3,
      biologicalTimeHours: 1.25,
    });
    expect(scene.acceptedRuntime.runIdentity).toEqual(snapshot.checkpoint.identity);
    expect(scene.acceptedRuntime.runIdentity).not.toBe(snapshot.checkpoint.identity);
    expect(scene.dish).toBe(dish);
    expect(scene.dish.biomass).toBe(dish.biomass);
    expect(scene.fungalSourceValidation).toBeNull();
  });

  it("keeps fungal source validation explicitly outside accepted runtime identity", () => {
    const checkpoint = createAspergillusNo10SurfaceCheckpoint(40);

    const scene = createDishSceneTransaction({
      fungalSourceValidation: { checkpoint },
    });

    expect(scene.authorityMode).toBe("fungal-source-validation");
    if (scene.authorityMode !== "fungal-source-validation") {
      throw new Error("expected fungal-source-validation scene");
    }

    expect(scene.acceptedRuntime).toBeNull();
    expect(scene.dish).toBeNull();
    expect(scene.fungalSourceValidation).toMatchObject({
      authority: "source-validation-front",
      taxonId: checkpoint.taxonId,
      taxonContentVersion: checkpoint.taxonContentVersion,
      sourcePackId: checkpoint.sourcePackId,
      treatmentId: checkpoint.treatmentId,
      biologicalTimeHours: checkpoint.biologicalTimeHours,
      front: {
        radiusUm: 0,
        normalizedRadius: 0,
      },
    });
  });

  it("refuses a same-time composed dish plus standalone fungal validation source", () => {
    const snapshot = composedSnapshot(0);
    const fungalCheckpoint = createAspergillusNo10SurfaceCheckpoint(40);

    expect(() =>
      createDishSceneTransaction({
        composedRuntime: {
          snapshot,
          runBranchIdentity: "scene-branch-a",
          dish: dishFor(snapshot),
        },
        fungalSourceValidation: {
          checkpoint: fungalCheckpoint,
        },
      }),
    ).toThrow(/requires exactly one scientific authority source/);
  });

  it("rejects a dish from a different trace, branch, or biological time", () => {
    const snapshot = composedSnapshot(2);
    const dish = dishFor(snapshot);

    expect(() =>
      createDishSceneTransaction({
        composedRuntime: {
          snapshot,
          runBranchIdentity: "scene-branch-a",
          dish: { ...dish, snapshotId: "composed-trace:foreign-trace" },
        },
      }),
    ).toThrow(/exact runtime snapshot trace/);

    expect(() =>
      createDishSceneTransaction({
        composedRuntime: {
          snapshot,
          runBranchIdentity: "scene-branch-a",
          dish: { ...dish, samplingIdentity: "runtime-branch:other-branch" },
        },
      }),
    ).toThrow(/exact runtime branch sampling identity/);

    expect(() =>
      createDishSceneTransaction({
        composedRuntime: {
          snapshot,
          runBranchIdentity: "scene-branch-a",
          dish: { ...dish, simulationTimeHours: 2.5 },
        },
      }),
    ).toThrow(/biological time must match/);
  });

  it("rejects missing authority instead of falling back to demo state", () => {
    expect(() => createDishSceneTransaction({})).toThrow(
      /requires exactly one scientific authority source/,
    );
  });

  it("delegates malformed fungal checkpoints to the existing source validator", () => {
    const checkpoint = createAspergillusNo10SurfaceCheckpoint(40);
    const malformed = {
      ...checkpoint,
      treatmentId: "foreign-treatment",
    } as AspergillusNo10SurfaceCheckpoint;

    expect(() =>
      createDishSceneTransaction({
        fungalSourceValidation: { checkpoint: malformed },
      }),
    ).toThrow(/treatment identity mismatch/);
  });
});
