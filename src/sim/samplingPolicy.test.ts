import { describe, expect, it } from "vitest";

import { SimulationRng } from "./rng";
import {
  BOUNDED_HYBRID_BINOMIAL_V1,
  SAMPLING_EXECUTION_POLICY_SCHEMA_VERSION,
  SamplingPolicyRefusal,
  planSamplingExecution,
  requireExactSampling,
  sampleBoundedHybridBinomialV1,
  samplingExecutionPolicyIdentity,
  type SamplingExecutionPolicy,
} from "./samplingPolicy";

function policy(
  accelerated: SamplingExecutionPolicy["acceleratedBinomial"] =
    BOUNDED_HYBRID_BINOMIAL_V1,
): SamplingExecutionPolicy {
  return {
    schemaVersion: SAMPLING_EXECUTION_POLICY_SCHEMA_VERSION,
    id: "test-policy",
    exactTrialBudgets: {
      bernoulli: 100,
      categorical: 80,
    },
    acceleratedBinomial: accelerated,
  };
}

describe("stochastic sampling execution policy", () => {
  it("plans exact, accelerated, and refused work explicitly", () => {
    expect(planSamplingExecution(100, "bernoulli", policy()).status).toBe(
      "exact",
    );
    expect(planSamplingExecution(101, "bernoulli", policy()).status).toBe(
      "accelerated",
    );
    expect(
      planSamplingExecution(101, "bernoulli", policy("disabled")),
    ).toMatchObject({
      status: "refused",
      reason: "exact-budget-exceeded",
      exactTrialBudget: 100,
    });
  });

  it("makes policy changes replay-visible in canonical identity", () => {
    const base = policy();
    expect(
      samplingExecutionPolicyIdentity({
        ...base,
        exactTrialBudgets: { ...base.exactTrialBudgets, bernoulli: 101 },
      }),
    ).not.toBe(samplingExecutionPolicyIdentity(base));
    expect(
      samplingExecutionPolicyIdentity({
        ...base,
        acceleratedBinomial: "disabled",
      }),
    ).not.toBe(samplingExecutionPolicyIdentity(base));
  });

  it("fails exact execution closed with a numerical-policy diagnostic", () => {
    expect(() =>
      requireExactSampling(101, "bernoulli", policy("disabled")),
    ).toThrow(SamplingPolicyRefusal);

    try {
      requireExactSampling(101, "bernoulli", policy("disabled"));
      throw new Error("expected sampling refusal");
    } catch (error) {
      expect(error).toBeInstanceOf(SamplingPolicyRefusal);
      if (!(error instanceof SamplingPolicyRefusal)) return;
      expect(error.diagnostic).toMatchObject({
        workload: "bernoulli",
        trialCount: 101,
        exactTrialBudget: 100,
        reason: "exact-budget-exceeded",
      });
    }
  });

  it("preserves exact probability limits and hard count bounds", () => {
    expect(
      sampleBoundedHybridBinomialV1(9_000_000_000, 0, new SimulationRng(1)),
    ).toBe(0);
    expect(
      sampleBoundedHybridBinomialV1(9_000_000_000, 1, new SimulationRng(1)),
    ).toBe(9_000_000_000);

    for (let seed = 1; seed <= 100; seed += 1) {
      const draw = sampleBoundedHybridBinomialV1(
        1_000_000,
        0.35,
        new SimulationRng(seed),
      );
      expect(draw).toBeGreaterThanOrEqual(0);
      expect(draw).toBeLessThanOrEqual(1_000_000);
    }
  });

  it("tracks the exact binomial law over many moderate-count seeds", () => {
    const trials = 1_000;
    const probability = 0.3;
    const seeds = 2_000;
    let acceleratedSum = 0;
    let exactSum = 0;
    let acceleratedSquared = 0;
    let exactSquared = 0;

    for (let seed = 1; seed <= seeds; seed += 1) {
      const accelerated = sampleBoundedHybridBinomialV1(
        trials,
        probability,
        new SimulationRng(seed),
      );
      const exact = exactBinomial(
        trials,
        probability,
        new SimulationRng(seed),
      );
      acceleratedSum += accelerated;
      exactSum += exact;
      acceleratedSquared += accelerated * accelerated;
      exactSquared += exact * exact;
    }

    const acceleratedMean = acceleratedSum / seeds;
    const exactMean = exactSum / seeds;
    const acceleratedVariance =
      acceleratedSquared / seeds - acceleratedMean * acceleratedMean;
    const exactVariance = exactSquared / seeds - exactMean * exactMean;

    expect(Math.abs(acceleratedMean - exactMean)).toBeLessThan(2);
    expect(
      Math.abs(acceleratedVariance - exactVariance) / exactVariance,
    ).toBeLessThan(0.2);
  });

  it("keeps rare-event tails on an exact sublinear path", () => {
    const trials = 100_000;
    const probability = 0.0001;
    const expected = trials * probability;
    const sigma = Math.sqrt(trials * probability * (1 - probability));

    for (let seed = 1; seed <= 64; seed += 1) {
      const draw = sampleBoundedHybridBinomialV1(
        trials,
        probability,
        new SimulationRng(seed),
      );
      expect(draw).toBeGreaterThanOrEqual(0);
      expect(draw).toBeLessThanOrEqual(trials);
      expect(Math.abs(draw - expected)).toBeLessThan(6 * sigma);
    }
  });
});

function exactBinomial(
  trials: number,
  probability: number,
  rng: SimulationRng,
): number {
  let count = 0;
  for (let index = 0; index < trials; index += 1) {
    if (rng.nextFloat() < probability) count += 1;
  }
  return count;
}
