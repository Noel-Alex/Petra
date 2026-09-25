import { describe, expect, it } from "vitest";

import {
  createAspergillusNo10SurfaceCheckpoint,
} from "../sim/fungi/aspergillusNo10Surface";
import type { DishRenderSnapshot } from "../render/model";
import {
  projectAspergillusNo10SurfaceFrontForRender,
} from "./fungalSurfaceRenderProjection";
import {
  DISH_AUTHORITY_SCENE_SCHEMA_VERSION,
  createDishAuthorityScene,
} from "./dishAuthorityScene";

function composedFixture(
  simulationTimeHours = 2,
): DishRenderSnapshot {
  return {
    snapshotId: "scene-fixture",
    samplingIdentity: "runtime-branch:scene-fixture",
    simulationTimeHours,
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

describe("dish authority scene", () => {
  it("wraps a valid composed runtime snapshot without copying renderer payloads", () => {
    const snapshot = composedFixture();
    const scene = createDishAuthorityScene({ composedRuntime: snapshot });

    expect(scene).not.toBeNull();
    expect(scene).toMatchObject({
      schemaVersion: DISH_AUTHORITY_SCENE_SCHEMA_VERSION,
      mode: "composed-runtime",
      biologicalTimeHours: 2,
      fungalSourceValidation: null,
    });
    if (scene?.mode !== "composed-runtime") {
      throw new Error("expected composed-runtime scene");
    }
    expect(scene.composedRuntime).toBe(snapshot);
    expect(scene.composedRuntime.biomass).toBe(snapshot.biomass);
    expect(scene.composedRuntime.dishMask).toBe(snapshot.dishMask);
    expect(Object.isFrozen(scene)).toBe(true);
  });

  it("wraps the exact fungal source-validation front without inventing density", () => {
    const front = projectAspergillusNo10SurfaceFrontForRender(
      createAspergillusNo10SurfaceCheckpoint(70),
    );
    const scene = createDishAuthorityScene({
      fungalSourceValidation: front,
    });

    expect(scene).not.toBeNull();
    expect(scene).toMatchObject({
      schemaVersion: DISH_AUTHORITY_SCENE_SCHEMA_VERSION,
      mode: "fungal-source-validation",
      biologicalTimeHours: 0,
      composedRuntime: null,
    });
    if (scene?.mode !== "fungal-source-validation") {
      throw new Error("expected fungal-source-validation scene");
    }
    expect(scene.fungalSourceValidation).toBe(front);
    expect("density" in scene.fungalSourceValidation).toBe(false);
    expect("biomass" in scene.fungalSourceValidation).toBe(false);
    expect(Object.isFrozen(scene)).toBe(true);
  });

  it("refuses equal-time cross-source composition because time is not an authority join key", () => {
    const snapshot = composedFixture(0);
    const front = projectAspergillusNo10SurfaceFrontForRender(
      createAspergillusNo10SurfaceCheckpoint(70),
    );

    expect(() =>
      createDishAuthorityScene({
        composedRuntime: snapshot,
        fungalSourceValidation: front,
      }),
    ).toThrow(
      /cannot combine composed runtime with standalone fungal source-validation authority/,
    );
  });

  it("treats absence of scientific authority as waiting rather than fabricated state", () => {
    expect(createDishAuthorityScene({})).toBeNull();
    expect(
      createDishAuthorityScene({
        composedRuntime: null,
        fungalSourceValidation: null,
      }),
    ).toBeNull();
  });

  it("fails closed on malformed composed render authority", () => {
    const snapshot = composedFixture();
    const malformed = {
      ...snapshot,
      dishMask: new Uint8Array([2]),
    };

    expect(() =>
      createDishAuthorityScene({ composedRuntime: malformed }),
    ).toThrow(/dishMask values must be 0 or 1/);
  });

  it("fails closed when fungal source identity or unsupported-semantic boundaries drift", () => {
    const front = projectAspergillusNo10SurfaceFrontForRender(
      createAspergillusNo10SurfaceCheckpoint(70),
    );
    const foreignSource = {
      ...front,
      sourcePackId: " ",
    };
    const widenedSemantics = {
      ...front,
      unsupportedScientificSemantics:
        front.unsupportedScientificSemantics.slice(0, -1),
    };

    expect(() =>
      createDishAuthorityScene({
        fungalSourceValidation: foreignSource,
      }),
    ).toThrow(/source pack id must be canonical text/);
    expect(() =>
      createDishAuthorityScene({
        fungalSourceValidation: widenedSemantics,
      }),
    ).toThrow(/preserve every unsupported scientific semantic/);
  });
});
