
import { describe, expect, it } from "vitest";

import {
  TRANSITION_SERIES_BALANCED_EVALUATION_POLICY_VERSION,
  computeTransitionSeriesRegressionBenchmark,
  type TransitionSeriesEvaluationDatasetIdentity,
  type TransitionSeriesEvaluationHorizon,
  type TransitionSeriesRegressionEvaluationRow,
} from "./benchmark";

const datasetIdentity: TransitionSeriesEvaluationDatasetIdentity = {
  datasetVersion: "mechanistic-transition-v2",
  normalizationProfileId: "identity-none-profile-v1",
  datasetSchema: {
    schemaVersion: "mechanistic-dataset-schema-v1",
    inputSchemaVersion: "aggregate-transition-source-v2",
    targetSchemaVersion: "aggregate-future-target-v2",
  },
  heldOutSplit: "validation",
};

const horizon: TransitionSeriesEvaluationHorizon = {
  id: "64-tick",
  ticks: 64,
  hours: 0.64,
};

function trajectoryRows(args: {
  groupKey: string;
  trajectoryKey: string;
  sourceCount: number;
  candidateError: number;
  baselineError: number;
  sourceTickStep?: number;
}): TransitionSeriesRegressionEvaluationRow[] {
  const sourceTickStep = args.sourceTickStep ?? 64;
  return Array.from({ length: args.sourceCount }, (_, sourceSnapshotIndex) => {
    const sourceTick = sourceSnapshotIndex * sourceTickStep;
    const sourceSimulationTimeHours = sourceTick / 100;
    const actual = 100 + sourceSnapshotIndex;
    return {
      groupKey: args.groupKey,
      trajectoryKey: args.trajectoryKey,
      horizonId: horizon.id,
      forecastHorizonHours: horizon.hours,
      datasetVersion: datasetIdentity.datasetVersion,
      normalizationProfileId: datasetIdentity.normalizationProfileId,
      datasetSchema: datasetIdentity.datasetSchema,
      heldOutSplit: datasetIdentity.heldOutSplit,
      sourceSeriesLength: args.sourceCount,
      sourceSnapshotIndex,
      targetSnapshotIndex: sourceSnapshotIndex + 1,
      sourceTick,
      targetTick: sourceTick + horizon.ticks,
      sourceSimulationTimeHours,
      targetSimulationTimeHours:
        sourceSimulationTimeHours + horizon.hours,
      actual: { y: actual },
      candidate: { y: actual + args.candidateError },
      baseline: { y: actual + args.baselineError },
    };
  });
}

function benchmark(rows: readonly TransitionSeriesRegressionEvaluationRow[]) {
  return computeTransitionSeriesRegressionBenchmark({
    targetIds: ["y"],
    requiredGroupKeys: ["group-a", "group-b"],
    requiredHorizons: [horizon],
    datasetIdentity,
    rows,
  });
}

