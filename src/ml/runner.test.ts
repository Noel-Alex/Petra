import { describe, expect, it } from "vitest";
import { createMechanisticExecutionSchedule } from "./executionSchedule";

import type { MechanisticTrajectoryResult } from "./generator";
import {
  IncrementalMechanisticDatasetCollector,
  type MechanisticIncrementalStagingStore,
  type MechanisticStagedTrajectoryRecord,
  type MechanisticTrajectoryStageWriter,
} from "./incrementalGenerator";
import {
  planMechanisticSweep,
  type MechanisticSweepDefinition,
  type MechanisticSweepTask,
} from "./sweep";
import {
  runMechanisticSweep,
  type MechanisticTaskExecutor,
} from "./runner";

interface FixtureInput {
  readonly population: number;
}

interface FixtureTarget {
  readonly futurePopulation: number;
}

function definition(): MechanisticSweepDefinition {
  return {
    planVersion: "runner-fixture-v1",
    datasetVersion: "mechanistic-fixture-v1",
    engineVersion: "engine-v3",
    scenarioId: "selection-not-mutation",
    scenarioVersion: "2",
    normalizationProfileId: "aggregate-v1",
    datasetSchema: {
      schemaVersion: "mechanistic-dataset-schema-v1",
      inputSchemaVersion: "aggregate-input-v1",
      targetSchemaVersion: "aggregate-target-v1",
    },
    executionSchedule: createMechanisticExecutionSchedule({ totalTicks: 4, snapshotEveryTicks: 2 }),
    parameterPoints: [
      { id: "point-a", parameterSetHash: "params-a" },
      { id: "point-b", parameterSetHash: "params-b" },
      { id: "point-c", parameterSetHash: "params-11" },
    ],
    runConditions: [{ id: "condition-a", fingerprint: "condition-a-v1" }],
    interventionFamilies: [
      { id: "untreated", fingerprint: "none" },
      { id: "pulse", fingerprint: "dose-family-v1" },
    ],
    seeds: [1, 2],
    maxTrajectories: 20,
  };
}

function trajectoryResult(
  task: MechanisticSweepTask,
): MechanisticTrajectoryResult<FixtureInput, FixtureTarget> {
  return {
    taskId: task.taskId,
    samples: [
      {
        datasetVersion: task.datasetVersion,
        trajectory: structuredClone(task.trajectory),
        snapshotIndex: 0,
        simulationTimeHours: 0,
        normalizationProfileId: task.normalizationProfileId,
        datasetSchema: structuredClone(task.datasetSchema),
        input: { population: 100 },
        target: { futurePopulation: 110 },
      },
      {
        datasetVersion: task.datasetVersion,
        trajectory: structuredClone(task.trajectory),
        snapshotIndex: 1,
        simulationTimeHours: 1,
        normalizationProfileId: task.normalizationProfileId,
        datasetSchema: structuredClone(task.datasetSchema),
        input: { population: 110 },
        target: { futurePopulation: 120 },
        terminationReason: "completed-horizon",
      },
    ],
  };
}

class MemoryStagingStore implements MechanisticIncrementalStagingStore {
  readonly committed = new Map<string, MechanisticStagedTrajectoryRecord>();
  readonly rows = new Map<string, string[]>();

  listCommitted(): readonly MechanisticStagedTrajectoryRecord[] {
    return [...this.committed.values()];
  }

  beginTrajectory(taskId: string): MechanisticTrajectoryStageWriter {
    const pending: string[] = [];
    let finished = false;
    return {
      writeRow: (line) => {
        if (finished) throw new Error("writer finished");
        pending.push(line);
      },
      commit: (record) => {
        if (finished) throw new Error("writer finished");
        this.rows.set(taskId, [...pending]);
        this.committed.set(taskId, structuredClone(record));
        finished = true;
      },
      abort: () => {
        finished = true;
      },
    };
  }

  readRows(taskId: string): Iterable<string> {
    return this.rows.get(taskId) ?? [];
  }
}

