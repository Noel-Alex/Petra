import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, relative, resolve } from "node:path";

import {
  buildFirstAggregateBaselineBenchmark,
  FIRST_AGGREGATE_BASELINE_BENCHMARK_SCHEMA_VERSION,
} from "../src/ml/firstAggregateBenchmark";
import {
  createNodeMechanisticDatasetPackage,
  FIRST_AGGREGATE_DATASET_PACKAGE_ID,
  type FirstAggregateDatasetInput,
  type FirstAggregateDatasetTarget,
} from "../src/ml/firstAggregateDatasetPackage";
import {
  canonicalJson,
  type MechanisticDatasetRow,
} from "../src/ml/generator";
import {
  mechanisticIncrementalPlanDigest,
  verifyMechanisticDatasetFinalization,
} from "../src/ml/incrementalGenerator";
import {
  MECHANISTIC_DATASET_EVIDENCE_SCHEMA_VERSION,
  type MechanisticDatasetGenerationEvidence,
} from "../src/ml/datasetEvidence";
import {
  readFilesystemFinalization,
  readFilesystemUtf8Lines,
} from "../src/ml/node/filesystemStore.mjs";

const EXPERIMENT_ID = "ml-aggregate-benchmark";
const GENERATION_EXPERIMENT_ID = "ml-mechanistic-dataset";
const BENCHMARK_EVIDENCE_SCHEMA_VERSION =
  "petra-first-aggregate-benchmark-evidence-v1" as const;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`${name} must be supplied by the local benchmark launcher`);
  }
  return value;
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJsonAtomically(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = path + ".partial";
  writeFileSync(temporary, JSON.stringify(value, null, 2) + "\n", "utf8");
  renameSync(temporary, path);
}

function normalizeFailure(error: unknown): {
  readonly name: string;
  readonly message: string;
} {
  if (error instanceof Error) {
    return Object.freeze({
      name: error.name || "Error",
      message: error.message || "aggregate benchmark failed",
    });
  }
  return Object.freeze({
    name: "NonErrorFailure",
    message:
      typeof error === "string" && error.length > 0
        ? error
        : "aggregate benchmark failed",
  });
}

function requireRecord(
  name: string,
  value: unknown,
): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function validateGenerationEvidence(
  candidate: unknown,
  expectedPlanDigest: string,
  datasetDigest: string,
): MechanisticDatasetGenerationEvidence {
  const root = requireRecord("generation compact result", candidate);
  if (
    root.schema_version !== 1 ||
    root.experiment_id !== GENERATION_EXPERIMENT_ID ||
    root.package_id !== FIRST_AGGREGATE_DATASET_PACKAGE_ID
  ) {
    throw new TypeError(
      "benchmark source must be a first-aggregate dataset produced by Petra's registered generator",
    );
  }
  const evidence = requireRecord(
    "generation evidence",
    root.generation_evidence,
  ) as unknown as MechanisticDatasetGenerationEvidence;
  if (
    evidence.schemaVersion !== MECHANISTIC_DATASET_EVIDENCE_SCHEMA_VERSION ||
    evidence.status !== "complete" ||
    evidence.dataset === null ||
    evidence.artifactIntegrityVerified !== true ||
    evidence.promotionEvidence !== false
  ) {
    throw new TypeError(
      "benchmark source generation evidence is incomplete or not integrity-verified",
    );
  }
  if (
    evidence.plan.planDigest !== expectedPlanDigest ||
    evidence.dataset.datasetDigest !== datasetDigest
  ) {
    throw new TypeError(
      "benchmark source generation evidence does not match finalized dataset identity",
    );
  }
  if (
    evidence.source.repositoryDirty ||
    evidence.source.sourceStateMatchesCommit !== true
  ) {
    throw new TypeError(
      "benchmark source dataset must come from a clean commit-bound generation run",
    );
  }
  return evidence;
}

function sha256Canonical(value: unknown): {
  readonly canonical: string;
  readonly digest: string;
} {
  const canonical = canonicalJson(value);
  return Object.freeze({
    canonical,
    digest: `sha256:${createHash("sha256").update(canonical).digest("hex")}`,
  });
}

function localModelArtifact(
  artifactDirectory: string,
  fileName: string,
  model: unknown,
): {
  readonly schemaVersion: string;
  readonly relativePath: string;
  readonly sha256: string;
} {
  const record = requireRecord("baseline model", model);
  const schemaVersion = record.schemaVersion;
  if (typeof schemaVersion !== "string" || schemaVersion.length === 0) {
    throw new TypeError("baseline model schemaVersion is invalid");
  }
  const encoded = sha256Canonical(model);
  const modelsDirectory = resolve(artifactDirectory, "models");
  mkdirSync(modelsDirectory, { recursive: true });
  const path = resolve(modelsDirectory, fileName);
  writeFileSync(path, encoded.canonical + "\n", "utf8");
  return Object.freeze({
    schemaVersion,
    relativePath: relative(artifactDirectory, path),
    sha256: encoded.digest,
  });
}

