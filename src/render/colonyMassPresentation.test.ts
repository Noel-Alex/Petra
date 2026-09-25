import { describe, expect, it } from "vitest";

import {
  COLONY_MASS_PRESENTATION_VERSION,
  projectColonyMassAlpha,
  projectColonyMassAlphaField,
} from "./colonyMassPresentation";

describe("density-driven colony mass presentation", () => {
  it("keeps zero source density and off-mask cells exactly transparent", () => {
    const field = projectColonyMassAlphaField({
      width: 4,
      height: 1,
      dishMask: new Uint8Array([1, 1, 0, 1]),
      density: new Float32Array([0, 0.5, 1, 1]),
      sharedDensityMaximum: 1,
    });

    expect(field).toMatchObject({
      version: COLONY_MASS_PRESENTATION_VERSION,
      meaning: "presentation-only-density-mass",
      width: 4,
      height: 1,
      sharedDensityMaximum: 1,
    });
    expect([...field.alpha]).toEqual([0, 0.5, 0, 1]);
  });

  it("strengthens opacity monotonically without a biological threshold", () => {
    const values = [0, 0.1, 0.25, 0.5, 0.75, 1].map((density) =>
      projectColonyMassAlpha(density, 1),
    );

    expect(values[0]).toBe(0);
    for (let index = 1; index < values.length; index += 1) {
      expect(values[index]).toBeGreaterThan(values[index - 1]!);
    }
    expect(values.at(-1)).toBe(1);
  });

  it("gives equal source density equal treatment under one shared denominator", () => {
    expect(projectColonyMassAlpha(0.2, 2)).toBe(
      projectColonyMassAlpha(0.2, 2),
    );
    expect(projectColonyMassAlpha(0.2, 2)).toBeLessThan(
      projectColonyMassAlpha(1, 2),
    );
  });

  it("does not bridge a true zero-density gap or mutate source arrays", () => {
    const density = new Float32Array([1, 0.8, 0, 0.8, 1]);
    const mask = new Uint8Array([1, 1, 1, 1, 1]);
    const beforeDensity = [...density];
    const beforeMask = [...mask];

    const field = projectColonyMassAlphaField({
      width: 5,
      height: 1,
      dishMask: mask,
      density,
      sharedDensityMaximum: 1,
    });

    expect(field.alpha[0]).toBeGreaterThan(0);
    expect(field.alpha[1]).toBeGreaterThan(0);
    expect(field.alpha[2]).toBe(0);
    expect(field.alpha[3]).toBeGreaterThan(0);
    expect(field.alpha[4]).toBeGreaterThan(0);
    expect([...density]).toEqual(beforeDensity);
    expect([...mask]).toEqual(beforeMask);
    field.alpha[0] = 0;
    expect(density[0]).toBe(1);
  });

  it("fails closed on invalid grids, masks, densities, and shared scales", () => {
    expect(() =>
      projectColonyMassAlphaField({
        width: 2,
        height: 1,
        dishMask: [1],
        density: [1, 1],
        sharedDensityMaximum: 1,
      }),
    ).toThrow(/grid dimensions/);

    expect(() =>
      projectColonyMassAlphaField({
        width: 1,
        height: 1,
        dishMask: [2],
        density: [1],
        sharedDensityMaximum: 1,
      }),
    ).toThrow(/binary/);

    expect(() => projectColonyMassAlpha(-1, 1)).toThrow(/non-negative/);
    expect(() => projectColonyMassAlpha(1, Number.NaN)).toThrow(/finite/);
  });
});
