import { describe, expect, it } from "vitest";

import {
  createFlagshipRunConditionExecutionDefinition,
  createFlagshipSweepRunCondition,
  type FlagshipSweepInitialization,
} from "./flagshipRunCondition";

const baseline: FlagshipSweepInitialization = {
  initialResourceLevel: 8,
  inocula: [
    {
      lineageId: "founder-wt",
      x: 80,
      y: 80,
      biomass: 1,
    },
  ],
};

describe("flagship ML run-condition identity", () => {
  it("derives biological identity from explicit initial resource and founders, not display id", () => {
    const first = createFlagshipRunConditionExecutionDefinition(
      "baseline",
      baseline,
    );
    const renamed = createFlagshipRunConditionExecutionDefinition(
      "renamed",
      baseline,
    );

    expect(renamed.fingerprint).toBe(first.fingerprint);
    expect(createFlagshipSweepRunCondition("renamed", baseline)).toEqual({
      id: "renamed",
      fingerprint: first.fingerprint,
    });
  });

  it("changes identity when authoritative run-state initialization changes", () => {
    const baselineFingerprint =
      createFlagshipRunConditionExecutionDefinition(
        "baseline",
        baseline,
      ).fingerprint;

    expect(
      createFlagshipRunConditionExecutionDefinition("low-resource", {
        ...baseline,
        initialResourceLevel: 4,
      }).fingerprint,
    ).not.toBe(baselineFingerprint);

    expect(
      createFlagshipRunConditionExecutionDefinition("shifted-founder", {
        ...baseline,
        inocula: [{ ...baseline.inocula[0]!, x: 81 }],
      }).fingerprint,
    ).not.toBe(baselineFingerprint);

    expect(
      createFlagshipRunConditionExecutionDefinition("smaller-founder", {
        ...baseline,
        inocula: [{ ...baseline.inocula[0]!, biomass: 0.5 }],
      }).fingerprint,
    ).not.toBe(baselineFingerprint);
  });

  it("fails closed through flagship composition validation", () => {
    expect(() =>
      createFlagshipRunConditionExecutionDefinition("outside-dish", {
        ...baseline,
        inocula: [{ ...baseline.inocula[0]!, x: 0, y: 0 }],
      }),
    ).toThrow(/inside the dish mask/);

    expect(() =>
      createFlagshipRunConditionExecutionDefinition("invalid-resource", {
        ...baseline,
        initialResourceLevel: Number.NaN,
      }),
    ).toThrow(/initialResourceLevel/);
  });
});