async function main(): Promise<void> {
  const artifactDirectory = resolve(requireEnv("PETRA_LOCAL_ARTIFACT_DIR"));
  const resultPath = resolve(requireEnv("PETRA_LOCAL_RESULT_JSON"));
  const datasetPath = resolve(requireEnv("PETRA_ML_BENCHMARK_DATASET_PATH"));
  const finalizationPath = resolve(
    requireEnv("PETRA_ML_BENCHMARK_FINALIZATION_PATH"),
  );
  const generationEvidencePath = resolve(
    requireEnv("PETRA_ML_BENCHMARK_GENERATION_EVIDENCE_PATH"),
  );

  try {
    const datasetPackage = createNodeMechanisticDatasetPackage();
    const expectedDatasetName = datasetPackage.outputBaseName + ".jsonl";
    const expectedFinalizationName =
      datasetPackage.outputBaseName + ".finalization.json";
    if (
      basename(datasetPath) !== expectedDatasetName ||
      basename(finalizationPath) !== expectedFinalizationName ||
      dirname(datasetPath) !== dirname(finalizationPath)
    ) {
      throw new TypeError(
        "benchmark dataset/finalization paths do not match the repository-owned first aggregate package output",
      );
    }

    const finalization = readFilesystemFinalization(finalizationPath);
    const expectedPlanDigest = mechanisticIncrementalPlanDigest(
      datasetPackage.plan,
    );
    if (finalization.planDigest !== expectedPlanDigest) {
      throw new TypeError(
        "benchmark dataset finalization belongs to a different sweep plan",
      );
    }

    const lines = [...readFilesystemUtf8Lines(datasetPath)];
    verifyMechanisticDatasetFinalization(lines, finalization);
    const generationEvidence = validateGenerationEvidence(
      readJson(generationEvidencePath),
      expectedPlanDigest,
      finalization.datasetDigest,
    );

    const rows = lines.map((line, index) => {
      try {
        return JSON.parse(line) as MechanisticDatasetRow<
          FirstAggregateDatasetInput,
          FirstAggregateDatasetTarget
        >;
      } catch (error) {
        throw new TypeError(
          `benchmark dataset row ${index} is invalid JSON: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    });

    const benchmark = buildFirstAggregateBaselineBenchmark({
      datasetDigest: finalization.datasetDigest,
      summary: finalization.summary,
      rows,
    });
    if (
      benchmark.schemaVersion !==
      FIRST_AGGREGATE_BASELINE_BENCHMARK_SCHEMA_VERSION
    ) {
      throw new Error("first aggregate benchmark returned an unsupported result");
    }

    const constantArtifact = localModelArtifact(
      artifactDirectory,
      "constant-baseline.json",
      benchmark.models.constant,
    );
    const ridgeArtifact = localModelArtifact(
      artifactDirectory,
      "ridge-baseline.json",
      benchmark.models.ridge,
    );
    writeJsonAtomically(
      resolve(artifactDirectory, "benchmark-full.json"),
      benchmark,
    );

    writeJsonAtomically(resultPath, {
      schema_version: 1,
      experiment_id: EXPERIMENT_ID,
      status: "completed",
      benchmark_schema_version: benchmark.schemaVersion,
      benchmark_policy_version: benchmark.policyVersion,
      evaluation_policy_version: benchmark.evaluationPolicyVersion,
      dataset: benchmark.dataset,
      source_generation: {
        engine_commit: generationEvidence.source.engineCommit,
        source_state_matches_commit:
          generationEvidence.source.sourceStateMatchesCommit,
        plan_digest: generationEvidence.plan.planDigest,
        worker_count: generationEvidence.runtime?.workerCount ?? null,
        artifact_integrity_verified:
          generationEvidence.artifactIntegrityVerified,
      },
      training: benchmark.training,
      models: {
        constant: constantArtifact,
        ridge: {
          ...ridgeArtifact,
          lambda: benchmark.models.ridge.lambda,
        },
      },
      validation: benchmark.validation,
      test: benchmark.test,
      promotion_evidence: false,
      evidence_boundary:
        "Held-out engineering surrogate baseline evidence over the exact authoritative first-aggregate v2 transition dataset. Constant/ridge models and raw dataset remain local. This does not establish biological validation, physical calibration, OOD safety, or model promotion.",
    });
  } catch (error) {
    writeJsonAtomically(resultPath, {
      schema_version: 1,
      experiment_id: EXPERIMENT_ID,
      status: "failed",
      failure: normalizeFailure(error),
      promotion_evidence: false,
      evidence_boundary:
        "Benchmark execution/integrity failure only; no biological-validation or model-promotion claim.",
    });
    throw error;
  }
}

await main();
