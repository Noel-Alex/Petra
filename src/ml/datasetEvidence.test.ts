import { describe, expect, it } from "vitest";
import {
  assignDatasetSplit,
  type DatasetSplit,
  type MechanisticSample,
} from "./dataset";
import {
  createNoInterventionSweepFamily,
} from "./executionDefinition";
import type { MechanisticTrajectoryResult } from "./generator";
import {
  IncrementalMechanisticDatasetCollector,
  type MechanisticDatasetFinalOutput,
  type MechanisticDatasetFinalization,
  type MechanisticIncrementalStagingStore,
  type MechanisticStagedTrajectoryRecord,
  type MechanisticTrajectoryStageWriter,
} from "./incrementalGenerator";
import {
  buildMechanisticDatasetGenerationEvidence,
  assessFirstAggregateSweepReadiness,
} from "./datasetEvidence";
import type { MechanisticSweepRunReport } from "./runner";
import {
  planMechanisticSweep,
  type MechanisticSweepPlan,
  type SweepParameterPoint,
} from "./sweep";

interface FixtureInput {
  readonly population: number;
  readonly resource: number;
}

interface FixtureTarget {
  readonly futurePopulation: number;
}

const ENGINE = "engine-v1";
const SCENARIO = "fixture-scenario";
const SCENARIO_VERSION = "1";
const DATASET_SCHEMA = {
  schemaVersion: "mechanistic-dataset-schema-v1" as const,
  inputSchemaVersion: "aggregate-input-v1",
  targetSchemaVersion: "aggregate-target-v1",
};

function splitParameterPoints(): SweepParameterPoint[] {
  const family = createNoInterventionSweepFamily("untreated");
  const groupId = `intervention:${family.fingerprint.length}:${family.fingerprint}`;
  const wanted = new Set<DatasetSplit>(["train", "validation", "test"]);
  const points: SweepParameterPoint[] = [];

  for (let index = 0; index < 10000 && wanted.size > 0; index += 1) {
    const parameterSetHash = `fixture:binding-${index}`;
    const split = assignDatasetSplit({
      engineVersion: ENGINE,
      parameterSetHash,
      scenarioId: SCENARIO,
      scenarioVersion: SCENARIO_VERSION,
      groupId,
    });
    if (!wanted.has(split)) continue;
    wanted.delete(split);
    points.push({
      id: `point-${split}`,
      parameterSetHash,
    });
  }

  if (wanted.size > 0) {
    throw new Error("fixture search failed to cover all dataset splits");
  }
  return points;
}

function plan(seeds: readonly number[] = [11, 22]): MechanisticSweepPlan {
  return planMechanisticSweep({
    planVersion: "first-sweep-fixture-v1",
    datasetVersion: "fixture-dataset-v1",
    engineVersion: ENGINE,
    scenarioId: SCENARIO,
    scenarioVersion: SCENARIO_VERSION,
    normalizationProfileId: "none-v1",
    datasetSchema: DATASET_SCHEMA,
    parameterPoints: splitParameterPoints(),
    interventionFamilies: [createNoInterventionSweepFamily("untreated")],
    seeds,
    maxTrajectories: 32,
  });
}

function trajectoryResult(
  task: MechanisticSweepPlan["tasks"][number],
): MechanisticTrajectoryResult<FixtureInput, FixtureTarget> {
  const sample = (
    snapshotIndex: number,
    simulationTimeHours: number,
    terminal: boolean,
  ): MechanisticSample<FixtureInput, FixtureTarget> => ({
    datasetVersion: task.datasetVersion,
    trajectory: structuredClone(task.trajectory),
    snapshotIndex,
    simulationTimeHours,
    normalizationProfileId: task.normalizationProfileId,
    datasetSchema: structuredClone(task.datasetSchema),
    input: {
      population: task.trajectory.seed + snapshotIndex,
      resource: 2 - snapshotIndex * 0.5,
    },
    target: {
      futurePopulation: task.trajectory.seed + snapshotIndex + 10,
    },
    ...(terminal ? { terminationReason: "completed-horizon" } : {}),
  });

  return {
    taskId: task.taskId,
    samples: [sample(0, 0, false), sample(1, 1, true)],
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
    return {
      writeRow: (line) => pending.push(line),
      commit: (record) => {
        this.rows.set(taskId, [...pending]);
        this.committed.set(taskId, structuredClone(record));
      },
      abort: () => undefined,
    };
  }

  readRows(taskId: string): Iterable<string> {
    return this.rows.get(taskId) ?? [];
  }
}

class MemoryFinalOutput implements MechanisticDatasetFinalOutput {
  rows: string[] = [];
  finalization: MechanisticDatasetFinalization | null = null;

  begin(_planDigest: string): void {
    this.rows = [];
    this.finalization = null;
  }

  writeRow(line: string): void {
    this.rows.push(line);
  }

  commit(finalization: MechanisticDatasetFinalization): void {
    this.finalization = finalization;
  }

  abort(): void {
    this.finalization = null;
  }
}

function completedReport(plan: MechanisticSweepPlan): MechanisticSweepRunReport {
  const staging = new MemoryStagingStore();
  const collector = new IncrementalMechanisticDatasetCollector(plan, staging);
  return {
    schemaVersion: "petra-ml-run-report-v1",
    planDigest: collector.planDigest,
    plannedTrajectoryCount: plan.trajectoryCount,
    resumedTrajectoryCount: 0,
    completedTrajectoryCount: plan.trajectoryCount,
    failedTrajectoryCount: 0,
    records: plan.tasks.map((task) => ({
      taskId: task.taskId,
      trajectoryKey: task.trajectoryKey,
      status: "completed" as const,
    })),
  };
}

