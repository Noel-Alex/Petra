import { isAbsolute, relative, resolve, sep } from "node:path";

import {
  buildMechanisticDatasetGenerationEvidence,
  type MechanisticDatasetGenerationEvidence,
} from "../datasetEvidence";
import { canonicalJson } from "../generator";
import { mechanisticIncrementalPlanDigest } from "../incrementalGenerator";
import {
  validateNodeMechanisticDatasetPackage,
  type NodeMechanisticDatasetPackage,
  type NodeMechanisticDatasetRunResult,
} from "./datasetRuntime";
import {
  readFilesystemFinalization,
  readFilesystemUtf8Lines,
} from "./filesystemStore.mjs";

export interface NodeMechanisticDatasetEvidenceOptions {
  readonly artifactDirectory: string;
  readonly engineCommit: string;
  readonly repositoryDirty: boolean;
  readonly logicalCpuCount: number;
}

/**
 * Bind one generic Node dataset execution result to Petra's compact generation
 * evidence contract. Finalized JSONL is reopened for each verification pass;
 * the dataset is never materialized as one in-memory string/array here.
 */
export function buildNodeMechanisticDatasetGenerationEvidence(
  datasetPackage: NodeMechanisticDatasetPackage,
  result: NodeMechanisticDatasetRunResult,
  options: NodeMechanisticDatasetEvidenceOptions,
): MechanisticDatasetGenerationEvidence {
  validateNodeMechanisticDatasetPackage(datasetPackage);
  requireCanonicalText("artifactDirectory", options.artifactDirectory);
  requirePositiveSafeInteger("logicalCpuCount", options.logicalCpuCount);

  if (result.packageId !== datasetPackage.packageId) {
    throw new TypeError("dataset runtime result belongs to a different package");
  }

  const planDigest = mechanisticIncrementalPlanDigest(datasetPackage.plan);
  if (result.planDigest !== planDigest) {
    throw new TypeError("dataset runtime result belongs to a different sweep plan");
  }

  const runtime = Object.freeze({
    durationSeconds: result.metrics.durationMilliseconds / 1000,
    logicalCpuCount: options.logicalCpuCount,
    workerCount: result.workerCount,
  });

  if (result.status === "incomplete") {
    if (result.dataset.finalized) {
      throw new TypeError("incomplete dataset runtime result cannot be finalized");
    }
    return buildMechanisticDatasetGenerationEvidence({
      plan: datasetPackage.plan,
      runReport: result.runReport,
      engineCommit: options.engineCommit,
      repositoryDirty: options.repositoryDirty,
      runtime,
    });
  }

  if (result.status !== "completed" || !result.dataset.finalized) {
    throw new TypeError("completed dataset runtime result must be finalized");
  }

  const root = resolve(options.artifactDirectory);
  const datasetPath = resolveContainedArtifactFile(
    root,
    result.dataset.datasetRelativePath,
    "datasetRelativePath",
  );
  const finalizationPath = resolveContainedArtifactFile(
    root,
    result.dataset.finalizationRelativePath,
    "finalizationRelativePath",
  );
  const finalization = readFilesystemFinalization(finalizationPath);

  if (finalization.datasetDigest !== result.dataset.datasetDigest) {
    throw new TypeError("dataset runtime digest does not match finalization");
  }
  if (canonicalJson(finalization.summary) !== canonicalJson(result.dataset.summary)) {
    throw new TypeError("dataset runtime summary does not match finalization");
  }

  return buildMechanisticDatasetGenerationEvidence({
    plan: datasetPackage.plan,
    runReport: result.runReport,
    engineCommit: options.engineCommit,
    repositoryDirty: options.repositoryDirty,
    runtime,
    finalization,
    datasetLines: () => readFilesystemUtf8Lines(datasetPath),
  });
}

function resolveContainedArtifactFile(
  root: string,
  relativePath: string,
  name: string,
): string {
  requireCanonicalText(name, relativePath);
  if (isAbsolute(relativePath)) {
    throw new TypeError(`${name} must be relative to the artifact directory`);
  }
  const path = resolve(root, relativePath);
  const relation = relative(root, path);
  if (
    relation.length === 0 ||
    relation === ".." ||
    relation.startsWith(`..${sep}`) ||
    isAbsolute(relation)
  ) {
    throw new TypeError(`${name} escapes the artifact directory`);
  }
  return path;
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
    throw new TypeError(`${name} must be canonical non-empty text`);
  }
}

function requirePositiveSafeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
}
