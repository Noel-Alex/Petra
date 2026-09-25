import { describe, expect, it } from "vitest";

import {
  buildFirstAggregateBaselineBenchmark,
  FIRST_AGGREGATE_BASELINE_BENCHMARK_SCHEMA_VERSION,
  FIRST_AGGREGATE_BASELINE_POLICY_VERSION,
  FIRST_AGGREGATE_BENCHMARK_FEATURE_IDS,
  FIRST_AGGREGATE_BENCHMARK_TARGET_IDS,
  FIRST_AGGREGATE_RIDGE_LAMBDA,
} from "./firstAggregateBenchmark";
import {
  createNodeMechanisticDatasetPackage,
  resolveNodeMechanisticDatasetTaskDefinition,
  FIRST_AGGREGATE_DATASET_VERSION,
  type FirstAggregateDatasetInput,
  type FirstAggregateDatasetTarget,
} from "./firstAggregateDatasetPackage";
import {
  buildMechanisticDatasetArtifact,
  type MechanisticTrajectoryResult,
} from "./generator";
import type { MechanisticSample } from "./dataset";
import {
  TRAJECTORY_BALANCED_TRANSITION_SERIES_EVALUATION_POLICY_VERSION,
} from "./transitionSeriesEvaluation";

const DATASET_DIGEST = "fnv1a64-utf8-v1:0123456789abcdef";

function fixtureArtifact() {
  const datasetPackage = createNodeMechanisticDatasetPackage();
  const results: MechanisticTrajectoryResult<
    FirstAggregateDatasetInput,
    FirstAggregateDatasetTarget
  >[] = datasetPackage.plan.tasks.map((task, taskIndex) => {
    const definition = resolveNodeMechanisticDatasetTaskDefinition(
      task,
      datasetPackage.executorData,
    );
    const hoursPerTick = definition.config.hoursPerTick;
    const transitionCount =
      task.executionSchedule.totalTicks /
      task.executionSchedule.snapshotEveryTicks;
    const samples: MechanisticSample<
      FirstAggregateDatasetInput,
      FirstAggregateDatasetTarget
    >[] = [];

    for (let sourceSnapshotIndex = 0; sourceSnapshotIndex < transitionCount; sourceSnapshotIndex += 1) {
      const sourceTick =
        sourceSnapshotIndex * task.executionSchedule.snapshotEveryTicks;
      const targetTick =
        sourceTick + task.executionSchedule.snapshotEveryTicks;
      const sourceTimeHours = sourceTick * hoursPerTick;
      const targetTimeHours = targetTick * hoursPerTick;
      const groupSignal = taskIndex + 1;
      const totalBiomass = groupSignal + sourceTick * 0.01;
      const totalResource = 20 + groupSignal - sourceTick * 0.005;
      const occupiedCells = 2 + (sourceSnapshotIndex % 5);
      const final = sourceSnapshotIndex === transitionCount - 1;

      samples.push({
        datasetVersion: task.datasetVersion,
        trajectory: structuredClone(task.trajectory),
        snapshotIndex: sourceSnapshotIndex,
        simulationTimeHours: sourceTimeHours,
        normalizationProfileId: task.normalizationProfileId,
        datasetSchema: structuredClone(task.datasetSchema),
        input: {
          sourceSnapshotIndex,
          sourceTick,
          sourceTimeHours,
          totalBiomass,
          totalResource,
          occupiedCells,
        },
        target: {
          targetSnapshotIndex: sourceSnapshotIndex + 1,
          targetTick,
          targetTimeHours,
          forecastHorizonTicks:
            task.executionSchedule.snapshotEveryTicks,
          forecastHorizonHours:
            task.executionSchedule.snapshotEveryTicks * hoursPerTick,
          totalBiomass: totalBiomass + 0.64,
          totalResource: Math.max(0, totalResource - 0.32),
          occupiedCells: occupiedCells + 1,
        },
        ...(final
          ? {
              terminationReason:
                "first-aggregate-heldout-horizon-complete",
            }
          : {}),
      });
    }

    return { taskId: task.taskId, samples };
  });

  return buildMechanisticDatasetArtifact(datasetPackage.plan, results);
}

