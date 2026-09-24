import {
  ExperimentBundleError,
  parseExperimentBundle,
  serializeExperimentBundle,
  type ExperimentBundle,
  type ExperimentBundleErrorCode,
} from "../sim/experimentBundle";

export const EXPERIMENT_BUNDLE_FILE_MIME = "application/json" as const;

export interface ExperimentBundleIdentitySummary {
  readonly authority: ExperimentBundle["authority"];
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly seed: number;
  readonly parameterSetId: string | null;
  readonly parameterSetVersion: string | null;
  readonly parameterSetBinding:
    | Readonly<{
        readonly authority: string;
        readonly parameterSetId: string;
        readonly parameterSetVersion: string;
        readonly configurationFingerprint: string;
      }>
    | null;
  readonly originTick: number;
  readonly originSimulationTimeHours: number;
  readonly originCommandCount: number;
  readonly replayCommandCount: number;
  readonly replayCompatibility: "compatible-current-runtime";
}

export interface ExperimentBundleExportFile {
  readonly filename: string;
  readonly mimeType: typeof EXPERIMENT_BUNDLE_FILE_MIME;
  readonly text: string;
  readonly summary: ExperimentBundleIdentitySummary;
}

export type ExperimentBundleImportRefusalCategory =
  | "malformed-file"
  | "unsupported-bundle"
  | "runtime-incompatible"
  | "invalid-authority";

export interface ExperimentBundleImportReady {
  readonly status: "ready";
  readonly bundle: ExperimentBundle;
  readonly summary: ExperimentBundleIdentitySummary;
  /**
   * Presentation-only stale-confirmation guard. It is not cryptographic
   * identity and never enters replay/scientific authority.
   */
  readonly confirmationKey: string;
}

export interface ExperimentBundleImportRefused {
  readonly status: "refused";
  readonly category: ExperimentBundleImportRefusalCategory;
  readonly errorCode: ExperimentBundleErrorCode | null;
  readonly message: string;
}

export type ExperimentBundleImportInspection =
  | ExperimentBundleImportReady
  | ExperimentBundleImportRefused;

export type ExperimentBundleReplacementPlan =
  | {
      readonly status: "confirmation-required";
      readonly summary: ExperimentBundleIdentitySummary;
      readonly confirmationKey: string;
    }
  | {
      readonly status: "replace-run";
      readonly bundle: ExperimentBundle;
      readonly summary: ExperimentBundleIdentitySummary;
    };

/**
 * Prepares an offline-local export using the simulation-owned canonical bundle
 * serializer. This module never defines a second export schema.
 */
export function prepareExperimentBundleExport(
  bundle: ExperimentBundle,
): ExperimentBundleExportFile {
  const text = serializeExperimentBundle(bundle);
  return Object.freeze({
    filename: safeExperimentFilename(bundle),
    mimeType: EXPERIMENT_BUNDLE_FILE_MIME,
    text,
    summary: summarizeExperimentBundle(bundle),
  });
}

/**
 * Parses and validates untrusted file text through the one authoritative parser
 * before any runtime-replacement plan can exist.
 */
export function inspectExperimentBundleImport(
  text: string,
): ExperimentBundleImportInspection {
  try {
    const bundle = parseExperimentBundle(text);
    const summary = summarizeExperimentBundle(bundle);
    return Object.freeze({
      status: "ready",
      bundle,
      summary,
      confirmationKey: replacementConfirmationKey(bundle),
    });
  } catch (error) {
    return importRefusal(error);
  }
}

/**
 * Requires explicit confirmation for destructive run replacement.
 *
 * Calling this helper with an unconfirmed or stale key never emits a
 * replacement plan. A successful plan carries the exact parsed bundle; the
 * caller must construct a fresh runtime/replay scope rather than mutate the
 * active run in place.
 */
export function planExperimentBundleReplacement(args: {
  readonly inspection: ExperimentBundleImportInspection;
  readonly confirmed: boolean;
  readonly confirmationKey?: string;
}): ExperimentBundleReplacementPlan | ExperimentBundleImportRefused {
  if (args.inspection.status === "refused") return args.inspection;

  if (
    !args.confirmed ||
    args.confirmationKey !== args.inspection.confirmationKey
  ) {
    return Object.freeze({
      status: "confirmation-required",
      summary: args.inspection.summary,
      confirmationKey: args.inspection.confirmationKey,
    });
  }

  return Object.freeze({
    status: "replace-run",
    bundle: args.inspection.bundle,
    summary: args.inspection.summary,
  });
}

