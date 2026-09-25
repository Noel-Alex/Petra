import { describe, expect, it } from "vitest";

import {
  GROUP_HORIZON_BALANCED_EVALUATION_POLICY_VERSION,
  assessSurrogatePromotion,
  buildSurrogateBenchmarkEvidence,
  computeRegressionMetrics,
  computeStratifiedRegressionBenchmark,
  surrogateCompatibilityKey,
  type RegressionEvaluationRow,
  type SurrogateBenchmarkEvidence,
  type SurrogateCompatibilityIdentity,
  type SurrogatePromotionRequirements,
} from "./benchmark";
import {
  MECHANISTIC_DATASET_ARTIFACT_SCHEMA_VERSION,
  type MechanisticDatasetSummary,
} from "./generator";
import {
  createMechanisticExecutionSchedule,
  mechanisticExecutionScheduleIdentity,
} from "./executionSchedule";

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

const datasetSchema = {
  schemaVersion: "mechanistic-dataset-schema-v1" as const,
  inputSchemaVersion: compatibility.inputSchemaVersion,
  targetSchemaVersion: compatibility.targetSchemaVersion,
};

const executionSchedule = createMechanisticExecutionSchedule({
  totalTicks: 8,
  snapshotEveryTicks: 1,
});

const datasetSummary: MechanisticDatasetSummary = {
  schemaVersion: MECHANISTIC_DATASET_ARTIFACT_SCHEMA_VERSION,
  planVersion: "aggregate-sweep-v1",
  datasetVersion: "mechanistic-v1",
  engineVersion: "engine-a",
  scenarioId: "selection-not-mutation",
  scenarioVersion: "1",
  normalizationProfileId: compatibility.normalizationProfileId,
  datasetSchema,
  executionSchedule,
  executionScheduleIdentity: mechanisticExecutionScheduleIdentity(executionSchedule),
  splitPolicyVersion: "trajectory-group-v1",
  splitCoveragePolicyVersion: "held-out-group-coverage-v1",
  groupCount: 2,
  trajectoryCount: 2,
  sampleCount: 4,
  splitGroupCounts: { train: 0, validation: 0, test: 2 },
  splitTrajectoryCounts: { train: 0, validation: 0, test: 2 },
  splitSampleCounts: { train: 0, validation: 0, test: 4 },
};

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

const goodBenchmark = computeStratifiedRegressionBenchmark({
  targetIds: requirements.targetIds,
  requiredGroupKeys: requirements.requiredGroupKeys,
  requiredHorizons: requirements.requiredHorizons,
  rows: goodRows,
});

