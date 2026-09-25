import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  IncrementalMechanisticDatasetCollector,
  verifyMechanisticDatasetFinalization,
} from "../incrementalGenerator.ts";
import { runMechanisticSweep } from "../runner.ts";
import { planMechanisticSweep } from "../sweep.ts";
import {
  FilesystemMechanisticFinalOutput,
  FilesystemMechanisticStagingStore,
  readFilesystemFinalization,
} from "./filesystemStore.mjs";
import { WorkerThreadMechanisticExecutor } from "./workerThreadExecutor.mjs";

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function createRoot() {
  const root = mkdtempSync(join(tmpdir(), "petra-ml-node-"));
  temporaryRoots.push(root);
  return root;
}

function definition() {
  return {
    planVersion: "node-runner-fixture-v1",
    datasetVersion: "mechanistic-node-fixture-v1",
    engineVersion: "engine-v3",
    scenarioId: "selection-not-mutation",
    scenarioVersion: "2",
    normalizationProfileId: "aggregate-v1",
    datasetSchema: {
      schemaVersion: "mechanistic-dataset-schema-v1",
      inputSchemaVersion: "node-fixture-input-v1",
      targetSchemaVersion: "node-fixture-target-v1",
    },
    parameterPoints: [
      { id: "point-a", parameterSetHash: "params-a" },
      { id: "point-b", parameterSetHash: "params-b" },
      { id: "point-c", parameterSetHash: "params-11" },
    ],
    runConditions: [
      { id: "condition-a", fingerprint: "node-fixture-run-condition-a" },
    ],
    interventionFamilies: [
      { id: "untreated", fingerprint: "none" },
      { id: "pulse", fingerprint: "dose-family-v1" },
    ],
    seeds: [1, 2],
    maxTrajectories: 20,
  };
}

describe("Node mechanistic sweep adapters", () => {
  it("runs tasks on distinct worker threads, stages durably, resumes, and finalizes canonically", async () => {
    const root = createRoot();
    const plan = planMechanisticSweep(definition());
    const stagingRoot = join(root, "staging");
    const outputRoot = join(root, "output");
    const staging = new FilesystemMechanisticStagingStore(stagingRoot);
    const collector = new IncrementalMechanisticDatasetCollector(plan, staging);
    const executor = new WorkerThreadMechanisticExecutor({
      maxWorkers: 2,
      executorModuleUrl: new URL(
        "./workerThreadFixtureExecutor.mjs",
        import.meta.url,
      ).href,
      executorData: { spinMilliseconds: 35 },
    });

    const report = await runMechanisticSweep(plan, collector, executor, {
      maxConcurrency: 4,
    });
    await executor.dispose();

    expect(report.failedTrajectoryCount).toBe(0);
    expect(report.completedTrajectoryCount).toBe(plan.trajectoryCount);
    expect(collector.progress.complete).toBe(true);

    const workerThreadIds = new Set();
    for (const task of plan.tasks) {
      for (const line of staging.readRows(task.taskId)) {
        const row = JSON.parse(line);
        workerThreadIds.add(row.sample.target.workerThreadId);
      }
    }
    expect(workerThreadIds.size).toBe(2);

    const resumedStaging = new FilesystemMechanisticStagingStore(stagingRoot);
    const resumedCollector = new IncrementalMechanisticDatasetCollector(
      plan,
      resumedStaging,
    );
    let resumedExecutionCount = 0;
    const resumedReport = await runMechanisticSweep(
      plan,
      resumedCollector,
      {
        execute: async () => {
          resumedExecutionCount += 1;
          throw new Error("resumed task must not execute");
        },
      },
      { maxConcurrency: 3 },
    );

    expect(resumedExecutionCount).toBe(0);
    expect(resumedReport.resumedTrajectoryCount).toBe(plan.trajectoryCount);
    expect(resumedReport.completedTrajectoryCount).toBe(0);

    const output = new FilesystemMechanisticFinalOutput(outputRoot, "fixture");
    const finalization = resumedCollector.finalize(output);
    const datasetPath = join(outputRoot, "fixture.jsonl");
    const finalizationPath = join(outputRoot, "fixture.finalization.json");
    const lines = readFileSync(datasetPath, "utf8")
      .split("\n")
      .filter((line) => line.length > 0);

    expect(() =>
      verifyMechanisticDatasetFinalization(lines, finalization),
    ).not.toThrow();
    expect(readFilesystemFinalization(finalizationPath)).toEqual(finalization);
    expect(lines.length).toBe(finalization.summary.sampleCount);
  });

  it("keeps aborted trajectory writes invisible to resume", () => {
    const root = createRoot();
    const staging = new FilesystemMechanisticStagingStore(root);
    const writer = staging.beginTrajectory("task-abort");
    writer.writeRow('{"row":1}');
    writer.abort();

    expect(staging.listCommitted()).toEqual([]);
    expect(() => [...staging.readRows("task-abort")]).toThrow(
      /no committed stage record/,
    );
  });

  it("rejects an active task on clean worker exit and replenishes the pool", async () => {
    const executor = new WorkerThreadMechanisticExecutor({
      maxWorkers: 1,
      executorModuleUrl: new URL(
        "./workerThreadFixtureExecutor.mjs",
        import.meta.url,
      ).href,
      executorData: {
        exitTaskId: "exit-cleanly",
      },
    });

    const exited = executor.execute({ taskId: "exit-cleanly" });
    const recovered = executor.execute({
      taskId: "recover-after-clean-exit",
      datasetVersion: "dataset",
      trajectory: {
        group: {
          engineVersion: "engine",
          scenarioId: "scenario",
          scenarioVersion: "1",
          parameterSetHash: "params",
          runConditionFingerprint: "node-fixture-run-condition-a",
          interventionFingerprint: "none",
        },
        seed: 1,
      },
      normalizationProfileId: "norm",
      datasetSchema: {
        schemaVersion: "mechanistic-dataset-schema-v1",
        inputSchemaVersion: "input",
        targetSchemaVersion: "target",
      },
      parameterPointId: "point",
      runConditionId: "condition-a",
      interventionFamilyId: "none",
    });

    await expect(exited).rejects.toThrow(
      "mechanistic worker exited unexpectedly with code 0",
    );
    await expect(recovered).resolves.toMatchObject({
      taskId: "recover-after-clean-exit",
    });

    await executor.dispose();
  });

  it("propagates worker task failures without poisoning the pool", async () => {
    const executor = new WorkerThreadMechanisticExecutor({
      maxWorkers: 2,
      executorModuleUrl: new URL(
        "./workerThreadFixtureExecutor.mjs",
        import.meta.url,
      ).href,
      executorData: {
        spinMilliseconds: 5,
        failTaskId: "fail-me",
      },
    });

    await expect(executor.execute({ taskId: "fail-me" })).rejects.toMatchObject({
      name: "RangeError",
      message: "fixture worker refusal",
    });
    await expect(
      executor.execute({
        taskId: "recover",
        datasetVersion: "dataset",
        trajectory: {
          group: {
            engineVersion: "engine",
            scenarioId: "scenario",
            scenarioVersion: "1",
            parameterSetHash: "params",
            interventionFingerprint: "none",
          },
          seed: 1,
        },
        normalizationProfileId: "norm",
        datasetSchema: {
          schemaVersion: "mechanistic-dataset-schema-v1",
          inputSchemaVersion: "input",
          targetSchemaVersion: "target",
        },
        parameterPointId: "point",
        interventionFamilyId: "none",
      }),
    ).resolves.toMatchObject({ taskId: "recover" });

    await executor.dispose();
  });
});
