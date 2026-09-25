import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { cpus } from "node:os";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

import {
  createMechanisticExecutionDefinition,
  createMechanisticRunConditionExecutionDefinition,
  createNoInterventionExecutionDefinition,
  createNoInterventionSweepFamily,
  createSweepParameterPointForBinding,
  createSweepRunConditionForConfig,
} from "../src/ml/executionDefinition";
import {
  createMechanisticExecutionSchedule,
  mechanisticExecutionScheduleIdentity,
} from "../src/ml/executionSchedule";
import {
  IncrementalMechanisticDatasetCollector,
  verifyMechanisticDatasetFinalization,
} from "../src/ml/incrementalGenerator";
import {
  createComposedMechanisticTaskExecutor,
  runMechanisticSweep,
  type MechanisticTaskExecutor,
} from "../src/ml/runner";
import {
  buildMechanisticSweepManifest,
  planMechanisticSweep,
} from "../src/ml/sweep";
import {
  FilesystemMechanisticFinalOutput,
  FilesystemMechanisticStagingStore,
} from "../src/ml/node/filesystemStore.mjs";
import { WorkerThreadMechanisticExecutor } from "../src/ml/node/workerThreadExecutor.mjs";
import {
  canonicalJson,
  type MechanisticTrajectoryResult,
} from "../src/ml/generator";
import { buildFlagshipComposedRunPlan } from "../src/sim/flagshipComposition";
import {
  NODE_AUTHORITATIVE_PROFILE_DATA_SCHEMA_VERSION,
  resolveNodeAuthoritativeProfileDefinition,
  type NodeAuthoritativeProfileExecutorData,
  type NodeAuthoritativeProfileInput,
  type NodeAuthoritativeProfileTarget,
} from "./ml_node_authoritative_profile.shared";

const EXPERIMENT_ID = "ml-node-authoritative-profile";
const DEFAULT_SEEDS = [0x5eed1234, 0x5eed1235, 0x5eed1236] as const;
const DEFAULT_TOTAL_TICKS = 1024;
const DEFAULT_SNAPSHOT_EVERY_TICKS = 64;
const DEFAULT_WORKERS = 2;
const MAX_WORKERS = 8;

const ENGINEERING_INITIALIZATION = Object.freeze({
  initialResourceLevel: 8,
  inocula: Object.freeze([
    Object.freeze({
      lineageId: "founder-wt",
      x: 80,
      y: 80,
      biomass: 1,
    }),
  ]),
});

interface WorkerTrajectoryResult
  extends MechanisticTrajectoryResult<
    NodeAuthoritativeProfileInput,
    NodeAuthoritativeProfileTarget
  > {
  readonly workerThreadId: number;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`${name} must be supplied by run_local_experiments.py`);
  }
  return value;
}

function positiveSafeInteger(
  name: string,
  raw: string | undefined,
  fallback: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  if (raw === undefined || raw.trim().length === 0) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new RangeError(
      `${name} must be a positive safe integer <= ${maximum}`,
    );
  }
  return value;
}

function memoryRssBytes(): number {
  const rss = process.memoryUsage().rss;
  if (!Number.isSafeInteger(rss) || rss < 0) {
    throw new Error("process RSS must be a non-negative safe integer");
  }
  return rss;
}

function writeJsonAtomically(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = path + ".partial";
  writeFileSync(temporary, JSON.stringify(value, null, 2) + "\n", "utf8");
  renameSync(temporary, path);
}

function sourceState(): {
  readonly commit: string;
  readonly dirty: boolean;
} {
  const commit = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const dirty =
    execFileSync("git", ["status", "--porcelain"], {
      encoding: "utf8",
    }).trim().length > 0;
  return Object.freeze({ commit, dirty });
}

function datasetLines(path: string): string[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.length > 0);
}

