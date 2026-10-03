import { describe, expect, it } from "vitest";

import {
  splitGroupKey,
  trajectoryKey,
  type MechanisticDatasetSchemaIdentity,
  type TrajectoryIdentity,
} from "./dataset";
import {
  createMechanisticExecutionSchedule,
  mechanisticExecutionScheduleIdentity,
  type MechanisticExecutionSchedule,
} from "./executionSchedule";
import { buildMechanisticForecastRowsFromTrajectory } from "./forecastTrajectory";
import type { MechanisticTrajectoryResult } from "./generator";
import type { MechanisticSweepTask } from "./sweep";

const DATASET_SCHEMA: MechanisticDatasetSchemaIdentity = Object.freeze({
  schemaVersion: "mechanistic-dataset-schema-v1",
  inputSchemaVersion: "fixture-input-v1",
  targetSchemaVersion: "fixture-target-v1",
});

/**
 * A planned task always carries the execution schedule it was planned under
 * plus the identity string the sweep pipeline records for provenance. Each
 * test hands the adapter the same schedule object it baked into the task, so
 * task identity and tick reconstruction can never silently disagree.
 */
function fixtureTask(
  schedule: MechanisticExecutionSchedule,
): MechanisticSweepTask {
  const trajectory: TrajectoryIdentity = {
    group: {
      engineVersion: "engine-v1",
      parameterSetHash: "parameter-binding-v1",
      scenarioId: "scenario-a",
      scenarioVersion: "1",
      runConditionFingerprint: "condition-a-v1",
      groupId: "intervention:none",
    },
    seed: 7,
    interventionFingerprint: "no-intervention-v1",
  };

  return {
    taskId: "task-a",
    datasetVersion: "dataset-v1",
    normalizationProfileId: "normalization-v1",
    datasetSchema: DATASET_SCHEMA,
    executionSchedule: schedule,
    executionScheduleIdentity: mechanisticExecutionScheduleIdentity(schedule),
    parameterPointId: "parameter-a",
    runConditionId: "condition-a",
    interventionFamilyId: "none",
    split: "train",
    trajectory,
    splitGroupKey: splitGroupKey(trajectory.group),
    trajectoryKey: trajectoryKey(trajectory),
  };
}

function fixtureResult(
  task: MechanisticSweepTask,
  points: readonly {
    readonly simulationTimeHours: number;
    readonly biomass: number;
  }[],
): MechanisticTrajectoryResult<
  { readonly biomass: number },
  { readonly futureBiomass: number }
> {
  return {
    taskId: task.taskId,
    samples: points.map((point, index) => ({
      datasetVersion: task.datasetVersion,
      trajectory: structuredClone(task.trajectory),
      snapshotIndex: index,
      simulationTimeHours: point.simulationTimeHours,
      normalizationProfileId: task.normalizationProfileId,
      datasetSchema: structuredClone(task.datasetSchema),
      input: { biomass: point.biomass },
      target: { futureBiomass: point.biomass },
      ...(index === points.length - 1
        ? { terminationReason: "completed-horizon" }
        : {}),
    })),
  };
}

