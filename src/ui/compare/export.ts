import {
  assertComposedParameterSetBindingRecord,
  type ComposedParameterSetBinding,
} from "../../sim/parameterSetBinding";
import {
  describeComparison,
  type ComparisonIdentity,
  type CounterfactualBranch,
  type ForkOrigin,
} from "../counterfactual";

export const COUNTERFACTUAL_EXPORT_SCHEMA_VERSION = 2 as const;

export interface CounterfactualReplayContext {
  readonly engineVersion: string;
  readonly protocolVersion: number;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly parameterSetId: string;
  readonly parameterSetVersion: string;
  readonly parameterSetBinding: ComposedParameterSetBinding | null;
}

export interface CounterfactualBranchExport {
  readonly branchId: string;
  readonly label: string;
  readonly origin: ForkOrigin;
  readonly seed: number;
  readonly interventionCommandIds: readonly string[];
}

export interface CounterfactualExportCapabilities {
  /** Full serialized checkpoint bytes/state are owned by the authoritative runtime and are not included here. */
  readonly checkpointPayloadIncluded: false;
  /** Command IDs are preserved in order, but authoritative command payloads are not included here yet. */
  readonly commandPayloadsIncluded: false;
  /** This manifest is audit metadata until authoritative checkpoint + command payload export exists. */
  readonly replayReady: false;
}

export interface CounterfactualExportManifest {
  readonly kind: "petra-counterfactual-export";
  readonly schemaVersion: typeof COUNTERFACTUAL_EXPORT_SCHEMA_VERSION;
  readonly replayContext: CounterfactualReplayContext;
  readonly comparison: ComparisonIdentity;
  readonly branches: {
    readonly left: CounterfactualBranchExport;
    readonly right: CounterfactualBranchExport;
  };
  readonly capabilities: CounterfactualExportCapabilities;
}

/**
 * Creates deterministic, audit-ready metadata for a counterfactual comparison.
 *
 * This deliberately does not pretend to be a complete replay bundle. Exact
 * checkpoint state and authoritative command payloads remain runtime-owned.
 */
export function createCounterfactualExportManifest(args: {
  readonly left: CounterfactualBranch;
  readonly right: CounterfactualBranch;
  readonly replayContext: CounterfactualReplayContext;
}): CounterfactualExportManifest {
  validateReplayContext(args.replayContext);
  validateBranch(args.left);
  validateBranch(args.right);

  const manifest: CounterfactualExportManifest = {
    kind: "petra-counterfactual-export",
    schemaVersion: COUNTERFACTUAL_EXPORT_SCHEMA_VERSION,
    replayContext: {
      ...args.replayContext,
      parameterSetBinding:
        args.replayContext.parameterSetBinding === null
          ? null
          : { ...args.replayContext.parameterSetBinding },
    },
    comparison: { ...describeComparison(args.left, args.right) },
    branches: {
      left: copyBranch(args.left),
      right: copyBranch(args.right),
    },
    capabilities: {
      checkpointPayloadIncluded: false,
      commandPayloadsIncluded: false,
      replayReady: false,
    },
  };

  validateCounterfactualExportManifest(manifest);
  return manifest;
}

export function validateCounterfactualExportManifest(
  manifest: CounterfactualExportManifest,
): void {
  if (manifest.kind !== "petra-counterfactual-export") {
    throw new Error("counterfactual export kind is invalid");
  }
  if (manifest.schemaVersion !== COUNTERFACTUAL_EXPORT_SCHEMA_VERSION) {
    throw new Error("counterfactual export schema version is unsupported");
  }

  validateReplayContext(manifest.replayContext);
  validateBranch(manifest.branches.left);
  validateBranch(manifest.branches.right);

  if (
    manifest.capabilities.checkpointPayloadIncluded !== false ||
    manifest.capabilities.commandPayloadsIncluded !== false ||
    manifest.capabilities.replayReady !== false
  ) {
    throw new Error(
      "metadata-only counterfactual export cannot claim authoritative replay payloads",
    );
  }

  const expected = describeComparison(
    manifest.branches.left,
    manifest.branches.right,
  );
  if (!sameComparisonIdentity(manifest.comparison, expected)) {
    throw new Error(
      "counterfactual export comparison identity does not match branch metadata",
    );
  }
}

/**
 * Stable serializer for the versioned metadata shape.
 *
 * No wall-clock export timestamp is injected so identical authoritative inputs
 * produce identical serialized metadata.
 */