describe("mechanistic sweep runner", () => {
  it("bounds concurrency, streams completion, and reports in canonical plan order", async () => {
    const plan = planMechanisticSweep(definition());
    const staging = new MemoryStagingStore();
    const collector = new IncrementalMechanisticDatasetCollector<
      FixtureInput,
      FixtureTarget
    >(plan, staging);

    let active = 0;
    let peak = 0;
    const completionOrder: string[] = [];
    const executor: MechanisticTaskExecutor<FixtureInput, FixtureTarget> = {
      execute: async (task) => {
        active += 1;
        peak = Math.max(peak, active);
        await Promise.resolve();
        if (task === plan.tasks[0]) {
          await Promise.resolve();
          await Promise.resolve();
        }
        completionOrder.push(task.taskId);
        active -= 1;
        return trajectoryResult(task);
      },
    };

    const report = await runMechanisticSweep(plan, collector, executor, {
      maxConcurrency: 3,
    });

    expect(peak).toBeLessThanOrEqual(3);
    expect(collector.progress.complete).toBe(true);
    expect(report.completedTrajectoryCount).toBe(plan.trajectoryCount);
    expect(report.resumedTrajectoryCount).toBe(0);
    expect(report.failedTrajectoryCount).toBe(0);
    expect(report.records.map((record) => record.taskId)).toEqual(
      plan.tasks.map((task) => task.taskId),
    );
    expect(completionOrder).not.toEqual(
      plan.tasks.map((task) => task.taskId),
    );
  });

  it("does not re-execute validated staged trajectories on resume", async () => {
    const plan = planMechanisticSweep(definition());
    const staging = new MemoryStagingStore();
    const firstCollector = new IncrementalMechanisticDatasetCollector<
      FixtureInput,
      FixtureTarget
    >(plan, staging);
    firstCollector.stageTrajectory(trajectoryResult(plan.tasks[0]!));

    const resumedCollector = new IncrementalMechanisticDatasetCollector<
      FixtureInput,
      FixtureTarget
    >(plan, staging);
    const executed: string[] = [];
    const executor: MechanisticTaskExecutor<FixtureInput, FixtureTarget> = {
      execute: async (task) => {
        executed.push(task.taskId);
        return trajectoryResult(task);
      },
    };

    const report = await runMechanisticSweep(plan, resumedCollector, executor, {
      maxConcurrency: 2,
    });

    expect(executed).not.toContain(plan.tasks[0]!.taskId);
    expect(report.records[0]).toMatchObject({
      taskId: plan.tasks[0]!.taskId,
      status: "resumed",
    });
    expect(report.resumedTrajectoryCount).toBe(1);
    expect(report.completedTrajectoryCount).toBe(plan.trajectoryCount - 1);
    expect(report.failedTrajectoryCount).toBe(0);
  });

  it("records task failures without substituting or staging a trajectory", async () => {
    const plan = planMechanisticSweep(definition());
    const staging = new MemoryStagingStore();
    const collector = new IncrementalMechanisticDatasetCollector<
      FixtureInput,
      FixtureTarget
    >(plan, staging);
    const failedTask = plan.tasks[1]!;
    const executor: MechanisticTaskExecutor<FixtureInput, FixtureTarget> = {
      execute: async (task) => {
        if (task.taskId === failedTask.taskId) {
          throw new RangeError("fixture refusal");
        }
        return trajectoryResult(task);
      },
    };

    const report = await runMechanisticSweep(plan, collector, executor, {
      maxConcurrency: 4,
    });

    expect(report.failedTrajectoryCount).toBe(1);
    expect(report.records[1]).toEqual({
      taskId: failedTask.taskId,
      trajectoryKey: failedTask.trajectoryKey,
      status: "failed",
      failure: {
        name: "RangeError",
        message: "fixture refusal",
      },
    });
    expect(collector.hasStagedTrajectory(failedTask.taskId)).toBe(false);
    expect(collector.progress.complete).toBe(false);
  });
});
