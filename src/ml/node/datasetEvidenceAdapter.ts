import { isAbsolute, relative, resolve } from "node:path";

import {
  buildMechanisticDatasetGenerationEvidence,
  type MechanisticDatasetGenerationEvidence,
} from "../datasetEvidence";
import type { MechanisticDatasetFinalization } from "../incrementalGenerator";
import type { MechanisticSweepPlan } from "../sweep";
import {
  readFilesystemDatasetLines,
  readFilesystemFinalization,
} from "./filesystemStore.mjs";
import type { NodeMechanisticDatasetRunResult } from "./datasetRuntime";


export interface BuildNodeMechanisticDatasetEvidenceArgs {
  readonly artifactDirectory: string;
  readonly plan: MechanisticSweepPlan;
  readonly result: NodeMechanisticDatasetRunResult;
  readonly engineCommit: string;
  readonly repositoryDirty: boolean;
  readonly logicalCpuCount: number;
}

export function buildNodeMechanisticDatasetGenerationEvidence(
  args: BuildNodeMechanisticDatasetEvidenceArgs,
): MechanisticDatasetGenerationEvidence {
  if (args.result.planDigest !== args.result.runReport.planDigest) {
    throw new TypeError(
      "node dataset result plan digest does not match its run report",
    );
  }

  const runtime = Object.freeze({
    durationSeconds: requireDurationSeconds(
      args.result.metrics.durationMilliseconds,
    ),
    logicalCpuCount: requirePositiveSafeInteger(
      "logicalCpuCount",
      args.logicalCpuCount,
    ),
    workerCount: requirePositiveSafeInteger(
      "workerCount",
      args.result.workerCount,
    ),
  });

  if (args.result.status === "incomplete") {
    if (args.result.dataset.finalized) {
      throw new TypeError(
        "incomplete node dataset result must not publish finalized dataset metadata",
      );
    }
    return buildMechanisticDatasetGenerationEvidence({
      plan: args.plan,
      runReport: args.result.runReport,
      engineCommit: args.engineCommit,
      repositoryDirty: args.repositoryDirty,
      runtime,
    });
  }

  if (args.result.status !== "completed" || !args.result.dataset.finalized) {
    throw new TypeError(
      "completed node dataset result requires finalized dataset metadata",
    );
  }

  const datasetPath = resolveArtifactFile(
    args.artifactDirectory,
    args.result.dataset.datasetRelativePath,
    "datasetRelativePath",
  );
  const finalizationPath = resolveArtifactFile(
    args.artifactDirectory,
    args.result.dataset.finalizationRelativePath,
    "finalizationRelativePath",
  );
  const finalization = readFilesystemFinalization(
    finalizationPath,
  ) as MechanisticDatasetFinalization;

  if (finalization.datasetDigest !== args.result.dataset.datasetDigest) {
    throw new TypeError(
      "node dataset result digest does not match published finalization metadata",
    );
  }

  return buildMechanisticDatasetGenerationEvidence({
    plan: args.plan,
    runReport: args.result.runReport,
    engineCommit: args.engineCommit,
    repositoryDirty: args.repositoryDirty,
    runtime,
    finalization,
    datasetLines: () => readFilesystemDatasetLines(datasetPath),
  });
}

function resolveArtifactFile(
  artifactDirectory: string,
  relativePath: string,
  fieldName: string,
): string {
  requireCanonicalText("artifactDirectory", artifactDirectory);
  requireCanonicalText(fieldName, relativePath);
  if (isAbsolute(relativePath)) {
    throw new TypeError(`${fieldName} must be relative to the artifact directory`);
  }

  const root = resolve(artifactDirectory);
  const target = resolve(root, relativePath);
  const rel = relative(root, target);
  if (
    rel.length === 0 ||
    rel === ".." ||
    rel.startsWith("../") ||
    rel.startsWith("..\\") ||
    isAbsolute(rel)
  ) {
    throw new TypeError(`${fieldName} escapes the artifact directory`);
  }
  return target;
}

function requireDurationSeconds(durationMilliseconds: number): number {
  if (!Number.isFinite(durationMilliseconds) || durationMilliseconds < 0) {
    throw new RangeError(
      "node dataset durationMilliseconds must be finite and non-negative",
    );
  }
  return durationMilliseconds / 1000;
}

function requirePositiveSafeInteger(name: string, value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
  return value;
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
