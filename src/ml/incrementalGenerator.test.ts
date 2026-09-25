import { describe, expect, it } from "vitest";

import {
  buildMechanisticDatasetArtifact,
  iterateMechanisticDatasetJsonl,
  type MechanisticTrajectoryResult,
} from "./generator";
import {
  IncrementalMechanisticDatasetCollector,
  verifyMechanisticDatasetFinalization,
  type MechanisticDatasetFinalOutput,
  type MechanisticDatasetFinalization,
  type MechanisticIncrementalStagingStore,
  type MechanisticStagedTrajectoryRecord,
  type MechanisticTrajectoryStageWriter,
} from "./incrementalGenerator";
import {
  planMechanisticSweep,
  type MechanisticSweepDefinition,
  type MechanisticSweepPlan,
  type MechanisticSweepTask,
} from "./sweep";

interface FixtureInput {
  readonly population: number;
  readonly resource: number;
}

interface FixtureTarget {
  readonly futurePopulation: number;
}

function definition(): MechanisticSweepDefinition {
  return {
    planVersion: "incremental-generator-fixture-v1",
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
        input: { population: 100, resource: 1 },
        target: { futurePopulation: 110 },
      },
      {
        datasetVersion: task.datasetVersion,
        trajectory: structuredClone(task.trajectory),
        snapshotIndex: 1,
        simulationTimeHours: 1,
        normalizationProfileId: task.normalizationProfileId,
        datasetSchema: structuredClone(task.datasetSchema),
        input: { population: 110, resource: 0.8 },
        target: { futurePopulation: 120 },
        terminationReason: "requested-horizon-complete",
      },
    ],
  };
}

function completeResults(
  plan: MechanisticSweepPlan,
): MechanisticTrajectoryResult<FixtureInput, FixtureTarget>[] {
  return plan.tasks.map(trajectoryResult);
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
        if (finished) throw new Error("writer is already finished");
        pending.push(line);
      },
      commit: (record) => {
        if (finished) throw new Error("writer is already finished");
        if (record.taskId !== taskId) {
          throw new Error("committed record task does not match writer task");
        }
        if (this.committed.has(taskId)) {
          throw new Error("test store refuses duplicate committed task");
        }
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

  dropLastRow(taskId: string): void {
    this.rows.get(taskId)?.pop();
  }

  replaceFirstRow(taskId: string, line: string): void {
    const rows = this.rows.get(taskId);
    if (rows === undefined || rows.length === 0) {
      throw new Error("task has no staged rows");
    }
    rows[0] = line;
  }
}

class MemoryFinalOutput implements MechanisticDatasetFinalOutput {
  rows: string[] = [];
  finalization: MechanisticDatasetFinalization | null = null;
  beginCount = 0;
  abortCount = 0;
  private active = false;

  begin(_planDigest: string): void {
    this.rows = [];
    this.finalization = null;
    this.beginCount += 1;
    this.active = true;
  }

  writeRow(line: string): void {
    if (!this.active) throw new Error("final output is not active");
    this.rows.push(line);
  }

  commit(finalization: MechanisticDatasetFinalization): void {
    if (!this.active) throw new Error("final output is not active");
    this.finalization = finalization;
    this.active = false;
  }

  abort(): void {
    this.finalization = null;
    this.abortCount += 1;
    this.active = false;
  }
}