const goodEvidence: SurrogateBenchmarkEvidence =
  buildSurrogateBenchmarkEvidence({
    modelId: "aggregate-surrogate",
    modelVersion: "1",
    baselineId: "mean-by-scenario-v1",
    dataset: datasetSummary,
    compatibility,
    evaluationPolicyVersion: requirements.evaluationPolicyVersion,
    heldOutSplit: requirements.heldOutSplit,
    benchmark: goodBenchmark,
  });

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

  it("retains group/trajectory/horizon coverage and balanced aggregate metrics", () => {
    expect(goodBenchmark.coverage).toMatchObject({
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
    expect(goodBenchmark.candidate.overall.population).toEqual({
      mae: 1,
      rmse: 1,
      count: 4,
    });
    expect(goodBenchmark.baseline.overall.population).toEqual({
      mae: 2,
      rmse: 2,
      count: 4,
    });
  });

  it("rejects duplicate trajectory-horizon rows and missing requested horizons", () => {
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

  it("exposes a group failure hidden by imbalanced flat-row metrics", () => {
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

    const flatCandidate = computeRegressionMetrics({
      targetIds: ["y"],
      actual: imbalancedRows.map((item) => item.actual),
      predicted: imbalancedRows.map((item) => item.candidate),
    });
    const flatBaseline = computeRegressionMetrics({
      targetIds: ["y"],
      actual: imbalancedRows.map((item) => item.actual),
      predicted: imbalancedRows.map((item) => item.baseline),
    });
    expect(flatCandidate.y!.mae).toBeLessThan(flatBaseline.y!.mae);

    const benchmark = computeStratifiedRegressionBenchmark({
      targetIds: ["y"],
      requiredGroupKeys: ["easy-group", "hard-group"],
      requiredHorizons: [{ id: "four-hours", hours: 4 }],
      rows: imbalancedRows,
    });
    expect(benchmark.candidate.overall.y!.mae).toBeGreaterThan(
      benchmark.baseline.overall.y!.mae,
    );

    const assessment = assessSurrogatePromotion({
      evidence: {
        schemaVersion: "surrogate-benchmark-evidence-v5",
        modelId: "imbalanced-model",
        modelVersion: "1",
        baselineId: "simple-baseline",
        datasetVersion: "mechanistic-v1",
        engineVersion: "engine-a",
        datasetScenarioId: "selection-not-mutation",
        datasetScenarioVersion: "1",
        datasetNormalizationProfileId: compatibility.normalizationProfileId,
        datasetSchema,
        compatibility,
        splitPolicyVersion: "trajectory-group-v1",
        splitCoveragePolicyVersion: "held-out-group-coverage-v1",
        evaluationPolicyVersion:
          GROUP_HORIZON_BALANCED_EVALUATION_POLICY_VERSION,
        heldOutSplit: "test",
        ...benchmark,
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
      expectedCompatibility: compatibility,
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

  it("refuses long-horizon degradation even when balanced overall metrics still beat baseline", () => {
    const horizonRows = goodRows.map((item) => ({
      ...item,
      candidate: {
        ...item.candidate,
        population:
          item.actual.population + (item.horizonId === "short" ? 0 : 2.5),
      },
      baseline: {
        ...item.baseline,
        population:
          item.actual.population + (item.horizonId === "short" ? 3 : 2),
      },
    }));
    const benchmark = computeStratifiedRegressionBenchmark({
      targetIds: requirements.targetIds,
      requiredGroupKeys: requirements.requiredGroupKeys,
      requiredHorizons: requirements.requiredHorizons,
      rows: horizonRows,
    });

    expect(benchmark.candidate.overall.population!.mae).toBeLessThan(
      benchmark.baseline.overall.population!.mae,
    );
    for (const groupKey of requirements.requiredGroupKeys) {
      expect(benchmark.candidate.byGroup[groupKey]!.population!.mae).toBeLessThan(
        benchmark.baseline.byGroup[groupKey]!.population!.mae,
      );
    }

    const assessment = assess({
      ...goodEvidence,
      ...benchmark,
    });
    expect(assessment.eligible).toBe(false);
    expect(
      assessment.issues.some(
        (issue) =>
          issue.kind === "baseline-not-beaten" &&
          issue.targetId === "population" &&
          issue.stratum === "horizon:long",
      ),
    ).toBe(true);
  });

  it("constructs evidence from dataset provenance and refuses schema relabeling", () => {
    expect(goodEvidence.datasetSchema).toEqual(datasetSchema);
    expect(goodEvidence.datasetVersion).toBe(datasetSummary.datasetVersion);
    expect(goodEvidence.splitPolicyVersion).toBe(
      datasetSummary.splitPolicyVersion,
    );

    expect(() =>
      buildSurrogateBenchmarkEvidence({
        modelId: "aggregate-surrogate",
        modelVersion: "1",
        baselineId: "mean-by-scenario-v1",
        dataset: datasetSummary,
        compatibility: {
          ...compatibility,
          inputSchemaVersion: "aggregate-input-v2",
        },
        evaluationPolicyVersion: requirements.evaluationPolicyVersion,
        heldOutSplit: requirements.heldOutSplit,
        benchmark: goodBenchmark,
      }),
    ).toThrow(/dataset input\/target schema/);
  });

  it("refuses stale mechanistic dataset artifact schemas", () => {
    expect(() =>
      buildSurrogateBenchmarkEvidence({
        modelId: "aggregate-surrogate",
        modelVersion: "1",
        baselineId: "mean-by-scenario-v1",
        dataset: {
          ...datasetSummary,
          schemaVersion: "petra-ml-dataset-artifact-v4",
        } as unknown as MechanisticDatasetSummary,
        compatibility,
        evaluationPolicyVersion: requirements.evaluationPolicyVersion,
        heldOutSplit: requirements.heldOutSplit,
        benchmark: goodBenchmark,
      }),
    ).toThrow(/unsupported mechanistic dataset artifact schema version/);
  });

  it("rejects benchmark evidence whose dataset schema disagrees with model compatibility", () => {
    const assessment = assess({
      ...goodEvidence,
      datasetSchema: {
        ...goodEvidence.datasetSchema,
        targetSchemaVersion: "aggregate-target-v2",
      },
    });

    expect(assessment.eligible).toBe(false);
    expect(assessment.issues.map((issue) => issue.kind)).toContain(
      "dataset-schema-mismatch",
    );
  });

  it("accepts only matching compatibility plus evidence that beats baseline in every required stratum", () => {
    expect(assess()).toEqual({ eligible: true, issues: [] });
  });

  it("rejects stale benchmark evidence schemas", () => {
    const stale = {
      ...goodEvidence,
      schemaVersion: "surrogate-benchmark-evidence-v3",
    } as unknown as SurrogateBenchmarkEvidence;
    const assessment = assess(stale);

    expect(assessment.eligible).toBe(false);
    expect(assessment.issues.map((issue) => issue.kind)).toContain(
      "evidence-schema-mismatch",
    );
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

  it("rejects stale engine, evaluation policy, and non-promotable evidence", () => {
    const assessment = assess({
      ...goodEvidence,
      engineVersion: "old-engine",
      evaluationPolicyVersion: "flat-row-v0",
      candidate: goodEvidence.baseline,
    });

    expect(assessment.eligible).toBe(false);
    expect(assessment.issues.map((issue) => issue.kind)).toContain(
      "engine-version-mismatch",
    );
    expect(assessment.issues.map((issue) => issue.kind)).toContain(
      "evaluation-policy-mismatch",
    );
    expect(assessment.issues.map((issue) => issue.kind)).toContain(
      "baseline-not-beaten",
    );
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

  it("rejects missing strata and metrics inconsistent with the balanced policy", () => {
    const missingStratum = assess({
      ...goodEvidence,
      candidate: {
        ...goodEvidence.candidate,
        byGroupHorizon: {
          ...goodEvidence.candidate.byGroupHorizon,
          "group-b": {},
        },
      },
    });
    expect(missingStratum.eligible).toBe(false);
    expect(missingStratum.issues.map((issue) => issue.kind)).toContain(
      "stratum-coverage-mismatch",
    );

    const inconsistent = assess({
      ...goodEvidence,
      candidate: {
        ...goodEvidence.candidate,
        overall: {
          ...goodEvidence.candidate.overall,
          population: {
            ...goodEvidence.candidate.overall.population!,
            mae: 0,
          },
        },
      },
    });
    expect(inconsistent.eligible).toBe(false);
    expect(inconsistent.issues.map((issue) => issue.kind)).toContain(
      "stratum-metrics-inconsistent",
    );
  });

  it("rejects target coverage and paired evaluation-count mismatches", () => {
    const assessment = assess({
      ...goodEvidence,
      candidate: {
        ...goodEvidence.candidate,
        overall: {
          population: {
            ...goodEvidence.candidate.overall.population!,
            count: 999,
          },
        },
      },
    });

    expect(assessment.eligible).toBe(false);
    expect(assessment.issues.map((issue) => issue.kind)).toContain(
      "target-coverage-mismatch",
    );
  });
});
