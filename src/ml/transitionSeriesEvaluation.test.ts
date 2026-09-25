import { describe, expect, it } from "vitest";

import {
  TRAJECTORY_BALANCED_TRANSITION_SERIES_EVALUATION_POLICY_VERSION,
  TRANSITION_SERIES_EVALUATION_ROW_SCHEMA_VERSION,
  computeTrajectoryBalancedTransitionSeriesBenchmark,
  type TransitionSeriesEvaluationHorizon,
  type TransitionSeriesEvaluationRow,
} from "./benchmark";

const horizon: TransitionSeriesEvaluationHorizon = {
  id: "next-64-ticks",
  ticks: 64,
  hours: 0.5,
};

function transition(args: {
  groupKey: string;
  trajectoryKey: string;
  sourceIndex: number;
  actual?: number;
  candidateError?: number;
  baselineError?: number;
}): TransitionSeriesEvaluationRow {
  const actual = args.actual ?? 10;
  const sourceTick = args.sourceIndex * horizon.ticks;
  const sourceTimeHours = args.sourceIndex * horizon.hours;
  return {
    schemaVersion: TRANSITION_SERIES_EVALUATION_ROW_SCHEMA_VERSION,
    groupKey: args.groupKey,
    trajectoryKey: args.trajectoryKey,
    horizonId: horizon.id,
    sourceSnapshotIndex: args.sourceIndex,
    targetSnapshotIndex: args.sourceIndex + 1,
    sourceTick,
    targetTick: sourceTick + horizon.ticks,
    sourceTimeHours,
    targetTimeHours: sourceTimeHours + horizon.hours,
    forecastHorizonTicks: horizon.ticks,
    forecastHorizonHours: horizon.hours,
    actual: { y: actual },
    candidate: { y: actual + (args.candidateError ?? 1) },
    baseline: { y: actual + (args.baselineError ?? 2) },
  };
}

function benchmark(rows: readonly TransitionSeriesEvaluationRow[]) {
  return computeTrajectoryBalancedTransitionSeriesBenchmark({
    targetIds: ["y"],
    requiredGroupKeys: ["group-a", "group-b"],
    requiredHorizons: [horizon],
    rows,
  });
}

