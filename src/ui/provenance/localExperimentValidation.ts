import type {
  ScenarioValidationDimension,
  ScenarioValidationEvidenceKind,
  ScenarioValidationEvidenceRecord,
} from "./validationStatus";

const RESULT_LOCATOR_PREFIX = "experiments/results/";
const RESULT_RUN_ID_PATTERN = /^\d{8}T\d{12}Z$/;
const EXPERIMENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const LOCAL_EXPERIMENT_RUNNER_STATUSES = new Set([
  "passed",
  "failed",
  "error",
  "timeout",
]);

export interface LocalExperimentValidationBinding {
  readonly recordId: string;
  readonly experimentId: string;
  readonly dimension: ScenarioValidationDimension;
  readonly evidenceKind: ScenarioValidationEvidenceKind;
  readonly summary: string;
  readonly locator: string;
}

interface LocalExperimentResultRecord {
  readonly id: string;
  readonly status: "passed" | "failed" | "error" | "timeout";
  readonly return_code: number | null;
  readonly error: string | null;
  readonly compact_result?: unknown;
}

interface BlockedCompactResult {
  readonly schema_version: 1;
  readonly experiment_id: string;
  readonly status: "blocked";
  readonly blocked_on_issues: readonly number[];
  readonly reason: string;
  readonly next_action: string;
}

/**
 * Convert one Git-tracked local-experiment result into one explicit validation
 * evidence record.
 *
 * The caller still owns scientific meaning: dimension, evidence kind and
 * summary are never inferred from the experiment id, issues, log text or
 * compact payload. This adapter only validates result identity/execution state
 * and recognizes Petra's canonical experiments/blocked.py placeholder.
 */
export function projectLocalExperimentValidationEvidence(
  resultJson: string,
  binding: LocalExperimentValidationBinding,
): ScenarioValidationEvidenceRecord {
  assertCanonicalText("validation record id", binding.recordId);
  assertCanonicalText("experiment id", binding.experimentId);
  if (!EXPERIMENT_ID_PATTERN.test(binding.experimentId)) {
    throw new Error("experiment id must use Petra manifest id syntax");
  }
  assertCanonicalText("validation summary", binding.summary);
  assertResultLocator(binding.locator, binding.experimentId);

  let parsed: unknown;
  try {
    parsed = JSON.parse(resultJson);
  } catch {
    throw new Error("local experiment result must be valid JSON");
  }

  const result = parseLocalExperimentResult(parsed);
  if (result.id !== binding.experimentId) {
    throw new Error(
      `local experiment result id ${result.id} does not match expected experiment ${binding.experimentId}`,
    );
  }

  const blocked = parseBlockedCompactResult(result);
  if (blocked !== null) {
    return {
      id: binding.recordId,
      dimension: binding.dimension,
      evidenceKind: binding.evidenceKind,
      status: "blocked",
      summary: binding.summary,
      locator: binding.locator,
      blocker: formatBlockedReason(blocked),
    };
  }

  return {
    id: binding.recordId,
    dimension: binding.dimension,
    evidenceKind: binding.evidenceKind,
    status: result.status === "passed" ? "passed" : "failed",
    summary: binding.summary,
    locator: binding.locator,
  };
}

function parseLocalExperimentResult(value: unknown): LocalExperimentResultRecord {
  const record = requireRecord(value, "local experiment result");
  const id = requireCanonicalText(record.id, "local experiment result id");
  const status = requireCanonicalText(
    record.status,
    "local experiment result status",
  );
  if (!LOCAL_EXPERIMENT_RUNNER_STATUSES.has(status)) {
    throw new Error(`unsupported local experiment runner status: ${status}`);
  }

  const returnCode = record.return_code;
  if (
    returnCode !== null &&
    (!Number.isSafeInteger(returnCode) || typeof returnCode !== "number")
  ) {
    throw new Error("local experiment return_code must be a safe integer or null");
  }

  const error = record.error;
  if (error !== null && typeof error !== "string") {
    throw new Error("local experiment error must be a string or null");
  }
  if (typeof error === "string") {
    assertCanonicalText("local experiment error", error);
  }

  assertRunnerOutcomeConsistency(
    status as LocalExperimentResultRecord["status"],
    returnCode as number | null,
    error as string | null,
  );

  return {
    id,
    status: status as LocalExperimentResultRecord["status"],
    return_code: returnCode as number | null,
    error: error as string | null,
    compact_result: record.compact_result,
  };
}