async function main(): Promise<void> {
  const artifactDir = resolve(requireEnv("PETRA_LOCAL_ARTIFACT_DIR"));
  const compactResultPath = resolve(requireEnv("PETRA_LOCAL_RESULT_JSON"));
  const bundleDir = join(
    artifactDir,
    "ml-node-authoritative-profile-bundle",
  );
  const dataDir = join(artifactDir, "ml-node-authoritative-profile-data");
  const stagingDir = join(dataDir, "staging");
  const outputDir = join(dataDir, "output");
  mkdirSync(dataDir, { recursive: true });

  const logicalCpuCount = cpus().length;
  const requestedWorkers = positiveSafeInteger(
    "PETRA_ML_NODE_WORKERS",
    process.env.PETRA_ML_NODE_WORKERS,
    DEFAULT_WORKERS,
    MAX_WORKERS,
  );
  const workerCount = Math.min(
    requestedWorkers,
    logicalCpuCount,
    DEFAULT_SEEDS.length,
  );
  if (workerCount < 2) {
    throw new RangeError(
      "ml-node-authoritative-profile requires at least two logical CPUs/workers",
    );
  }

  const totalTicks = positiveSafeInteger(
    "PETRA_ML_NODE_TOTAL_TICKS",
    process.env.PETRA_ML_NODE_TOTAL_TICKS,
    DEFAULT_TOTAL_TICKS,
  );
  const snapshotEveryTicks = positiveSafeInteger(
    "PETRA_ML_NODE_SNAPSHOT_EVERY_TICKS",
    process.env.PETRA_ML_NODE_SNAPSHOT_EVERY_TICKS,
    DEFAULT_SNAPSHOT_EVERY_TICKS,
  );
  const schedule = createMechanisticExecutionSchedule({
    totalTicks,
    snapshotEveryTicks,
  });
  const scheduleIdentity =
    mechanisticExecutionScheduleIdentity(schedule);

  const flagship = buildFlagshipComposedRunPlan({
    seed: DEFAULT_SEEDS[0],
    initialResourceLevel: ENGINEERING_INITIALIZATION.initialResourceLevel,
    inocula: ENGINEERING_INITIALIZATION.inocula,
  });
  const runCondition =
    createMechanisticRunConditionExecutionDefinition(
      "flagship-established-engineering-initialization-v1",
      flagship.config,
    );
  const sweepRunCondition = createSweepRunConditionForConfig(
    runCondition.conditionId,
    flagship.config,
  );
  const intervention =
    createNoInterventionExecutionDefinition("no-intervention");
  const executionDefinition = createMechanisticExecutionDefinition({
    parameterSetBinding: flagship.parameterSetBinding,
    runCondition,
    executionSchedule: schedule,
    intervention,
  });
  const parameterPoint = createSweepParameterPointForBinding(
    "flagship-established-engineering-parameters-v1",
    flagship.parameterSetBinding,
    flagship.config,
  );
  const interventionFamily =
    createNoInterventionSweepFamily("no-intervention");

  const plan = planMechanisticSweep({
    planVersion: "ml-node-authoritative-profile-v2",
    datasetVersion: "ml-node-authoritative-profile-v1",
    engineVersion: flagship.identity.engineVersion,
    scenarioId: flagship.identity.scenarioId,
    scenarioVersion: flagship.identity.scenarioVersion,
    normalizationProfileId: "identity-none-profile-v1",
    datasetSchema: {
      schemaVersion: "mechanistic-dataset-schema-v1",
      inputSchemaVersion: "node-authoritative-profile-input-v1",
      targetSchemaVersion: "node-authoritative-profile-target-v1",
    },
    executionSchedule: schedule,
    parameterPoints: [parameterPoint],
    runConditions: [sweepRunCondition],
    interventionFamilies: [interventionFamily],
    seeds: DEFAULT_SEEDS,
    maxTrajectories: DEFAULT_SEEDS.length,
    splitPolicy: {
      version: "node-authoritative-profile-all-train-v1",
      trainFraction: 1,
      validationFraction: 0,
      testFraction: 0,
    },
    splitCoveragePolicy: {
      version: "node-authoritative-profile-coverage-v1",
      requiredSplits: ["train"],
      minimumGroupsPerSplit: 1,
    },
  });
  const manifest = buildMechanisticSweepManifest(plan);
  writeJsonAtomically(
    join(dataDir, "sweep-manifest.json"),
    {
      ...manifest,
      evidenceBoundary:
        "Infrastructure-only multicore/parity/resume profile; not training data, biological validation, or promotion evidence.",
    },
  );

  const executorData: NodeAuthoritativeProfileExecutorData =
    Object.freeze({
      schemaVersion: NODE_AUTHORITATIVE_PROFILE_DATA_SCHEMA_VERSION,
      allowedTaskIds: Object.freeze(
        plan.tasks.map((task) => task.taskId),
      ),
      executionDefinition,
      config: structuredClone(flagship.config),
      schedule,
    });

  const directExecutor = createComposedMechanisticTaskExecutor(
    (task) =>
      resolveNodeAuthoritativeProfileDefinition(task, executorData),
  );
  const workerModuleUrl = pathToFileURL(
    resolve(bundleDir, "worker.mjs"),
  ).href;
  const workerHostUrl = pathToFileURL(
    resolve(process.cwd(), "src/ml/node/workerThreadHost.mjs"),
  );
  const workerPool = new WorkerThreadMechanisticExecutor({
    maxWorkers: workerCount,
    executorModuleUrl: workerModuleUrl,
    executorData,
    workerModuleUrl: workerHostUrl,
  });

  const firstTask = plan.tasks[0];
  if (firstTask === undefined) {
    throw new Error("node authoritative profile planned no tasks");
  }

  const directResult = await directExecutor.execute(firstTask);
  const parityWorkerResult =
    (await workerPool.execute(firstTask)) as WorkerTrajectoryResult;
  assert.equal(parityWorkerResult.taskId, directResult.taskId);
  assert.equal(
    canonicalJson(parityWorkerResult.samples),
    canonicalJson(directResult.samples),
    "worker-thread authoritative samples must equal direct composed execution",
  );

  const workerThreadIds = new Set<number>([
    parityWorkerResult.workerThreadId,
  ]);
  const observedExecutor: MechanisticTaskExecutor<
    NodeAuthoritativeProfileInput,
    NodeAuthoritativeProfileTarget
  > = {
    execute: async (task) => {
      const result =
        (await workerPool.execute(task)) as WorkerTrajectoryResult;
      if (
        !Number.isSafeInteger(result.workerThreadId) ||
        result.workerThreadId <= 0
      ) {
        throw new TypeError(
          "authoritative worker returned an invalid worker thread id",
        );
      }
      workerThreadIds.add(result.workerThreadId);
      return {
        taskId: result.taskId,
        samples: result.samples,
      };
    },
  };

  const staging = new FilesystemMechanisticStagingStore(stagingDir);
  const collector =
    new IncrementalMechanisticDatasetCollector<
      NodeAuthoritativeProfileInput,
      NodeAuthoritativeProfileTarget
    >(plan, staging);

  const initialRssBytes = memoryRssBytes();
  let peakRssBytes = initialRssBytes;
  const memoryTimer = setInterval(() => {
    peakRssBytes = Math.max(peakRssBytes, memoryRssBytes());
  }, 25);
  const startedCpu = process.cpuUsage();
  const started = performance.now();
  let runReport;
  try {
    runReport = await runMechanisticSweep(
      plan,
      collector,
      observedExecutor,
      { maxConcurrency: plan.trajectoryCount },
    );
  } finally {
    clearInterval(memoryTimer);
    peakRssBytes = Math.max(peakRssBytes, memoryRssBytes());
    await workerPool.dispose();
  }
  const durationSeconds = (performance.now() - started) / 1000;
  const cpu = process.cpuUsage(startedCpu);
  const finalRssBytes = memoryRssBytes();

  assert.equal(runReport.failedTrajectoryCount, 0);
  assert.equal(
    runReport.completedTrajectoryCount,
    plan.trajectoryCount,
  );
  assert.ok(
    workerThreadIds.size >= 2,
    "authoritative sweep must execute on at least two distinct worker threads",
  );

  const resumedStaging =
    new FilesystemMechanisticStagingStore(stagingDir);
  const resumedCollector =
    new IncrementalMechanisticDatasetCollector<
      NodeAuthoritativeProfileInput,
      NodeAuthoritativeProfileTarget
    >(plan, resumedStaging);
  let resumedExecutionCount = 0;
  const resumedReport = await runMechanisticSweep(
    plan,
    resumedCollector,
    {
      execute: async () => {
        resumedExecutionCount += 1;
        throw new Error(
          "committed authoritative trajectory must not re-execute on resume",
        );
      },
    },
    { maxConcurrency: workerCount },
  );
  assert.equal(resumedExecutionCount, 0);
  assert.equal(
    resumedReport.resumedTrajectoryCount,
    plan.trajectoryCount,
  );

  const output = new FilesystemMechanisticFinalOutput(
    outputDir,
    "profile",
  );
  const finalization = resumedCollector.finalize(output);
  const datasetPath = join(outputDir, "profile.jsonl");
  const lines = datasetLines(datasetPath);
  verifyMechanisticDatasetFinalization(lines, finalization);

  const source = sourceState();
  const cpuSeconds =
    (cpu.user + cpu.system) / 1_000_000;
  const compactResult = Object.freeze({
    schema_version: 1,
    experiment_id: EXPERIMENT_ID,
    status: "passed",
    evidence_boundary:
      "Infrastructure-only authoritative Node worker evidence. This is not a held-out ML dataset, biological validation, model-training evidence, or promotion evidence.",
    source: {
      commit: source.commit,
      repository_dirty: source.dirty,
    },
    authority: {
      scenario_id: flagship.identity.scenarioId,
      scenario_version: flagship.identity.scenarioVersion,
      parameter_set_id: flagship.identity.parameterSetId,
      parameter_set_version: flagship.identity.parameterSetVersion,
      configuration_fingerprint:
        flagship.parameterSetBinding.configurationFingerprint,
      run_condition_id: runCondition.conditionId,
      run_condition_fingerprint: runCondition.fingerprint,
      seeds: DEFAULT_SEEDS,
      execution_schedule_identity: scheduleIdentity,
      total_ticks: totalTicks,
      snapshot_every_ticks: snapshotEveryTicks,
    },
    parity: {
      direct_vs_worker_byte_equivalent: true,
      task_id: firstTask.taskId,
      sample_count: directResult.samples.length,
    },
    multicore: {
      logical_cpu_count: logicalCpuCount,
      configured_worker_count: workerCount,
      observed_worker_thread_ids: [...workerThreadIds].sort(
        (left, right) => left - right,
      ),
      distinct_worker_thread_count: workerThreadIds.size,
    },
    resume: {
      committed_trajectory_count: plan.trajectoryCount,
      resumed_trajectory_count:
        resumedReport.resumedTrajectoryCount,
      reexecuted_trajectory_count: resumedExecutionCount,
    },
    runtime: {
      duration_seconds: durationSeconds,
      process_cpu_seconds: cpuSeconds,
      process_cpu_user_seconds: cpu.user / 1_000_000,
      process_cpu_system_seconds: cpu.system / 1_000_000,
      initial_rss_bytes: initialRssBytes,
      peak_rss_bytes: peakRssBytes,
      final_rss_bytes: finalRssBytes,
    },
    durable_output: {
      plan_digest: finalization.planDigest,
      dataset_digest: finalization.datasetDigest,
      trajectory_count: finalization.summary.trajectoryCount,
      sample_count: finalization.summary.sampleCount,
      artifact_integrity_verified: true,
      dataset_path: datasetPath,
    },
  });
  writeJsonAtomically(compactResultPath, compactResult);
  writeJsonAtomically(
    join(dataDir, "run-report.json"),
    {
      runReport,
      resumedReport,
      compactResult,
    },
  );

  process.stdout.write(
    JSON.stringify(compactResult, null, 2) + "\n",
  );
}

await main();