export function serializeCounterfactualExportManifest(
  manifest: CounterfactualExportManifest,
): string {
  validateCounterfactualExportManifest(manifest);

  return JSON.stringify({
    kind: manifest.kind,
    schemaVersion: manifest.schemaVersion,
    replayContext: {
      engineVersion: manifest.replayContext.engineVersion,
      protocolVersion: manifest.replayContext.protocolVersion,
      scenarioId: manifest.replayContext.scenarioId,
      scenarioVersion: manifest.replayContext.scenarioVersion,
      parameterSetId: manifest.replayContext.parameterSetId,
      parameterSetVersion: manifest.replayContext.parameterSetVersion,
      parameterSetBinding:
        manifest.replayContext.parameterSetBinding === null
          ? null
          : {
              schemaVersion:
                manifest.replayContext.parameterSetBinding.schemaVersion,
              authority: manifest.replayContext.parameterSetBinding.authority,
              parameterSetId:
                manifest.replayContext.parameterSetBinding.parameterSetId,
              parameterSetVersion:
                manifest.replayContext.parameterSetBinding.parameterSetVersion,
              configurationFingerprint:
                manifest.replayContext.parameterSetBinding
                  .configurationFingerprint,
            },
    },
    comparison: {
      leftBranchId: manifest.comparison.leftBranchId,
      rightBranchId: manifest.comparison.rightBranchId,
      hasSharedOrigin: manifest.comparison.hasSharedOrigin,
      divergenceCause: manifest.comparison.divergenceCause,
      firstDivergentCommandIndex:
        manifest.comparison.firstDivergentCommandIndex,
    },
    branches: {
      left: canonicalBranch(manifest.branches.left),
      right: canonicalBranch(manifest.branches.right),
    },
    capabilities: {
      checkpointPayloadIncluded: false,
      commandPayloadsIncluded: false,
      replayReady: false,
    },
  });
}

function canonicalBranch(branch: CounterfactualBranchExport) {
  return {
    branchId: branch.branchId,
    label: branch.label,
    origin: {
      sourceRunId: branch.origin.sourceRunId,
      checkpointTraceHash: branch.origin.checkpointTraceHash,
      tick: branch.origin.tick,
      simulationTimeHours: branch.origin.simulationTimeHours,
      commandCount: branch.origin.commandCount,
    },
    seed: branch.seed,
    interventionCommandIds: [...branch.interventionCommandIds],
  };
}

function copyBranch(branch: CounterfactualBranch): CounterfactualBranchExport {
  return {
    branchId: branch.branchId,
    label: branch.label,
    origin: { ...branch.origin },
    seed: branch.seed,
    interventionCommandIds: [...branch.interventionCommandIds],
  };
}

function validateReplayContext(context: CounterfactualReplayContext): void {
  assertNonEmpty(context.engineVersion, "engineVersion");
  if (!Number.isSafeInteger(context.protocolVersion) || context.protocolVersion < 0) {
    throw new RangeError("protocolVersion must be a non-negative safe integer");
  }
  assertNonEmpty(context.scenarioId, "scenarioId");
  assertNonEmpty(context.scenarioVersion, "scenarioVersion");
  assertNonEmpty(context.parameterSetId, "parameterSetId");
  assertNonEmpty(context.parameterSetVersion, "parameterSetVersion");
  if (context.parameterSetBinding !== null) {
    assertComposedParameterSetBindingRecord(context.parameterSetBinding);
    if (context.parameterSetBinding.parameterSetId !== context.parameterSetId) {
      throw new Error(
        "parameterSetBinding.parameterSetId must match parameterSetId",
      );
    }
    if (
      context.parameterSetBinding.parameterSetVersion !==
      context.parameterSetVersion
    ) {
      throw new Error(
        "parameterSetBinding.parameterSetVersion must match parameterSetVersion",
      );
    }
  }
}

function validateBranch(branch: CounterfactualBranchExport): void {
  assertNonEmpty(branch.branchId, "branchId");
  assertNonEmpty(branch.label, "branch label");
  assertNonEmpty(branch.origin.sourceRunId, "sourceRunId");
  assertNonEmpty(branch.origin.checkpointTraceHash, "checkpointTraceHash");

  if (!Number.isSafeInteger(branch.origin.tick) || branch.origin.tick < 0) {
    throw new RangeError("fork tick must be a non-negative safe integer");
  }
  if (
    !Number.isFinite(branch.origin.simulationTimeHours) ||
    branch.origin.simulationTimeHours < 0
  ) {
    throw new RangeError(
      "fork simulationTimeHours must be finite and non-negative",
    );
  }
  if (
    !Number.isSafeInteger(branch.origin.commandCount) ||
    branch.origin.commandCount < 0
  ) {
    throw new RangeError("fork commandCount must be a non-negative safe integer");
  }
  if (!Number.isSafeInteger(branch.seed)) {
    throw new RangeError("branch seed must be a safe integer");
  }

  for (const commandId of branch.interventionCommandIds) {
    assertNonEmpty(commandId, "intervention command id");
  }
}

function sameComparisonIdentity(
  actual: ComparisonIdentity,
  expected: ComparisonIdentity,
): boolean {
  return (
    actual.leftBranchId === expected.leftBranchId &&
    actual.rightBranchId === expected.rightBranchId &&
    actual.hasSharedOrigin === expected.hasSharedOrigin &&
    actual.divergenceCause === expected.divergenceCause &&
    actual.firstDivergentCommandIndex ===
      expected.firstDivergentCommandIndex
  );
}

function assertNonEmpty(value: string, label: string): void {
  if (value.trim().length === 0) {
    throw new RangeError(`${label} must be non-empty`);
  }
}
