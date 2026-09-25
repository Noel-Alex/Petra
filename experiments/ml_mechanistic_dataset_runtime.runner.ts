import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";

import {
  NODE_MECHANISTIC_DATASET_PACKAGE_SCHEMA_VERSION,
  createNodeMechanisticDatasetWorkerEnvelope,
  runNodeMechanisticDatasetPackage,
  type NodeMechanisticDatasetPackage,
} from "../src/ml/node/datasetRuntime";

const EXPERIMENT_ID = "ml-mechanistic-dataset";

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
): number {
  if (raw === undefined || raw.trim().length === 0) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
  return value;
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
  if (!/^[0-9a-f]{40}$/i.test(commit)) {
    throw new Error("mechanistic dataset runner could not resolve a Git commit");
  }
  return Object.freeze({ commit, dirty });
}

function normalizeFailure(error: unknown): {
  readonly name: string;
  readonly message: string;
} {
  if (error instanceof Error) {
    return Object.freeze({
      name: error.name || "Error",
      message: error.message || "mechanistic dataset runner failed",
    });
  }
  return Object.freeze({
    name: "NonErrorFailure",
    message:
      typeof error === "string" && error.length > 0
        ? error
        : "mechanistic dataset runner failed",
  });
}

async function loadPackage(
  moduleUrl: string,
): Promise<NodeMechanisticDatasetPackage> {
  let parsed: URL;
  try {
    parsed = new URL(moduleUrl);
  } catch {
    throw new TypeError(
      "PETRA_ML_DATASET_PACKAGE_MODULE_URL must be an absolute URL",
    );
  }
  if (parsed.protocol !== "file:") {
    throw new TypeError(
      "mechanistic dataset package module must be a local file: URL",
    );
  }

  const module = await import(/* @vite-ignore */ parsed.href);
  if (typeof module.createNodeMechanisticDatasetPackage !== "function") {
    throw new TypeError(
      "dataset package module must export createNodeMechanisticDatasetPackage()",
    );
  }
  if (
    typeof module.resolveNodeMechanisticDatasetTaskDefinition !== "function"
  ) {
    throw new TypeError(
      "dataset package module must export resolveNodeMechanisticDatasetTaskDefinition(task, executorData)",
    );
  }
  const candidate = await module.createNodeMechanisticDatasetPackage();
  if (
    candidate === null ||
    typeof candidate !== "object" ||
    candidate.schemaVersion !== NODE_MECHANISTIC_DATASET_PACKAGE_SCHEMA_VERSION
  ) {
    throw new TypeError("dataset package module returned an unsupported package");
  }
  return candidate as NodeMechanisticDatasetPackage;
}

async function main(): Promise<void> {
  const artifactDirectory = resolve(requireEnv("PETRA_LOCAL_ARTIFACT_DIR"));
  const resultPath = resolve(requireEnv("PETRA_LOCAL_RESULT_JSON"));
  const packageModuleUrl = requireEnv(
    "PETRA_ML_DATASET_PACKAGE_MODULE_URL",
  );
  const workerModuleUrl = requireEnv(
    "PETRA_ML_DATASET_WORKER_MODULE_URL",
  );
  const cpuCount = Math.max(1, cpus().length);
  const requestedWorkers = positiveSafeInteger(
    "PETRA_ML_DATASET_WORKERS",
    process.env.PETRA_ML_DATASET_WORKERS,
    Math.min(4, cpuCount),
  );
  const maxWorkers = Math.min(requestedWorkers, cpuCount);

  try {
    const datasetPackage = await loadPackage(packageModuleUrl);
    const runtimePackage = {
      ...datasetPackage,
      executorData: createNodeMechanisticDatasetWorkerEnvelope(
        packageModuleUrl,
        datasetPackage.executorData,
      ),
    };
    const result = await runNodeMechanisticDatasetPackage(runtimePackage, {
      artifactDirectory,
      maxWorkers,
      executorModuleUrl: workerModuleUrl,
    });
    const source = sourceState();
    writeJsonAtomically(resultPath, {
      experiment_id: EXPERIMENT_ID,
      source: {
        commit: source.commit,
        repository_dirty: source.dirty,
      },
      ...result,
    });
    if (result.status !== "completed") {
      process.exitCode = 1;
    }
  } catch (error) {
    writeJsonAtomically(resultPath, {
      schema_version: 1,
      experiment_id: EXPERIMENT_ID,
      status: "failed",
      failure: normalizeFailure(error),
      evidence_boundary:
        "Dataset execution failure only; no biological-validation or model-promotion claim.",
    });
    throw error;
  }
}

await main();
