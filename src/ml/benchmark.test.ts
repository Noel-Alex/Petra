import { describe, expect, it } from "vitest";

import {
  assessSurrogatePromotion,
  computeRegressionMetrics,
  surrogateCompatibilityKey,
  type SurrogateBenchmarkEvidence,
  type SurrogateCompatibilityIdentity,
  type SurrogatePromotionRequirements,
} from "./benchmark";

const compatibility: SurrogateCompatibilityIdentity = {
  schemaVersion: "surrogate-compatibility-v1",
  supportedScenarios: [
    { scenarioId: "selection-not-mutation", scenarioVersion: "1" },
    { scenarioId: "fitness-tradeoff", scenarioVersion: "2" },
  ],
  normalizationProfileId: "aggregate-normalization-v1",
  inputSchemaVersion: "aggregate-input-v1",
  targetSchemaVersion: "aggregate-target-v1",
};

const requirements: SurrogatePromotionRequirements = {
  splitPolicyVersion: "trajectory-group-v1",
  splitCoveragePolicyVersion: "held-out-group-coverage-v1",
  heldOutSplit: "test",
  targetIds: ["population", "resistantFraction"],
};

const goodEvidence: SurrogateBenchmarkEvidence = {
  schemaVersion: "surrogate-benchmark-evidence-v3",
  modelId: "aggregate-surrogate",
  modelVersion: "1",
  baselineId: "mean-by-scenario-v1",
  datasetVersion: "mechanistic-v1",
  engineVersion: "engine-a",
  compatibility,
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

function assess(evidence: SurrogateBenchmarkEvidence = goodEvidence) {
  return assessSurrogatePromotion({
    evidence,
    requirements,
    expectedModelId: "aggregate-surrogate",
    expectedModelVersion: "1",
    expectedDatasetVersion: "mechanistic-v1",
    expectedEngineVersion: "engine-a",
    expectedCompatibility: compatibility,
  });
}

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

  it("canonicalizes explicit multi-scenario compatibility independent of ordering", () => {
    expect(
      surrogateCompatibilityKey({
        ...compatibility,
        supportedScenarios: [...compatibility.supportedScenarios].reverse(),
      }),
    ).toBe(surrogateCompatibilityKey(compatibility));
  });

  it("rejects malformed compatibility identities", () => {
    expect(() =>
      surrogateCompatibilityKey({
        ...compatibility,
        supportedScenarios: [],
      }),
    ).toThrow(/at least one supported scenario/);

    expect(() =>
      surrogateCompatibilityKey({
        ...compatibility,
        supportedScenarios: [
          compatibility.supportedScenarios[0]!,
          compatibility.supportedScenarios[0]!,
        ],
      }),
    ).toThrow(/duplicate scenario/);
  });

  it("accepts only matching evidence that strictly beats the baseline on every target", () => {
    expect(assess()).toEqual({ eligible: true, issues: [] });
  });

  it("fails closed on malformed benchmark compatibility evidence", () => {
    const malformed = {
      ...compatibility,
      supportedScenarios: [],
    } as SurrogateCompatibilityIdentity;
    const assessment = assess({
      ...goodEvidence,
      compatibility: malformed,
    });

    expect(assessment.eligible).toBe(false);
    expect(assessment.issues.map((issue) => issue.kind)).toContain(
      "compatibility-mismatch",
    );
  });

  it("rejects evidence promoted under another compatibility contract", () => {
    const assessment = assess({
      ...goodEvidence,
      compatibility: {
        ...compatibility,
        normalizationProfileId: "aggregate-normalization-v0",
      },
    });

    expect(assessment.eligible).toBe(false);
    expect(assessment.issues.map((issue) => issue.kind)).toContain(
      "compatibility-mismatch",
    );
  });

  it("rejects ties/regressions and stale evidence", () => {
    const assessment = assess({
      ...goodEvidence,
      engineVersion: "old-engine",
      candidate: {
        ...goodEvidence.candidate,
        population: { mae: 2, rmse: 2.4, count: 2 },
      },
    });

    expect(assessment.eligible).toBe(false);
    expect(assessment.issues.map((issue) => issue.kind)).toEqual([
      "engine-version-mismatch",
      "baseline-not-beaten",
    ]);
  });

  it("rejects benchmark evidence from a different split coverage policy", () => {
    const assessment = assess({
      ...goodEvidence,
      splitCoveragePolicyVersion: "held-out-group-coverage-v0",
    });

    expect(assessment.eligible).toBe(false);
    expect(assessment.issues.map((issue) => issue.kind)).toContain(
      "split-coverage-policy-mismatch",
    );
  });

  it("rejects target coverage and evaluation-count mismatches", () => {
    const assessment = assess({
      ...goodEvidence,
      candidate: {
        population: { mae: 1, rmse: 1.2, count: 3 },
      },
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
