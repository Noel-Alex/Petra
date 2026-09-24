import { describe, expect, it } from "vitest";

import {
  assessSurrogatePromotion,
  computeRegressionMetrics,
  type SurrogateBenchmarkEvidence,
  type SurrogatePromotionRequirements,
} from "./benchmark";

const requirements: SurrogatePromotionRequirements = {
  splitPolicyVersion: "trajectory-group-v1",
  splitCoveragePolicyVersion: "held-out-group-coverage-v1",
  heldOutSplit: "test",
  targetIds: ["population", "resistantFraction"],
};

const goodEvidence: SurrogateBenchmarkEvidence = {
  schemaVersion: "surrogate-benchmark-evidence-v2",
  modelId: "aggregate-surrogate",
  modelVersion: "1",
  baselineId: "mean-by-scenario-v1",
  datasetVersion: "mechanistic-v1",
  engineVersion: "engine-a",
  splitPolicyVersion: "trajectory-group-v1",
  splitCoveragePolicyVersion: "held-out-group-coverage-v1",
  heldOutSplit: "test",
  candidate: {
    population: { mae: 1, rmse: 1.2, count: 2 },
    resistantFraction: { mae: 0.01, rmse: 0.012, count: 2 },
  },
  baseline: {
    population: { mae: 2, rmse: 2.4, count: 2 },
    resistantFraction: { mae: 0.02, rmse: 0.024, count: 2 },
  },
};

describe("surrogate held-out benchmarks", () => {
  it("computes deterministic multi-target MAE/RMSE", () => {
    expect(
      computeRegressionMetrics({
        targetIds: ["a", "b"],
        actual: [
          { a: 1, b: 2 },
          { a: 3, b: 4 },
        ],
        predicted: [
          { a: 2, b: 2 },
          { a: 1, b: 6 },
        ],
      }),
    ).toEqual({
      a: { mae: 1.5, rmse: Math.sqrt(2.5), count: 2 },
      b: { mae: 1, rmse: Math.sqrt(2), count: 2 },
    });
  });

  it("rejects incomplete, extra, non-finite, mismatched and overflowing rows", () => {
    expect(() =>
      computeRegressionMetrics({
        targetIds: ["a"],
        actual: [{ a: 1 }],
        predicted: [],
      }),
    ).toThrow(/row counts/);

    expect(() =>
      computeRegressionMetrics({
        targetIds: ["a"],
        actual: [{ a: 1, extra: 2 }],
        predicted: [{ a: 1 }],
      }),
    ).toThrow(/exactly match/);

    expect(() =>
      computeRegressionMetrics({
        targetIds: ["a"],
        actual: [{ a: Number.NaN }],
        predicted: [{ a: 1 }],
      }),
    ).toThrow(/finite/);

    expect(() =>
      computeRegressionMetrics({
        targetIds: ["a"],
        actual: [{ a: Number.MAX_VALUE }],
        predicted: [{ a: -Number.MAX_VALUE }],
      }),
    ).toThrow(/overflow/);
  });

  it("accepts only matching evidence that strictly beats the baseline on every target", () => {
    expect(
      assessSurrogatePromotion({
        evidence: goodEvidence,
        requirements,
        expectedModelId: "aggregate-surrogate",
        expectedModelVersion: "1",
        expectedDatasetVersion: "mechanistic-v1",
        expectedEngineVersion: "engine-a",
      }),
    ).toEqual({ eligible: true, issues: [] });
  });

  it("rejects ties/regressions and stale evidence", () => {
    const assessment = assessSurrogatePromotion({
      evidence: {
        ...goodEvidence,
        engineVersion: "old-engine",
        candidate: {
          ...goodEvidence.candidate,
          population: { mae: 2, rmse: 2.4, count: 2 },
        },
      },
      requirements,
      expectedModelId: "aggregate-surrogate",
      expectedModelVersion: "1",
      expectedDatasetVersion: "mechanistic-v1",
      expectedEngineVersion: "engine-a",
    });

    expect(assessment.eligible).toBe(false);
    expect(assessment.issues.map((issue) => issue.kind)).toEqual([
      "engine-version-mismatch",
      "baseline-not-beaten",
    ]);
  });

  it("rejects benchmark evidence from a different split coverage policy", () => {
    const assessment = assessSurrogatePromotion({
      evidence: {
        ...goodEvidence,
        splitCoveragePolicyVersion: "held-out-group-coverage-v0",
      },
      requirements,
      expectedModelId: "aggregate-surrogate",
      expectedModelVersion: "1",
      expectedDatasetVersion: "mechanistic-v1",
      expectedEngineVersion: "engine-a",
    });

    expect(assessment.eligible).toBe(false);
    expect(assessment.issues.map((issue) => issue.kind)).toContain(
      "split-coverage-policy-mismatch",
    );
  });

  it("rejects target coverage and evaluation-count mismatches", () => {
    const assessment = assessSurrogatePromotion({
      evidence: {
        ...goodEvidence,
        candidate: {
          population: { mae: 1, rmse: 1.2, count: 3 },
        },
      },
      requirements,
      expectedModelId: "aggregate-surrogate",
      expectedModelVersion: "1",
      expectedDatasetVersion: "mechanistic-v1",
      expectedEngineVersion: "engine-a",
    });

    expect(assessment.eligible).toBe(false);
    expect(assessment.issues.map((issue) => issue.kind)).toContain(
      "target-coverage-mismatch",
    );
    expect(assessment.issues.map((issue) => issue.kind)).toContain(
      "evaluation-count-mismatch",
    );
  });
});
