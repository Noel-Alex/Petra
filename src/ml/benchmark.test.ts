import { describe, expect, it } from "vitest";

import {
  GROUP_HORIZON_BALANCED_EVALUATION_POLICY_VERSION,
  assessSurrogatePromotion,
  computeRegressionMetrics,
  computeStratifiedRegressionBenchmark,
  type RegressionEvaluationRow,
  type SurrogateBenchmarkEvidence,
  type SurrogatePromotionRequirements,
} from "./benchmark";

const horizons = [
  { id: "short", hours: 1 },
  { id: "long", hours: 8 },
] as const;

const requirements: SurrogatePromotionRequirements = {
  splitPolicyVersion: "trajectory-group-v1",
  splitCoveragePolicyVersion: "held-out-group-coverage-v1",
  evaluationPolicyVersion: GROUP_HORIZON_BALANCED_EVALUATION_POLICY_VERSION,
  heldOutSplit: "test",
  targetIds: ["population", "resistantFraction"],
  requiredGroupKeys: ["group-a", "group-b"],
  requiredHorizons: horizons,
};

function row(args: {
  groupKey: string;
  trajectoryKey: string;
  horizonId: "short" | "long";
  population: number;
  resistantFraction: number;
  candidatePopulationError?: number;
  candidateFractionError?: number;
  baselinePopulationError?: number;
  baselineFractionError?: number;
}): RegressionEvaluationRow {
  const horizon = horizons.find((item) => item.id === args.horizonId);
  if (horizon === undefined) throw new Error("unknown test horizon");

  return {
    groupKey: args.groupKey,
    trajectoryKey: args.trajectoryKey,
    horizonId: args.horizonId,
    forecastHorizonHours: horizon.hours,
    actual: {
      population: args.population,
      resistantFraction: args.resistantFraction,
    },
    candidate: {
      population: args.population + (args.candidatePopulationError ?? 1),
      resistantFraction:
        args.resistantFraction + (args.candidateFractionError ?? 0.01),
    },
    baseline: {
      population: args.population + (args.baselinePopulationError ?? 2),
      resistantFraction:
        args.resistantFraction + (args.baselineFractionError ?? 0.02),
    },
  };
}

const goodRows: readonly RegressionEvaluationRow[] = [
  row({
    groupKey: "group-a",
    trajectoryKey: "trajectory-a",
    horizonId: "short",
    population: 100,
    resistantFraction: 0.1,
  }),
  row({
    groupKey: "group-a",
    trajectoryKey: "trajectory-a",
    horizonId: "long",
    population: 80,
    resistantFraction: 0.15,
  }),
  row({
    groupKey: "group-b",
    trajectoryKey: "trajectory-b",
    horizonId: "short",
    population: 120,
    resistantFraction: 0.08,
  }),
  row({
    groupKey: "group-b",
    trajectoryKey: "trajectory-b",
    horizonId: "long",
    population: 90,
    resistantFraction: 0.2,
  }),
];