describe("first aggregate baseline benchmark", () => {
  it("trains only on train groups and evaluates validation/test through the transition-series policy", () => {
    const artifact = fixtureArtifact();

    const result = buildFirstAggregateBaselineBenchmark({
      datasetDigest: DATASET_DIGEST,
      summary: artifact.summary,
      rows: artifact.rows,
    });

    expect(result.schemaVersion).toBe(
      FIRST_AGGREGATE_BASELINE_BENCHMARK_SCHEMA_VERSION,
    );
    expect(result.policyVersion).toBe(
      FIRST_AGGREGATE_BASELINE_POLICY_VERSION,
    );
    expect(result.evaluationPolicyVersion).toBe(
      TRAJECTORY_BALANCED_TRANSITION_SERIES_EVALUATION_POLICY_VERSION,
    );
    expect(result.dataset.datasetVersion).toBe(
      FIRST_AGGREGATE_DATASET_VERSION,
    );
    expect(result.dataset.datasetDigest).toBe(DATASET_DIGEST);
    expect(result.training).toEqual({
      rowCount: artifact.summary.splitSampleCounts.train,
      trajectoryCount: artifact.summary.splitTrajectoryCounts.train,
      groupCount: artifact.summary.splitGroupCounts.train,
      featureIds: FIRST_AGGREGATE_BENCHMARK_FEATURE_IDS,
      targetIds: FIRST_AGGREGATE_BENCHMARK_TARGET_IDS,
      ridgeLambda: FIRST_AGGREGATE_RIDGE_LAMBDA,
    });
    expect(result.models.constant.schemaVersion).toBe(
      "petra-constant-baseline-v1",
    );
    expect(result.models.ridge.schemaVersion).toBe(
      "petra-ridge-baseline-v1",
    );
    expect(result.models.ridge.lambda).toBe(FIRST_AGGREGATE_RIDGE_LAMBDA);

    expect(result.validation.coverage.rowCount).toBe(
      artifact.summary.splitSampleCounts.validation,
    );
    expect(result.validation.coverage.trajectoryCount).toBe(
      artifact.summary.splitTrajectoryCounts.validation,
    );
    expect(result.validation.coverage.groupCount).toBe(
      artifact.summary.splitGroupCounts.validation,
    );
    expect(result.test.coverage.rowCount).toBe(
      artifact.summary.splitSampleCounts.test,
    );
    expect(result.test.coverage.trajectoryCount).toBe(
      artifact.summary.splitTrajectoryCounts.test,
    );
    expect(result.test.coverage.groupCount).toBe(
      artifact.summary.splitGroupCounts.test,
    );
    expect(
      result.validation.coverage.byHorizon[
        "authoritative-next-64-ticks"
      ],
    ).toMatchObject({
      forecastHorizonTicks: 64,
      rowCount: artifact.summary.splitSampleCounts.validation,
    });
  });

  it("is deterministic when finalized rows arrive in a different order", () => {
    const artifact = fixtureArtifact();
    const forward = buildFirstAggregateBaselineBenchmark({
      datasetDigest: DATASET_DIGEST,
      summary: artifact.summary,
      rows: artifact.rows,
    });
    const reversed = buildFirstAggregateBaselineBenchmark({
      datasetDigest: DATASET_DIGEST,
      summary: artifact.summary,
      rows: [...artifact.rows].reverse(),
    });

    expect(reversed).toEqual(forward);
  });

  it("fails closed on stale dataset identity and malformed source/target timing", () => {
    const artifact = fixtureArtifact();

    expect(() =>
      buildFirstAggregateBaselineBenchmark({
        datasetDigest: DATASET_DIGEST,
        summary: {
          ...artifact.summary,
          datasetVersion: "flagship-first-aggregate-mechanistic-v1",
        },
        rows: artifact.rows,
      }),
    ).toThrow(/datasetVersion does not match package authority/);

    const first = artifact.rows[0]!;
    expect(() =>
      buildFirstAggregateBaselineBenchmark({
        datasetDigest: DATASET_DIGEST,
        summary: artifact.summary,
        rows: [
          {
            ...first,
            sample: {
              ...first.sample,
              input: {
                ...first.sample.input,
                sourceTimeHours:
                  first.sample.input.sourceTimeHours + 0.001,
              },
            },
          },
          ...artifact.rows.slice(1),
        ],
      }),
    ).toThrow(/position does not match authoritative schedule/);
  });

  it("fails closed on train/held-out identity drift and non-finite aggregates", () => {
    const artifact = fixtureArtifact();
    const first = artifact.rows[0]!;

    expect(() =>
      buildFirstAggregateBaselineBenchmark({
        datasetDigest: DATASET_DIGEST,
        summary: artifact.summary,
        rows: [
          {
            ...first,
            splitGroupKey: "foreign-group",
          },
          ...artifact.rows.slice(1),
        ],
      }),
    ).toThrow(/wrong splitGroupKey/);

    expect(() =>
      buildFirstAggregateBaselineBenchmark({
        datasetDigest: DATASET_DIGEST,
        summary: artifact.summary,
        rows: [
          {
            ...first,
            sample: {
              ...first.sample,
              target: {
                ...first.sample.target,
                totalBiomass: Number.NaN,
              },
            },
          },
          ...artifact.rows.slice(1),
        ],
      }),
    ).toThrow(/must be finite/);
  });

  it("refuses unverified dataset digest syntax", () => {
    const artifact = fixtureArtifact();
    expect(() =>
      buildFirstAggregateBaselineBenchmark({
        datasetDigest: "sha256:not-the-finalization-digest",
        summary: artifact.summary,
        rows: artifact.rows,
      }),
    ).toThrow(/finalized Petra dataset digest/);
  });
});