export function summarizeExperimentBundle(
  bundle: ExperimentBundle,
): ExperimentBundleIdentitySummary {
  const binding = bundle.identity.parameterSetBinding;
  return Object.freeze({
    authority: bundle.authority,
    scenarioId: bundle.identity.scenarioId,
    scenarioVersion: bundle.identity.scenarioVersion,
    seed: bundle.identity.seed,
    parameterSetId: bundle.identity.parameterSetId ?? null,
    parameterSetVersion: bundle.identity.parameterSetVersion ?? null,
    parameterSetBinding:
      binding === undefined
        ? null
        : Object.freeze({
            authority: binding.authority,
            parameterSetId: binding.parameterSetId,
            parameterSetVersion: binding.parameterSetVersion,
            configurationFingerprint: binding.configurationFingerprint,
          }),
    originTick: bundle.replay.originCheckpoint.tick,
    originSimulationTimeHours:
      bundle.replay.originCheckpoint.simulationTimeHours,
    originCommandCount: bundle.replay.originCheckpoint.commandCount,
    replayCommandCount: bundle.replay.commands.length,
    replayCompatibility: "compatible-current-runtime",
  });
}

function importRefusal(error: unknown): ExperimentBundleImportRefused {
  if (!(error instanceof ExperimentBundleError)) {
    return Object.freeze({
      status: "refused",
      category: "invalid-authority",
      errorCode: null,
      message:
        "This experiment file could not be validated. The active run was not changed.",
    });
  }

  const category = refusalCategory(error.code);
  return Object.freeze({
    status: "refused",
    category,
    errorCode: error.code,
    message: refusalMessage(category),
  });
}

function refusalCategory(
  code: ExperimentBundleErrorCode,
): ExperimentBundleImportRefusalCategory {
  if (code === "malformed-json") return "malformed-file";
  if (
    code === "unsupported-kind" ||
    code === "unsupported-schema" ||
    code === "unsupported-replay-policy" ||
    code === "counterfactual-ancestry-unsupported" ||
    code === "capability-claim-invalid"
  ) {
    return "unsupported-bundle";
  }
  if (
    code === "runtime-incompatible" ||
    code === "authority-mismatch" ||
    code === "identity-mismatch" ||
    code === "config-required" ||
    code === "config-forbidden" ||
    code === "config-binding-mismatch"
  ) {
    return "runtime-incompatible";
  }
  return "invalid-authority";
}

function refusalMessage(
  category: ExperimentBundleImportRefusalCategory,
): string {
  if (category === "malformed-file") {
    return "This file is not valid Petra experiment JSON. The active run was not changed.";
  }
  if (category === "unsupported-bundle") {
    return "This Petra experiment uses a bundle version or capability this build does not support. The active run was not changed.";
  }
  if (category === "runtime-incompatible") {
    return "This experiment is not replay-compatible with the current Petra runtime or run identity. The active run was not changed.";
  }
  return "This experiment bundle contains invalid authoritative data. The active run was not changed.";
}

function replacementConfirmationKey(bundle: ExperimentBundle): string {
  const binding = bundle.identity.parameterSetBinding;
  const commandIdentity = bundle.replay.commands
    .map((command) => `${command.type}:${command.id}`)
    .join(",");
  return [
    bundle.authority,
    bundle.identity.engineVersion,
    bundle.identity.protocolVersion,
    bundle.identity.scenarioId,
    bundle.identity.scenarioVersion,
    bundle.identity.seed,
    bundle.identity.parameterSetId ?? "",
    bundle.identity.parameterSetVersion ?? "",
    binding?.configurationFingerprint ?? "",
    bundle.replay.originCheckpoint.tick,
    bundle.replay.originCheckpoint.commandCount,
    commandIdentity,
  ].join("|");
}

function safeExperimentFilename(bundle: ExperimentBundle): string {
  const scenario = bundle.identity.scenarioId
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const safeScenario = scenario.length === 0 ? "experiment" : scenario;
  return `petra-${safeScenario}-seed-${bundle.identity.seed}.petra.json`;
}