describe("mechanistic forecast trajectory adapter", () => {
  it("reconstructs exact schedule ticks including a final remainder", () => {
    const schedule = createMechanisticExecutionSchedule({
      totalTicks: 5,
      snapshotEveryTicks: 2,
    });
    const task = fixtureTask(schedule);
    const result = fixtureResult(task, [
      { simulationTimeHours: 0, biomass: 0 },
      { simulationTimeHours: 0.2, biomass: 2 },
      { simulationTimeHours: 0.4, biomass: 4 },
      { simulationTimeHours: 0.5, biomass: 5 },
    ]);

    const rows = buildMechanisticForecastRowsFromTrajectory({
      task,
      result,
      schedule,
      requestedHorizonTicks: [2, 5],
    });

    expect(rows.observationCount).toBe(4);
    expect(rows.rows.map((row) => [row.sourceTick, row.targetTick])).toEqual([
      [0, 2],
      [0, 5],
      [2, 4],
    ]);
    expect(rows.rows[1]).toMatchObject({
      sourceSnapshotIndex: 0,
      targetSnapshotIndex: 3,
      sourceTimeHours: 0,
      targetTimeHours: 0.5,
      forecastHorizonTicks: 5,
      forecastHorizonHours: 0.5,
      input: { biomass: 0 },
      target: { futureBiomass: 5 },
    });
  });

  it("keeps unsampled target ticks as omissions instead of interpolating by time", () => {
    const schedule = createMechanisticExecutionSchedule({
      totalTicks: 4,
      snapshotEveryTicks: 2,
    });
    const task = fixtureTask(schedule);
    const result = fixtureResult(task, [
      { simulationTimeHours: 0, biomass: 0 },
      { simulationTimeHours: 0.2, biomass: 2 },
      { simulationTimeHours: 0.4, biomass: 4 },
    ]);

    const rows = buildMechanisticForecastRowsFromTrajectory({
      task,
      result,
      schedule,
      requestedHorizonTicks: [1],
    });

    expect(rows.rows).toEqual([]);
    expect(rows.omissions.map((omission) => omission.targetTick)).toEqual([
      1, 3, 5,
    ]);
  });

  it("rejects completed results whose sample count disagrees with the schedule", () => {
    const schedule = createMechanisticExecutionSchedule({
      totalTicks: 5,
      snapshotEveryTicks: 2,
    });
    const task = fixtureTask(schedule);
    const result = fixtureResult(task, [
      { simulationTimeHours: 0, biomass: 0 },
      { simulationTimeHours: 0.2, biomass: 2 },
      { simulationTimeHours: 0.4, biomass: 4 },
    ]);

    expect(() =>
      buildMechanisticForecastRowsFromTrajectory({
        task,
        result,
        schedule,
        requestedHorizonTicks: [2],
      }),
    ).toThrow(/sample count does not match execution schedule/);
  });

  it("rejects foreign result and task trajectory identities", () => {
    const schedule = createMechanisticExecutionSchedule({
      totalTicks: 0,
      snapshotEveryTicks: 1,
    });
    const task = fixtureTask(schedule);
    const result = fixtureResult(task, [
      { simulationTimeHours: 0, biomass: 0 },
    ]);

    expect(() =>
      buildMechanisticForecastRowsFromTrajectory({
        task,
        result: { ...result, taskId: "other-task" },
        schedule,
        requestedHorizonTicks: [1],
      }),
    ).toThrow(/does not match planned task/);

    expect(() =>
      buildMechanisticForecastRowsFromTrajectory({
        task: { ...task, splitGroupKey: "foreign-group" },
        result,
        schedule,
        requestedHorizonTicks: [1],
      }),
    ).toThrow(/splitGroupKey/);
  });

  it("preserves existing trajectory validation before forecast pairing", () => {
    const schedule = createMechanisticExecutionSchedule({
      totalTicks: 2,
      snapshotEveryTicks: 2,
    });
    const task = fixtureTask(schedule);
    const result = fixtureResult(task, [
      { simulationTimeHours: 0, biomass: 0 },
      { simulationTimeHours: 0.2, biomass: 2 },
    ]);
    const foreign = fixtureTask(schedule).trajectory;
    const malformed: MechanisticTrajectoryResult<
      { readonly biomass: number },
      { readonly futureBiomass: number }
    > = {
      ...result,
      samples: [
        result.samples[0]!,
        {
          ...result.samples[1]!,
          trajectory: {
            ...foreign,
            seed: 8,
          },
        },
      ],
    };

    expect(() =>
      buildMechanisticForecastRowsFromTrajectory({
        task,
        result: malformed,
        schedule: createMechanisticExecutionSchedule({
          totalTicks: 2,
          snapshotEveryTicks: 2,
        }),
        requestedHorizonTicks: [2],
      }),
    ).toThrow(/belongs to another trajectory/);
  });
});