describe("transition-series held-out evaluation", () => {
  it("equal-weights trajectories before groups while retaining raw transition counts", () => {
    const sparse = [
      ...trajectoryRows({
        groupKey: "group-a",
        trajectoryKey: "trajectory-a",
        sourceCount: 2,
        candidateError: 0,
        baselineError: 4,
      }),
      ...trajectoryRows({
        groupKey: "group-a",
        trajectoryKey: "trajectory-b",
        sourceCount: 2,
        candidateError: 10,
        baselineError: 12,
      }),
      ...trajectoryRows({
        groupKey: "group-b",
        trajectoryKey: "trajectory-c",
        sourceCount: 2,
        candidateError: 2,
        baselineError: 5,
      }),
    ];
    const dense = [
      ...trajectoryRows({
        groupKey: "group-a",
        trajectoryKey: "trajectory-a",
        sourceCount: 2,
        candidateError: 0,
        baselineError: 4,
      }),
      ...trajectoryRows({
        groupKey: "group-a",
        trajectoryKey: "trajectory-b",
        sourceCount: 4,
        candidateError: 10,
        baselineError: 12,
        sourceTickStep: 32,
      }),
      ...trajectoryRows({
        groupKey: "group-b",
        trajectoryKey: "trajectory-c",
        sourceCount: 2,
        candidateError: 2,
        baselineError: 5,
      }),
    ];

    const sparseBenchmark = benchmark(sparse);
    const denseBenchmark = benchmark(dense);

    expect(sparseBenchmark.candidate.byGroup["group-a"]!.y).toEqual({
      mae: 5,
      rmse: Math.sqrt(50),
      count: 4,
    });
    expect(denseBenchmark.candidate.byGroup["group-a"]!.y).toEqual({
      mae: 5,
      rmse: Math.sqrt(50),
      count: 6,
    });
    expect(sparseBenchmark.candidate.overall.y!.mae).toBe(3.5);
    expect(denseBenchmark.candidate.overall.y!.mae).toBe(3.5);
    expect(sparseBenchmark.candidate.overall.y!.count).toBe(6);
    expect(denseBenchmark.candidate.overall.y!.count).toBe(8);
    expect(denseBenchmark.coverage.byGroupHorizon["group-a"]![horizon.id]).toEqual({
      rowCount: 6,
      trajectoryCount: 2,
    });
  });

  it("is deterministic under arbitrary transition-row arrival order", () => {
    const rows = [
      ...trajectoryRows({
        groupKey: "group-a",
        trajectoryKey: "trajectory-b",
        sourceCount: 3,
        candidateError: 3,
        baselineError: 5,
      }),
      ...trajectoryRows({
        groupKey: "group-a",
        trajectoryKey: "trajectory-a",
        sourceCount: 2,
        candidateError: 1,
        baselineError: 4,
      }),
      ...trajectoryRows({
        groupKey: "group-b",
        trajectoryKey: "trajectory-c",
        sourceCount: 4,
        candidateError: 2,
        baselineError: 6,
        sourceTickStep: 32,
      }),
    ];

    expect(benchmark([...rows].reverse())).toEqual(benchmark(rows));
  });

  it("fails closed on duplicate, missing, regressing, horizon-drift, and dataset-drift rows", () => {
    const rows = [
      ...trajectoryRows({
        groupKey: "group-a",
        trajectoryKey: "trajectory-a",
        sourceCount: 2,
        candidateError: 1,
        baselineError: 3,
      }),
      ...trajectoryRows({
        groupKey: "group-b",
        trajectoryKey: "trajectory-b",
        sourceCount: 2,
        candidateError: 1,
        baselineError: 3,
      }),
    ];

    expect(() => benchmark([...rows, rows[0]!])).toThrow(/duplicate transition/);

    expect(() =>
      benchmark(
        rows.filter(
          (row) =>
            !(
              row.trajectoryKey === "trajectory-a" &&
              row.sourceSnapshotIndex === 1
            ),
        ),
      ),
    ).toThrow(/missing source transitions/);

    expect(() =>
      benchmark(
        rows.map((row) =>
          row.trajectoryKey === "trajectory-a" &&
          row.sourceSnapshotIndex === 1
            ? {
                ...row,
                sourceTick: 0,
                targetTick: 64,
                sourceSimulationTimeHours: 0,
                targetSimulationTimeHours: 0.64,
              }
            : row,
        ),
      ),
    ).toThrow(/regressing transition/);

    expect(() =>
      benchmark(
        rows.map((row, index) =>
          index === 0 ? { ...row, targetTick: row.targetTick + 1 } : row,
        ),
      ),
    ).toThrow(/declared horizon/);

    expect(() =>
      benchmark(
        rows.map((row, index) =>
          index === 0
            ? { ...row, datasetVersion: "foreign-dataset-v9" }
            : row,
        ),
      ),
    ).toThrow(/identity drift/);
  });

  it("publishes a distinct policy identity without changing the legacy evaluator policy", () => {
    expect(TRANSITION_SERIES_BALANCED_EVALUATION_POLICY_VERSION).toBe(
      "group-trajectory-transition-balanced-strict-v1",
    );
  });
});