describe("trajectory-balanced transition-series evaluation", () => {
  it("retains every transition while balancing trajectories and groups", () => {
    const rows = [
      transition({
        groupKey: "group-a",
        trajectoryKey: "trajectory-a",
        sourceIndex: 0,
        candidateError: 1,
        baselineError: 2,
      }),
      transition({
        groupKey: "group-a",
        trajectoryKey: "trajectory-a",
        sourceIndex: 1,
        candidateError: 1,
        baselineError: 2,
      }),
      ...[0, 1, 2, 3].map((sourceIndex) =>
        transition({
          groupKey: "group-b",
          trajectoryKey: "trajectory-b",
          sourceIndex,
          candidateError: 3,
          baselineError: 4,
        }),
      ),
    ];

    const result = benchmark(rows);

    expect(result.evaluationPolicyVersion).toBe(
      TRAJECTORY_BALANCED_TRANSITION_SERIES_EVALUATION_POLICY_VERSION,
    );
    expect(result.coverage).toMatchObject({
      rowCount: 6,
      trajectoryCount: 2,
      groupCount: 2,
      byGroup: {
        "group-a": { rowCount: 2, trajectoryCount: 1 },
        "group-b": { rowCount: 4, trajectoryCount: 1 },
      },
      byHorizon: {
        "next-64-ticks": {
          forecastHorizonTicks: 64,
          forecastHorizonHours: 0.5,
          rowCount: 6,
          trajectoryCount: 2,
          groupCount: 2,
        },
      },
    });
    expect(result.candidate.overall.y).toEqual({
      mae: 2,
      rmse: Math.sqrt(5),
      count: 6,
    });
    expect(result.baseline.overall.y).toEqual({
      mae: 3,
      rmse: Math.sqrt(10),
      count: 6,
    });
  });

  it("does not increase one trajectory's weight when it contributes more equivalent transitions", () => {
    const sparse = computeTrajectoryBalancedTransitionSeriesBenchmark({
      targetIds: ["y"],
      requiredGroupKeys: ["group-a"],
      requiredHorizons: [horizon],
      rows: [
        transition({
          groupKey: "group-a",
          trajectoryKey: "high-error",
          sourceIndex: 0,
          candidateError: 4,
        }),
        transition({
          groupKey: "group-a",
          trajectoryKey: "zero-error",
          sourceIndex: 0,
          candidateError: 0,
        }),
      ],
    });
    const denser = computeTrajectoryBalancedTransitionSeriesBenchmark({
      targetIds: ["y"],
      requiredGroupKeys: ["group-a"],
      requiredHorizons: [horizon],
      rows: [
        transition({
          groupKey: "group-a",
          trajectoryKey: "high-error",
          sourceIndex: 0,
          candidateError: 4,
        }),
        ...[0, 1, 2, 3].map((sourceIndex) =>
          transition({
            groupKey: "group-a",
            trajectoryKey: "zero-error",
            sourceIndex,
            candidateError: 0,
          }),
        ),
      ],
    });

    expect(sparse.candidate.overall.y?.mae).toBe(2);
    expect(denser.candidate.overall.y?.mae).toBe(2);
    expect(sparse.candidate.overall.y?.rmse).toBe(Math.sqrt(8));
    expect(denser.candidate.overall.y?.rmse).toBe(Math.sqrt(8));
    expect(sparse.candidate.overall.y?.count).toBe(2);
    expect(denser.candidate.overall.y?.count).toBe(5);
  });

  it("is deterministic when transition rows arrive in a different order", () => {
    const rows = [
      transition({
        groupKey: "group-a",
        trajectoryKey: "trajectory-a",
        sourceIndex: 0,
      }),
      transition({
        groupKey: "group-a",
        trajectoryKey: "trajectory-a",
        sourceIndex: 1,
      }),
      transition({
        groupKey: "group-b",
        trajectoryKey: "trajectory-b",
        sourceIndex: 0,
        candidateError: 3,
      }),
      transition({
        groupKey: "group-b",
        trajectoryKey: "trajectory-b",
        sourceIndex: 1,
        candidateError: 3,
      }),
    ];

    expect(benchmark([...rows].reverse())).toEqual(benchmark(rows));
  });

  it("fails closed on duplicate, discontinuous, horizon-drifted, and stale-schema rows", () => {
    const first = transition({
      groupKey: "group-a",
      trajectoryKey: "trajectory-a",
      sourceIndex: 0,
    });
    const second = transition({
      groupKey: "group-a",
      trajectoryKey: "trajectory-a",
      sourceIndex: 1,
    });
    const otherGroup = transition({
      groupKey: "group-b",
      trajectoryKey: "trajectory-b",
      sourceIndex: 0,
    });

    expect(() => benchmark([first, first, otherGroup])).toThrow(
      /duplicate or regressing source positions/,
    );

    expect(() =>
      benchmark([
        first,
        {
          ...second,
          sourceSnapshotIndex: 2,
          targetSnapshotIndex: 3,
        },
        otherGroup,
      ]),
    ).toThrow(/continuous accepted transition chain/);

    expect(() =>
      benchmark([
        {
          ...first,
          forecastHorizonTicks: 32,
        },
        otherGroup,
      ]),
    ).toThrow(/declared tick offset/);

    expect(() =>
      benchmark([
        {
          ...first,
          schemaVersion: "transition-series-evaluation-row-v0",
        } as unknown as TransitionSeriesEvaluationRow,
        otherGroup,
      ]),
    ).toThrow(/unsupported schema version/);
  });

  it("rejects missing held-out groups, cross-group trajectory reuse, and non-finite targets", () => {
    const groupA = transition({
      groupKey: "group-a",
      trajectoryKey: "shared-trajectory",
      sourceIndex: 0,
    });

    expect(() =>
      computeTrajectoryBalancedTransitionSeriesBenchmark({
        targetIds: ["y"],
        requiredGroupKeys: ["group-a", "group-b"],
        requiredHorizons: [horizon],
        rows: [groupA],
      }),
    ).toThrow(/required held-out group has no trajectories/);

    expect(() =>
      computeTrajectoryBalancedTransitionSeriesBenchmark({
        targetIds: ["y"],
        requiredGroupKeys: ["group-a", "group-b"],
        requiredHorizons: [horizon],
        rows: [
          groupA,
          {
            ...groupA,
            groupKey: "group-b",
          },
        ],
      }),
    ).toThrow(/appears in multiple held-out groups/);

    expect(() =>
      benchmark([
        {
          ...groupA,
          actual: { y: Number.NaN },
        },
        transition({
          groupKey: "group-b",
          trajectoryKey: "trajectory-b",
          sourceIndex: 0,
        }),
      ]),
    ).toThrow(/must be finite/);
  });
});