function completeDataset(plan: MechanisticSweepPlan): {
  finalization: MechanisticDatasetFinalization;
  lines: readonly string[];
} {
  const staging = new MemoryStagingStore();
  const collector = new IncrementalMechanisticDatasetCollector<
    FixtureInput,
    FixtureTarget
  >(plan, staging);
  for (const task of plan.tasks) {
    collector.stageTrajectory(trajectoryResult(task));
  }
  const output = new MemoryFinalOutput();
  const finalization = collector.finalize(output);
  return { finalization, lines: output.rows };
}

describe("first aggregate dataset evidence", () => {
  it("requires held-out group coverage, multiple seeds per group, and a bounded budget", () => {
    const readyPlan = plan();
    expect(
      assessFirstAggregateSweepReadiness(readyPlan, {
        minimumSeedsPerGroup: 2,
        maximumTrajectories: 16,
      }),
    ).toMatchObject({
      ready: true,
      reasons: [],
      observedTrajectoryCount: 6,
    });

    const oneSeed = plan([11]);
    const notReady = assessFirstAggregateSweepReadiness(oneSeed, {
      minimumSeedsPerGroup: 2,
      maximumTrajectories: 16,
    });
    expect(notReady.ready).toBe(false);
    expect(notReady.reasons).toEqual(
      expect.arrayContaining([expect.stringMatching(/requires at least 2/)]),
    );

    const overBudget = assessFirstAggregateSweepReadiness(readyPlan, {
      minimumSeedsPerGroup: 2,
      maximumTrajectories: 5,
    });
    expect(overBudget.ready).toBe(false);
    expect(overBudget.reasons).toContain(
      "planned trajectory count 6 exceeds first-sweep cap 5",
    );
  });

  it("emits compact verified complete evidence without treating it as promotion evidence", () => {
    const currentPlan = plan();
    const { finalization, lines } = completeDataset(currentPlan);
    const evidence = buildMechanisticDatasetGenerationEvidence({
      plan: currentPlan,
      runReport: completedReport(currentPlan),
      engineCommit: "0123456789abcdef0123456789abcdef01234567",
      repositoryDirty: false,
      runtime: {
        durationSeconds: 12.5,
        peakRssBytes: 123456,
        logicalCpuCount: 8,
        workerCount: 2,
      },
      finalization,
      datasetLines: () => lines,
    });

    expect(evidence.status).toBe("complete");
    expect(evidence.artifactIntegrityVerified).toBe(true);
    expect(evidence.promotionEvidence).toBe(false);
    expect(evidence.dataset?.sampleCount).toBe(12);
    expect(evidence.dataset?.terminationReasonCounts).toEqual({
      "completed-horizon": 6,
    });
    expect(evidence.dataset?.inputNumericRanges.population).toEqual({
      minimum: 11,
      maximum: 23,
      count: 12,
    });
    expect(evidence.dataset?.inputNumericRanges.resource).toEqual({
      minimum: 1.5,
      maximum: 2,
      count: 12,
    });
    expect(evidence.dataset?.targetNumericRanges.futurePopulation).toEqual({
      minimum: 21,
      maximum: 33,
      count: 12,
    });
  });

  it("keeps failed or unfinalized generation explicitly incomplete and integrity-unverified", () => {
    const currentPlan = plan();
    const collector = new IncrementalMechanisticDatasetCollector(
      currentPlan,
      new MemoryStagingStore(),
    );
    const records = currentPlan.tasks.map((task, index) =>
      index === 0
        ? {
            taskId: task.taskId,
            trajectoryKey: task.trajectoryKey,
            status: "failed" as const,
            failure: { name: "RangeError", message: "fixture failure" },
          }
        : {
            taskId: task.taskId,
            trajectoryKey: task.trajectoryKey,
            status: "completed" as const,
          },
    );
    const report: MechanisticSweepRunReport = {
      schemaVersion: "petra-ml-run-report-v1",
      planDigest: collector.planDigest,
      plannedTrajectoryCount: currentPlan.trajectoryCount,
      resumedTrajectoryCount: 0,
      completedTrajectoryCount: currentPlan.trajectoryCount - 1,
      failedTrajectoryCount: 1,
      records,
    };

    const evidence = buildMechanisticDatasetGenerationEvidence({
      plan: currentPlan,
      runReport: report,
      engineCommit: "0123456789abcdef0123456789abcdef01234567",
      repositoryDirty: false,
    });

    expect(evidence.status).toBe("incomplete");
    expect(evidence.dataset).toBeNull();
    expect(evidence.artifactIntegrityVerified).toBe(false);
    expect(evidence.run.failures).toEqual([
      {
        name: "RangeError",
        message: "fixture failure",
        count: 1,
      },
    ]);
  });

  it("separates finalized artifact integrity from dirty source-state provenance", () => {
    const currentPlan = plan();
    const { finalization, lines } = completeDataset(currentPlan);
    const evidence = buildMechanisticDatasetGenerationEvidence({
      plan: currentPlan,
      runReport: completedReport(currentPlan),
      engineCommit: "0123456789abcdef0123456789abcdef01234567",
      repositoryDirty: true,
      finalization,
      datasetLines: () => lines,
    });

    expect(evidence.status).toBe("complete");
    expect(evidence.source.sourceStateMatchesCommit).toBe(false);
    expect(evidence.artifactIntegrityVerified).toBe(true);
  });
});
