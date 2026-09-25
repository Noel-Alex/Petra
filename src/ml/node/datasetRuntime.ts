import { mkdirSync } from "node:fs";
import { relative, resolve, join } from "node:path";
import { performance } from "node:perf_hooks";

import {
  IncrementalMechanisticDatasetCollector,
  type MechanisticDatasetFinalization,
} from "../incrementalGenerator";
import { validatePlanForCollection } from "../generator";
import {
  runMechanisticSweep,
  type MechanisticSweepRunReport,
} from "../runner";
import type { MechanisticSweepPlan } from "../sweep";
import {
  FilesystemMechanisticFinalOutput,
  FilesystemMechanisticStagingStore,
} from "./filesystemStore.mjs";
import { WorkerThreadMechanisticExecutor } from "./workerThreadExecutor.mjs";

export const NODE_MECHANISTIC_DATASET_PACKAGE_SCHEMA_VERSION =
  "petra-ml-node-dataset-package-v1" as const;
export const NODE_MECHANISTIC_DATASET_RESULT_SCHEMA_VERSION =
  "petra-ml-node-dataset-run-result-v1" as const;

export interface NodeMechanisticDatasetPackage<TExecutorData = unknown> {
  readonly schemaVersion: typeof NODE_MECHANISTIC_DATASET_PACKAGE_SCHEMA_VERSION;
  /**
   * Stable engineering identity for this executable package. It is not a
   * biological parameter identity and never substitutes for the sweep plan.
   */
  readonly packageId: string;
  readonly plan: MechanisticSweepPlan;
  /**
   * Local bundled worker module exporting executeMechanisticTask(task, data).
   * The package module owns the scientific projection code; the generic runtime
   * only executes the already-declared plan.
   */
  readonly executorModuleUrl: string;
  readonly executorData: TExecutorData;
  readonly outputBaseName: string;
  readonly evidenceBoundary: string;
}

export interface NodeMechanisticDatasetRuntimeOptions {
  readonly artifactDirectory: string;
  readonly maxWorkers: number;
}

export interface NodeMechanisticDatasetRunMetrics {
  readonly durationMilliseconds: number;
  readonly processCpuUserMicroseconds: number;
  readonly processCpuSystemMicroseconds: number;
  readonly processRssBeforeBytes: number;
  readonly processRssAfterBytes: number;
}

export interface NodeMechanisticDatasetRunResult {
  readonly schemaVersion: typeof NODE_MECHANISTIC_DATASET_RESULT_SCHEMA_VERSION;
  readonly packageId: string;
  readonly status: "completed" | "incomplete";
  readonly evidenceBoundary: string;
  readonly planDigest: string;
  readonly workerCount: number;
  readonly runReport: MechanisticSweepRunReport;
  readonly metrics: NodeMechanisticDatasetRunMetrics;
  readonly dataset:
    | {
        readonly finalized: false;
      }
    | {
        readonly finalized: true;
        readonly datasetRelativePath: string;
        readonly finalizationRelativePath: string;
        readonly datasetDigest: string;
        readonly summary: MechanisticDatasetFinalization["summary"];
      };
}

/**
 * Validate the executable package boundary without deriving any scientific
 * values. Biology, run-condition choice, projection, and sweep design remain
 * package-owned; this runtime only validates exact identities and local-worker
 * execution constraints.
 */
export function validateNodeMechanisticDatasetPackage(
  candidate: NodeMechanisticDatasetPackage,
): void {
  if (
    candidate === null ||
    typeof candidate !== "object" ||
    Array.isArray(candidate)
  ) {
    throw new TypeError("node mechanistic dataset package must be an object");
  }
  if (
    candidate.schemaVersion !== NODE_MECHANISTIC_DATASET_PACKAGE_SCHEMA_VERSION
  ) {
    throw new RangeError("unsupported node mechanistic dataset package version");
  }

  requireSafeName("packageId", candidate.packageId);
  requireSafeName("outputBaseName", candidate.outputBaseName);
  requireCanonicalText("evidenceBoundary", candidate.evidenceBoundary);
  validatePlanForCollection(candidate.plan);

  let executorUrl: URL;
  try {
    executorUrl = new URL(candidate.executorModuleUrl);
  } catch {
    throw new TypeError("executorModuleUrl must be an absolute URL");
  }
  if (executorUrl.protocol !== "file:") {
    throw new TypeError(
      "executorModuleUrl must be a local file: URL; dataset generation cannot require network worker code",
    );
  }

  try {
    structuredClone(candidate.executorData);
  } catch (error) {
    throw new TypeError(
      `executorData must be structured-cloneable: ${normalizeErrorMessage(error)}`,
    );
  }
}

