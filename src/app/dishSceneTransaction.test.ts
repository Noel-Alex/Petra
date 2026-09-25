import { describe, expect, it } from "vitest";

import type { DishRenderSnapshot } from "../render/model";
import {
  advanceAspergillusNo10SurfaceCheckpoint,
  createAspergillusNo10SurfaceCheckpoint,
} from "../sim/fungi/aspergillusNo10Surface";
import { projectAspergillusNo10SurfaceFrontForRender } from "./fungalSurfaceRenderProjection";
import {
  createDishSceneTransaction,
  validateDishSceneTransaction,
} from "./dishSceneTransaction";

function composedSnapshot(
  simulationTimeHours = 2,
): DishRenderSnapshot {
  return {
    snapshotId: "composed-trace:test",
    samplingIdentity: "runtime-branch:test",
    simulationTimeHours,
    gridWidth: 1,
    gridHeight: 1,
    dishMask: new Uint8Array([1]),
    biomass: new Float32Array([0]),
    fields: [],
    lineages: [],
    acceptedInterventionFootprints: [],
    events: [],
  };
}

describe("dish scene transaction", () => {
  it("wraps composed runtime authority without copying renderer buffers", () => {
    const snapshot = composedSnapshot();
    const transaction = createDishSceneTransaction({
      composedRuntime: snapshot,
    });

    expect(transaction.authorityMode).toBe("composed-runtime");
    expect(transaction.biologicalTimeHours).toBe(
      snapshot.simulationTimeHours,
    );
    expect(transaction.composedRuntime).toBe(snapshot);
    expect(transaction.composedRuntime?.dishMask).toBe(snapshot.dishMask);
    expect(transaction.composedRuntime?.biomass).toBe(snapshot.biomass);
    expect(transaction.fungalSourceValidation).toBeNull();
    expect(Object.isFrozen(transaction)).toBe(true);
    expect(() => validateDishSceneTransaction(transaction)).not.toThrow();
  });

  it("wraps fungal source-validation authority without inventing density semantics", () => {
    const projection = projectAspergillusNo10SurfaceFrontForRender(
      advanceAspergillusNo10SurfaceCheckpoint(
        createAspergillusNo10SurfaceCheckpoint(70),
        2,
      ),
    );
    const transaction = createDishSceneTransaction({
      fungalSourceValidation: projection,
    });

    expect(transaction.authorityMode).toBe("fungal-source-validation");
    expect(transaction.biologicalTimeHours).toBe(
      projection.biologicalTimeHours,
    );
    expect(transaction.fungalSourceValidation).toBe(projection);
    expect(transaction.composedRuntime).toBeNull();
    expect("density" in transaction.fungalSourceValidation!).toBe(false);
    expect("biomass" in transaction.fungalSourceValidation!).toBe(false);
    expect(() => validateDishSceneTransaction(transaction)).not.toThrow();
  });

  it("refuses composed plus standalone fungal authority even at equal biological time", () => {
    const snapshot = composedSnapshot(2);
    const fungal = projectAspergillusNo10SurfaceFrontForRender(
      advanceAspergillusNo10SurfaceCheckpoint(
        createAspergillusNo10SurfaceCheckpoint(70),
        2,
      ),
    );

    expect(fungal.biologicalTimeHours).toBe(snapshot.simulationTimeHours);
    expect(() =>
      createDishSceneTransaction({
        composedRuntime: snapshot,
        fungalSourceValidation: fungal,
      }),
    ).toThrow(/refuses simultaneous/);
  });

  it("refuses a scientific scene with no authority source", () => {
    expect(() => createDishSceneTransaction({})).toThrow(
      /exactly one authoritative source/,
    );
  });

  it("fails closed when the composed render source is invalid", () => {
    const snapshot = {
      ...composedSnapshot(),
      dishMask: new Uint8Array([2]),
    };

    expect(() =>
      createDishSceneTransaction({ composedRuntime: snapshot }),
    ).toThrow(/dishMask values must be 0 or 1/);
  });

  it("fails closed if fungal physical and normalized front geometry drift apart", () => {
    const projection = projectAspergillusNo10SurfaceFrontForRender(
      advanceAspergillusNo10SurfaceCheckpoint(
        createAspergillusNo10SurfaceCheckpoint(40),
        2,
      ),
    );
    const drifted = {
      ...projection,
      front: {
        ...projection.front,
        normalizedRadius: projection.front.normalizedRadius / 2,
      },
    };

    expect(() =>
      createDishSceneTransaction({
        fungalSourceValidation: drifted,
      }),
    ).toThrow(/normalized front radius must match physical/);
  });
});
