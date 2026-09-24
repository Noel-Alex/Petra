import { describe, expect, it } from "vitest";

import { SimulationRng } from "./rng";
import {
  SAMPLING_EXECUTION_POLICY_SCHEMA_VERSION,
  SamplingPolicyRefusalError,
  createSamplingDrawBudget,
  expectedSparseBinomialDraws,
  requireAcceleratedSampling,
  runSamplingTransaction,
  sampleExactSparseBinomial,
  samplingExecutionPolicyIdentity,
  type SamplingExecutionPolicy,
} from "./samplingPolicy";

function policy(
  overrides: Partial<SamplingExecutionPolicy> = {},
): SamplingExecutionPolicy {
  return {
    schemaVersion: SAMPLING_EXECUTION_POLICY_SCHEMA_VERSION,
    id: "synthetic-sampler-policy",
    exactTrialLimit: 100,
    acceleration: "exact-sparse-binomial-v1",
    maximumExpectedAcceleratedDraws: 5_000,
    maximumAcceleratedDraws: 10_000,
    ...overrides,
  };
}

describe("sampling execution policy", () => {
  it("has replay-relevant identity for every numerical budget and algorithm choice", () => {
    const baseline = samplingExecutionPolicyIdentity(policy());
    expect(
      samplingExecutionPolicyIdentity(
        policy({ maximumAcceleratedDraws: 10_001 }),
      ),
    ).not.toBe(baseline);
    expect(
      samplingExecutionPolicyIdentity(
        policy({ acceleration: "disabled" }),
      ),
    ).not.toBe(baseline);
  });

  it("uses exact zero/one binomial limits without consuming RNG", () => {
    for (const probability of [0, 1] as const) {
      const rng = new SimulationRng(7);
      const before = rng.snapshot();
      const result = sampleExactSparseBinomial(
        1_000_000,
        probability,
        rng,
        createSamplingDrawBudget(policy()),
        samplingExecutionPolicyIdentity(policy()),
      );
      expect(result).toBe(probability === 0 ? 0 : 1_000_000);
      expect(rng.snapshot()).toEqual(before);
    }
  });

  it("refuses disabled/oversized acceleration before any random draw", () => {
    expect(() =>
      requireAcceleratedSampling(
        1_000_000,
        20,
        policy({ acceleration: "disabled" }),
      ),
    ).toThrow(SamplingPolicyRefusalError);

    expect(() =>
      requireAcceleratedSampling(
        1_000_000,
        5_001,
        policy(),
      ),
    ).toThrow(/expected-draw budget/);
  });

  it("rolls back RNG state when a hard accelerated budget refuses", () => {
    const rng = new SimulationRng(99);
    const before = rng.snapshot();
    const tiny = policy({
      maximumExpectedAcceleratedDraws: 1,
      maximumAcceleratedDraws: 1,
    });

    expect(() =>
      runSamplingTransaction(rng, (transactionRng) =>
        sampleExactSparseBinomial(
          1_000,
          0.5,
          transactionRng,
          createSamplingDrawBudget(tiny),
          samplingExecutionPolicyIdentity(tiny),
        ),
      ),
    ).toThrow(SamplingPolicyRefusalError);
    expect(rng.snapshot()).toEqual(before);
  });

  it("matches binomial mean and variance over deterministic many-seed fixtures", () => {
    const trials = 500;
    const probability = 0.02;
    const samples = 4_000;
    const values: number[] = [];

    for (let seed = 1; seed <= samples; seed += 1) {
      values.push(
        sampleExactSparseBinomial(
          trials,
          probability,
          new SimulationRng(seed),
          createSamplingDrawBudget(policy()),
          samplingExecutionPolicyIdentity(policy()),
        ),
      );
    }

    const mean = values.reduce((sum, value) => sum + value, 0) / samples;
    const variance =
      values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
      (samples - 1);
    const expectedMean = trials * probability;
    const expectedVariance = trials * probability * (1 - probability);

    expect(Math.abs(mean - expectedMean)).toBeLessThan(0.2);
    expect(Math.abs(variance - expectedVariance)).toBeLessThan(0.5);
  });

  it("estimates sparse work from the minority outcome rather than total trials", () => {
    expect(expectedSparseBinomialDraws(1_000_000_000, 1e-8)).toBeCloseTo(11);
    expect(expectedSparseBinomialDraws(1_000_000_000, 1 - 1e-8)).toBeCloseTo(
      11,
      5,
    );
  });
});