function goodEvidence(): SurrogateBenchmarkEvidence {
  const benchmark = computeStratifiedRegressionBenchmark({
    targetIds: requirements.targetIds,
    requiredGroupKeys: requirements.requiredGroupKeys,
    requiredHorizons: requirements.requiredHorizons,
    rows: goodRows,
  });

  return {
    schemaVersion: "surrogate-benchmark-evidence-v3",
    modelId: "aggregate-surrogate",
    modelVersion: "1",
    baselineId: "mean-by-scenario-v1",
    datasetVersion: "mechanistic-v1",
    engineVersion: "engine-a",
    splitPolicyVersion: requirements.splitPolicyVersion,
    splitCoveragePolicyVersion: requirements.splitCoveragePolicyVersion,
    evaluationPolicyVersion: requirements.evaluationPolicyVersion,
    heldOutSplit: requirements.heldOutSplit,
    ...benchmark,
  };
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

  it("retains trajectory/group/horizon coverage and equal-weights held-out groups", () => {
    const benchmark = computeStratifiedRegressionBenchmark({
      targetIds: requirements.targetIds,
      requiredGroupKeys: requirements.requiredGroupKeys,
      requiredHorizons: requirements.requiredHorizons,
      rows: goodRows,
    });

    expect(benchmark.coverage).toMatchObject({
      rowCount: 4,
      trajectoryCount: 2,
      groupCount: 2,
      byGroup: {
        "group-a": { rowCount: 2, trajectoryCount: 1 },
        "group-b": { rowCount: 2, trajectoryCount: 1 },
      },
      byHorizon: {
        short: {
          forecastHorizonHours: 1,
          rowCount: 2,
          trajectoryCount: 2,
          groupCount: 2,
        },
        long: {
          forecastHorizonHours: 8,
          rowCount: 2,
          trajectoryCount: 2,
          groupCount: 2,
        },
      },
    });
    expect(benchmark.candidate.overall.population).toEqual({
      mae: 1,
      rmse: 1,
      count: 4,
    });
    expect(benchmark.baseline.overall.population).toEqual({
      mae: 2,
      rmse: 2,
      count: 4,
    });
  });

  it("rejects duplicate trajectory-horizon rows and trajectories missing a requested horizon", () => {
    expect(() =>
      computeStratifiedRegressionBenchmark({
        targetIds: requirements.targetIds,
        requiredGroupKeys: requirements.requiredGroupKeys,
        requiredHorizons: requirements.requiredHorizons,
        rows: [...goodRows, goodRows[0]!],
      }),
    ).toThrow(/duplicate evaluation record/);

    expect(() =>
      computeStratifiedRegressionBenchmark({
        targetIds: requirements.targetIds,
        requiredGroupKeys: requirements.requiredGroupKeys,
        requiredHorizons: requirements.requiredHorizons,
        rows: goodRows.filter(
          (item) =>
            !(
              item.trajectoryKey === "trajectory-b" &&
              item.horizonId === "long"
            ),
        ),
      }),
    ).toThrow(/missing required horizons/);
  });

  it("exposes a failure hidden by imbalanced flat-row metrics", () => {
    const imbalancedRows: RegressionEvaluationRow[] = [];
    for (let index = 0; index < 20; index += 1) {
      imbalancedRows.push({
        groupKey: "easy-group",
        trajectoryKey: `easy-${index}`,
        horizonId: "four-hours",
        forecastHorizonHours: 4,
        actual: { y: 0 },
        candidate: { y: 0 },
        baseline: { y: 1 },
      });
    }
    imbalancedRows.push({
      groupKey: "hard-group",
      trajectoryKey: "hard-0",
      horizonId: "four-hours",
      forecastHorizonHours: 4,
      actual: { y: 0 },
      candidate: { y: 10 },
      baseline: { y: 2 },
    });

    const flat = computeRegressionMetrics({
      targetIds: ["y"],
      actual: imbalancedRows.map((item) => item.actual),
      predicted: imbalancedRows.map((item) => item.candidate),
    });
    const flatBaseline = computeRegressionMetrics({
      targetIds: ["y"],
      actual: imbalancedRows.map((item) => item.actual),
      predicted: imbalancedRows.map((item) => item.baseline),
    });
    expect(flat.y!.mae).toBeLessThan(flatBaseline.y!.mae);

    const stratified = computeStratifiedRegressionBenchmark({
      targetIds: ["y"],
      requiredGroupKeys: ["easy-group", "hard-group"],
      requiredHorizons: [{ id: "four-hours", hours: 4 }],
      rows: imbalancedRows,
    });
    expect(stratified.candidate.overall.y!.mae).toBeGreaterThan(
      stratified.baseline.overall.y!.mae,
    );

    const assessment = assessSurrogatePromotion({
      evidence: {
        schemaVersion: "surrogate-benchmark-evidence-v3",
        modelId: "imbalanced-model",
        modelVersion: "1",
        baselineId: "simple-baseline",
        datasetVersion: "mechanistic-v1",
        engineVersion: "engine-a",
        splitPolicyVersion: "trajectory-group-v1",
        splitCoveragePolicyVersion: "held-out-group-coverage-v1",
        evaluationPolicyVersion:
          GROUP_HORIZON_BALANCED_EVALUATION_POLICY_VERSION,
        heldOutSplit: "test",
        ...stratified,
      },
      requirements: {
        splitPolicyVersion: "trajectory-group-v1",
        splitCoveragePolicyVersion: "held-out-group-coverage-v1",
        evaluationPolicyVersion:
          GROUP_HORIZON_BALANCED_EVALUATION_POLICY_VERSION,
        heldOutSplit: "test",
        targetIds: ["y"],
        requiredGroupKeys: ["easy-group", "hard-group"],
        requiredHorizons: [{ id: "four-hours", hours: 4 }],
      },
      expectedModelId: "imbalanced-model",
      expectedModelVersion: "1",
      expectedDatasetVersion: "mechanistic-v1",
      expectedEngineVersion: "engine-a",
    });

    expect(assessment.eligible).toBe(false);
    expect(
      assessment.issues.some(
        (issue) =>
          issue.kind === "baseline-not-beaten" &&
          issue.stratum === "group:hard-group",
      ),
    ).toBe(true);
  });

  it("accepts only matching evidence that strictly beats the baseline in every required stratum", () => {
    expect(
      assessSurrogatePromotion({
        evidence: goodEvidence(),
        requirements,
        expectedModelId: "aggregate-surrogate",
        expectedModelVersion: "1",
        expectedDatasetVersion: "mechanistic-v1",
        expectedEngineVersion: "engine-a",
      }),
    ).toEqual({ eligible: true, issues: [] });
  });

  it("rejects stale evaluation policy and missing required stratum evidence", () => {
    const evidence = goodEvidence();
    const assessment = assessSurrogatePromotion({
      evidence: {
        ...evidence,
        evaluationPolicyVersion: "flat-row-v0",
        candidate: {
          ...evidence.candidate,
          byGroupHorizon: {
            ...evidence.candidate.byGroupHorizon,
            "group-b": {},
          },
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
      "evaluation-policy-mismatch",
    );
    expect(assessment.issues.map((issue) => issue.kind)).toContain(
      "stratum-coverage-mismatch",
    );
  });

  it("rejects target coverage and paired evaluation-count mismatches", () => {
    const evidence = goodEvidence();
    const assessment = assessSurrogatePromotion({
      evidence: {
        ...evidence,
        candidate: {
          ...evidence.candidate,
          overall: {
            population: {
              ...evidence.candidate.overall.population!,
              count: 999,
            },
          },
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
  });
});