export async function runNodeMechanisticDatasetPackage(
  candidate: NodeMechanisticDatasetPackage,
  options: NodeMechanisticDatasetRuntimeOptions,
): Promise<NodeMechanisticDatasetRunResult> {
  validateNodeMechanisticDatasetPackage(candidate);
  validateRuntimeOptions(options);

  const artifactDirectory = resolve(options.artifactDirectory);
  const packageDirectory = join(artifactDirectory, candidate.packageId);
  const stagingDirectory = join(packageDirectory, "staging");
  const outputDirectory = join(packageDirectory, "output");
  mkdirSync(stagingDirectory, { recursive: true });
  mkdirSync(outputDirectory, { recursive: true });

  const staging = new FilesystemMechanisticStagingStore(stagingDirectory);
  const collector = new IncrementalMechanisticDatasetCollector(
    candidate.plan,
    staging,
  );
  const workerCount = Math.min(
    options.maxWorkers,
    candidate.plan.tasks.length,
  );
  if (workerCount < 1) {
    throw new RangeError("node mechanistic dataset package has no runnable tasks");
  }

  const executor = new WorkerThreadMechanisticExecutor({
    maxWorkers: workerCount,
    executorModuleUrl: candidate.executorModuleUrl,
    executorData: structuredClone(candidate.executorData),
  });

  const cpuStart = process.cpuUsage();
  const rssBefore = validatedRss();
  const started = performance.now();
  let runReport: MechanisticSweepRunReport;
  try {
    runReport = await runMechanisticSweep(
      candidate.plan,
      collector,
      executor,
      { maxConcurrency: workerCount },
    );
  } finally {
    await executor.dispose();
  }
  const durationMilliseconds = performance.now() - started;
  const cpu = process.cpuUsage(cpuStart);
  const rssAfter = validatedRss();
  const metrics = Object.freeze({
    durationMilliseconds,
    processCpuUserMicroseconds: cpu.user,
    processCpuSystemMicroseconds: cpu.system,
    processRssBeforeBytes: rssBefore,
    processRssAfterBytes: rssAfter,
  });

  if (runReport.failedTrajectoryCount > 0) {
    return Object.freeze({
      schemaVersion: NODE_MECHANISTIC_DATASET_RESULT_SCHEMA_VERSION,
      packageId: candidate.packageId,
      status: "incomplete",
      evidenceBoundary: candidate.evidenceBoundary,
      planDigest: collector.planDigest,
      workerCount,
      runReport,
      metrics,
      dataset: Object.freeze({ finalized: false as const }),
    });
  }

  if (!collector.progress.complete) {
    throw new Error(
      "mechanistic sweep reported no failures but durable staging is incomplete",
    );
  }

  const output = new FilesystemMechanisticFinalOutput(
    outputDirectory,
    candidate.outputBaseName,
  );
  const finalization = collector.finalize(output);
  const datasetPath = join(
    outputDirectory,
    candidate.outputBaseName + ".jsonl",
  );
  const finalizationPath = join(
    outputDirectory,
    candidate.outputBaseName + ".finalization.json",
  );

  return Object.freeze({
    schemaVersion: NODE_MECHANISTIC_DATASET_RESULT_SCHEMA_VERSION,
    packageId: candidate.packageId,
    status: "completed",
    evidenceBoundary: candidate.evidenceBoundary,
    planDigest: collector.planDigest,
    workerCount,
    runReport,
    metrics,
    dataset: Object.freeze({
      finalized: true as const,
      datasetRelativePath: relative(artifactDirectory, datasetPath),
      finalizationRelativePath: relative(
        artifactDirectory,
        finalizationPath,
      ),
      datasetDigest: finalization.datasetDigest,
      summary: structuredClone(finalization.summary),
    }),
  });
}

function validateRuntimeOptions(
  options: NodeMechanisticDatasetRuntimeOptions,
): void {
  if (options === null || typeof options !== "object") {
    throw new TypeError("node mechanistic dataset runtime options must be an object");
  }
  requireCanonicalText("artifactDirectory", options.artifactDirectory);
  if (!Number.isSafeInteger(options.maxWorkers) || options.maxWorkers < 1) {
    throw new RangeError("maxWorkers must be a positive safe integer");
  }
}

function requireSafeName(name: string, value: unknown): asserts value is string {
  requireCanonicalText(name, value);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) {
    throw new TypeError(
      `${name} must be a simple filesystem-safe identifier`,
    );
  }
}

function requireCanonicalText(
  name: string,
  value: unknown,
): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value !== value.trim()
  ) {
    throw new TypeError(`${name} must be a canonical non-empty string`);
  }
}

function validatedRss(): number {
  const rss = process.memoryUsage().rss;
  if (!Number.isSafeInteger(rss) || rss < 0) {
    throw new RangeError("process RSS must be a non-negative safe integer");
  }
  return rss;
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  return String(error);
}