describe("incremental mechanistic ML dataset collector", () => {
  it("stages out-of-order trajectories and finalizes byte-identical canonical rows", () => {
    const plan = planMechanisticSweep(definition());
    const results = completeResults(plan);
    const expected = buildMechanisticDatasetArtifact(plan, results);
    const expectedLines = [...iterateMechanisticDatasetJsonl(expected)];

    const staging = new MemoryStagingStore();
    const collector = new IncrementalMechanisticDatasetCollector<
      FixtureInput,
      FixtureTarget
    >(plan, staging);

    for (const result of [...results].reverse()) {
      collector.stageTrajectory(result);
    }

    expect(collector.progress).toEqual({
      plannedTrajectoryCount: plan.trajectoryCount,
      stagedTrajectoryCount: plan.trajectoryCount,
      complete: true,
    });

    const output = new MemoryFinalOutput();
    const finalization = collector.finalize(output);

    expect(output.rows).toEqual(expectedLines);
    expect(finalization.summary).toEqual(expected.summary);
    expect(finalization.trajectories.map((record) => record.taskId)).toEqual(
      plan.tasks.map((task) => task.taskId),
    );
    expect(() =>
      verifyMechanisticDatasetFinalization(output.rows, finalization),
    ).not.toThrow();
  });

  it("resumes from durable committed metadata and makes same-content restaging idempotent", () => {
    const plan = planMechanisticSweep(definition());
    const firstResult = trajectoryResult(plan.tasks[0]!);
    const staging = new MemoryStagingStore();

    const initial = new IncrementalMechanisticDatasetCollector<
      FixtureInput,
      FixtureTarget
    >(plan, staging);
    const firstRecord = initial.stageTrajectory(firstResult);

    const resumed = new IncrementalMechanisticDatasetCollector<
      FixtureInput,
      FixtureTarget
    >(plan, staging);
    expect(resumed.progress.stagedTrajectoryCount).toBe(1);
    expect(resumed.stageTrajectory(firstResult)).toEqual(firstRecord);

    const conflicting: MechanisticTrajectoryResult<
      FixtureInput,
      FixtureTarget
    > = {
      ...firstResult,
      samples: [
        {
          ...firstResult.samples[0]!,
          target: { futurePopulation: 999 },
        },
        ...firstResult.samples.slice(1),
      ],
    };
    expect(() => resumed.stageTrajectory(conflicting)).toThrow(
      /already staged with different content/,
    );

    for (const task of plan.tasks.slice(1)) {
      resumed.stageTrajectory(trajectoryResult(task));
    }

    const output = new MemoryFinalOutput();
    expect(() => resumed.finalize(output)).not.toThrow();
    expect(output.finalization).not.toBeNull();
  });

  it("rejects committed staging from a different exact sweep plan", () => {
    const plan = planMechanisticSweep(definition());
    const staging = new MemoryStagingStore();
    const collector = new IncrementalMechanisticDatasetCollector<
      FixtureInput,
      FixtureTarget
    >(plan, staging);
    collector.stageTrajectory(trajectoryResult(plan.tasks[0]!));

    const changedPlan = planMechanisticSweep({
      ...definition(),
      datasetVersion: "mechanistic-fixture-v2",
    });

    expect(
      () =>
        new IncrementalMechanisticDatasetCollector<
          FixtureInput,
          FixtureTarget
        >(changedPlan, staging),
    ).toThrow(/different sweep plan/);
  });

  it("refuses to begin final publication while planned trajectories are missing", () => {
    const plan = planMechanisticSweep(definition());
    const staging = new MemoryStagingStore();
    const collector = new IncrementalMechanisticDatasetCollector<
      FixtureInput,
      FixtureTarget
    >(plan, staging);
    collector.stageTrajectory(trajectoryResult(plan.tasks[0]!));

    const output = new MemoryFinalOutput();
    expect(() => collector.finalize(output)).toThrow(/dataset is incomplete/);
    expect(output.beginCount).toBe(0);
    expect(output.finalization).toBeNull();
  });

  it("aborts final publication when committed staging is truncated", () => {
    const plan = planMechanisticSweep(definition());
    const staging = new MemoryStagingStore();
    const collector = new IncrementalMechanisticDatasetCollector<
      FixtureInput,
      FixtureTarget
    >(plan, staging);

    for (const result of completeResults(plan)) {
      collector.stageTrajectory(result);
    }
    staging.dropLastRow(plan.tasks[0]!.taskId);

    const output = new MemoryFinalOutput();
    expect(() => collector.finalize(output)).toThrow(/row count mismatch/);
    expect(output.abortCount).toBe(1);
    expect(output.finalization).toBeNull();
  });

  it("detects same-count staged corruption and final-output truncation", () => {
    const plan = planMechanisticSweep(definition());
    const results = completeResults(plan);
    const staging = new MemoryStagingStore();
    const collector = new IncrementalMechanisticDatasetCollector<
      FixtureInput,
      FixtureTarget
    >(plan, staging);

    for (const result of results) {
      collector.stageTrajectory(result);
    }

    const corruptedTaskId = plan.tasks[0]!.taskId;
    const originalLine = staging.rows.get(corruptedTaskId)![0]!;
    staging.replaceFirstRow(
      corruptedTaskId,
      originalLine.replace('"population":100', '"population":101'),
    );
    const corruptOutput = new MemoryFinalOutput();
    expect(() => collector.finalize(corruptOutput)).toThrow(/digest mismatch/);
    expect(corruptOutput.finalization).toBeNull();

    const cleanStaging = new MemoryStagingStore();
    const cleanCollector = new IncrementalMechanisticDatasetCollector<
      FixtureInput,
      FixtureTarget
    >(plan, cleanStaging);
    for (const result of results) {
      cleanCollector.stageTrajectory(result);
    }
    const cleanOutput = new MemoryFinalOutput();
    const finalization = cleanCollector.finalize(cleanOutput);

    expect(() =>
      verifyMechanisticDatasetFinalization(
        cleanOutput.rows.slice(0, -1),
        finalization,
      ),
    ).toThrow(/row count mismatch/);

    const mutated = [...cleanOutput.rows];
    mutated[0] = mutated[0]!.replace('"population":100', '"population":101');
    expect(() =>
      verifyMechanisticDatasetFinalization(mutated, finalization),
    ).toThrow(/digest mismatch/);
  });
});