function parseBlockedCompactResult(
  result: LocalExperimentResultRecord,
): BlockedCompactResult | null {
  const compact = result.compact_result;
  if (compact === null || compact === undefined) return null;
  if (typeof compact !== "object" || Array.isArray(compact)) return null;

  const record = compact as Record<string, unknown>;
  if (record.status !== "blocked") return null;

  if (
    result.status !== "failed" ||
    result.return_code !== 2 ||
    result.error !== null
  ) {
    throw new Error(
      "blocked local experiment evidence must come from the canonical failed exit-2 placeholder",
    );
  }

  const expectedKeys = new Set([
    "schema_version",
    "experiment_id",
    "status",
    "blocked_on_issues",
    "reason",
    "next_action",
  ]);
  const keys = Object.keys(record);
  if (
    keys.length !== expectedKeys.size ||
    keys.some((key) => !expectedKeys.has(key))
  ) {
    throw new Error("blocked compact result has an unsupported shape");
  }
  if (record.schema_version !== 1) {
    throw new Error("blocked compact result schema_version must be 1");
  }

  const experimentId = requireCanonicalText(
    record.experiment_id,
    "blocked compact experiment_id",
  );
  if (experimentId !== result.id) {
    throw new Error(
      "blocked compact experiment_id must match the local experiment result id",
    );
  }

  if (!Array.isArray(record.blocked_on_issues) || record.blocked_on_issues.length === 0) {
    throw new Error("blocked compact result must name at least one blocking issue");
  }
  const seenIssues = new Set<number>();
  const blockers = record.blocked_on_issues.map((value, index) => {
    if (
      typeof value !== "number" ||
      !Number.isSafeInteger(value) ||
      value <= 0
    ) {
      throw new Error(
        `blocked issue at index ${index} must be a positive safe integer`,
      );
    }
    if (seenIssues.has(value)) {
      throw new Error(`duplicate blocked issue: #${value}`);
    }
    seenIssues.add(value);
    return value;
  });

  const reason = requireCanonicalText(record.reason, "blocked compact reason");
  const nextAction = requireCanonicalText(
    record.next_action,
    "blocked compact next_action",
  );

  return {
    schema_version: 1,
    experiment_id: experimentId,
    status: "blocked",
    blocked_on_issues: blockers,
    reason,
    next_action: nextAction,
  };
}

function assertResultLocator(locator: string, experimentId: string): void {
  assertCanonicalText("validation evidence locator", locator);
  if (!locator.startsWith(RESULT_LOCATOR_PREFIX)) {
    throw new Error(
      "local experiment validation locator must live under experiments/results/",
    );
  }

  const relative = locator.slice(RESULT_LOCATOR_PREFIX.length);
  const pieces = relative.split("/");
  if (
    pieces.length !== 2 ||
    !RESULT_RUN_ID_PATTERN.test(pieces[0] ?? "") ||
    pieces[1] !== `${experimentId}.json`
  ) {
    throw new Error(
      "local experiment validation locator must identify the exact per-experiment result JSON",
    );
  }
}

function assertRunnerOutcomeConsistency(
  status: LocalExperimentResultRecord["status"],
  returnCode: number | null,
  error: string | null,
): void {
  if (status === "passed") {
    if (returnCode !== 0 || error !== null) {
      throw new Error(
        "passed local experiment evidence requires return_code 0 and no runner error",
      );
    }
    return;
  }

  if (status === "error" || status === "timeout") {
    if (returnCode !== null || error === null) {
      throw new Error(
        `${status} local experiment evidence requires no return code and an explicit runner error`,
      );
    }
    return;
  }

  if ((returnCode === null || returnCode === 0) && error === null) {
    throw new Error(
      "failed local experiment evidence requires a nonzero return code or explicit runner error",
    );
  }
}

function formatBlockedReason(result: BlockedCompactResult): string {
  const issues = result.blocked_on_issues.map((issue) => `#${issue}`).join(", ");
  return `Blocked on ${issues}: ${result.reason}`;
}

function requireRecord(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireCanonicalText(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string`);
  }
  assertCanonicalText(label, value);
  return value;
}

function assertCanonicalText(label: string, value: string): void {
  if (value.length === 0 || value.trim() !== value) {
    throw new Error(`${label} must be a canonical non-empty string`);
  }
}
