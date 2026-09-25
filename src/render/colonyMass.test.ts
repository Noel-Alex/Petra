import { describe, expect, it } from "vitest";
import {
  COLONY_MASS_PRESENTATION_POLICY_VERSION,
  DEFAULT_COLONY_MASS_PRESENTATION_POLICY,
  projectColonyMassAlpha,
  validateColonyMassPresentationPolicy,
} from "./colonyMass";

describe("colony-mass presentation transfer", () => {
  it("keeps empty source support exactly transparent", () => {
    expect(projectColonyMassAlpha(0, 10)).toBe(0);
    expect(projectColonyMassAlpha(0, 0)).toBe(0);
  });

  it("is monotonic and bounded on one shared density scale", () => {
    const projected = [0, 0.25, 0.5, 0.75, 1].map((fraction) =>
      projectColonyMassAlpha(fraction * 8, 8),
    );

    expect(projected[0]).toBe(0);
    for (let index = 1; index < projected.length; index += 1) {
      expect(projected[index]!).toBeGreaterThan(projected[index - 1]!);
    }
    expect(projected.at(-1)).toBe(
      DEFAULT_COLONY_MASS_PRESENTATION_POLICY.maximumAlpha,
    );
  });

  it("does not self-normalize a rare lineage to dominant visual strength", () => {
    const rareAtOne = projectColonyMassAlpha(1, 10);
    const dominantAtTen = projectColonyMassAlpha(10, 10);
    const sameSourceSameScale = projectColonyMassAlpha(1, 10);

    expect(rareAtOne).toBe(sameSourceSameScale);
    expect(rareAtOne).toBeLessThan(dominantAtTen);
  });

  it("fails closed on invalid density/scale and presentation policy", () => {
    expect(() => projectColonyMassAlpha(-1, 10)).toThrow(/non-negative/);
    expect(() => projectColonyMassAlpha(1, 0)).toThrow(/zero shared/);
    expect(() => projectColonyMassAlpha(11, 10)).toThrow(/exceed/);
    expect(() => projectColonyMassAlpha(1, Number.POSITIVE_INFINITY)).toThrow(
      /finite/,
    );

    expect(() =>
      validateColonyMassPresentationPolicy({
        version: COLONY_MASS_PRESENTATION_POLICY_VERSION,
        maximumAlpha: 0,
        densityExponent: 1,
      }),
    ).toThrow(/maximumAlpha/);
    expect(() =>
      validateColonyMassPresentationPolicy({
        version: COLONY_MASS_PRESENTATION_POLICY_VERSION,
        maximumAlpha: 0.5,
        densityExponent: 0,
      }),
    ).toThrow(/densityExponent/);
  });
});
