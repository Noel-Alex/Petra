import { describe, expect, it } from "vitest";

import { buildScenarioValidationPresentation } from "./validationStatus";
import { projectLocalExperimentValidationEvidence } from "./localExperimentValidation";

const BLOCKED_RESULT = JSON.stringify({
  command: [
    "python",
    "experiments/blocked.py",
    "--experiment-id",
    "flagship-runtime-smoke",
    "--blocked-on",
    "37",
    "--reason",
    "Issue #37 must land the authoritative composed worker/runtime path before this smoke can exercise real authority.",
  ],
  compact_result: {
    blocked_on_issues: [37],
    experiment_id: "flagship-runtime-smoke",
    next_action:
      "Land the listed prerequisite issue(s), then replace this gate command with the real experiment helper while preserving the stable experiment id.",
    reason:
      "Issue #37 must land the authoritative composed worker/runtime path before this smoke can exercise real authority.",
    schema_version: 1,
    status: "blocked",
  },
  cwd: ".",
  description: "BLOCKED on #37",
  duration_seconds: 0.077081,
  error: null,
  id: "flagship-runtime-smoke",
  issues: [37, 42, 542],
  local_artifact_dir: ".petra_local/runs/example/flagship-runtime-smoke/artifacts",
  log_tail: "ignored by validation projection",
  return_code: 2,
  status: "failed",
  timeout_seconds: 30,
});

function binding() {
  return {
    recordId: "flagship-runtime-smoke-local",
    experimentId: "flagship-runtime-smoke",
    dimension: "composed-scenario" as const,
    evidenceKind: "local-experiment" as const,
    summary:
      "Authoritative flagship initialization, intervention, restore, and replay smoke.",
    locator:
      "experiments/results/20260924T185028185418Z/flagship-runtime-smoke.json",
  };
}

describe("local experiment validation evidence", () => {
  it("projects the canonical blocked placeholder as blocked rather than failed science", () => {
    const record = projectLocalExperimentValidationEvidence(
      BLOCKED_RESULT,
      binding(),
    );

    expect(record).toEqual({
      id: "flagship-runtime-smoke-local",
      dimension: "composed-scenario",
      evidenceKind: "local-experiment",
      status: "blocked",
      summary:
        "Authoritative flagship initialization, intervention, restore, and replay smoke.",
      locator:
        "experiments/results/20260924T185028185418Z/flagship-runtime-smoke.json",
      blocker:
        "Blocked on #37: Issue #37 must land the authoritative composed worker/runtime path before this smoke can exercise real authority.",
    });
  });

  it("maps an exact passed result only to the caller-selected validation lane", () => {
    const result = JSON.stringify({
      id: "flagship-runtime-smoke",
      status: "passed",
      return_code: 0,
      error: null,
      compact_result: {
        schema_version: 2,
        all_acceptance_checks_passed: true,
      },
    });
    const record = projectLocalExperimentValidationEvidence(result, binding());
    const presentation = buildScenarioValidationPresentation({
      schemaVersion: 1,
      scenarioId: "ecoli-ciprofloxacin-spatial",
      scenarioVersion: "1.4.0-research",
      records: [record],
    });

    expect(record.status).toBe("passed");
    expect(
      presentation.lanes.find(
        (lane) => lane.dimension === "composed-scenario",
      )?.records,
    ).toEqual([record]);
    expect(
      presentation.lanes.find((lane) => lane.dimension === "numerical")?.records,
    ).toEqual([]);
    expect(
      presentation.lanes.find((lane) => lane.dimension === "browser-product")
        ?.records,
    ).toEqual([]);
  });

  it.each(["failed", "error", "timeout"] as const)(
    "keeps runner status %s as failed evidence for that exact record",
    (status) => {
      const result = JSON.stringify({
        id: "flagship-runtime-smoke",
        status,
        return_code: status === "timeout" ? null : 1,
        error: status === "error" ? "process launch failed" : null,
        compact_result: null,
      });

      expect(
        projectLocalExperimentValidationEvidence(result, binding()).status,
      ).toBe("failed");
    },
  );

  it("rejects result identity drift", () => {
    const result = JSON.stringify({
      id: "seed-replay-matrix",
      status: "passed",
      return_code: 0,
      error: null,
    });

    expect(() =>
      projectLocalExperimentValidationEvidence(result, binding()),
    ).toThrow(/does not match expected experiment/);
  });

  it("requires the locator to name the exact experiment result", () => {
    expect(() =>
      projectLocalExperimentValidationEvidence(BLOCKED_RESULT, {
        ...binding(),
        locator:
          "experiments/results/20260924T185028185418Z/seed-replay-matrix.json",
      }),
    ).toThrow(/exact per-experiment result JSON/);
  });

  it("rejects a fake blocked payload that did not use the canonical exit-2 gate", () => {
    const fake = JSON.stringify({
      id: "flagship-runtime-smoke",
      status: "passed",
      return_code: 0,
      error: null,
      compact_result: {
        schema_version: 1,
        experiment_id: "flagship-runtime-smoke",
        status: "blocked",
        blocked_on_issues: [37],
        reason: "pretend blocker",
        next_action: "pretend next action",
      },
    });

    expect(() =>
      projectLocalExperimentValidationEvidence(fake, binding()),
    ).toThrow(/canonical failed exit-2 placeholder/);
  });

  it("rejects malformed blocked issue identity", () => {
    const malformed = JSON.stringify({
      id: "flagship-runtime-smoke",
      status: "failed",
      return_code: 2,
      error: null,
      compact_result: {
        schema_version: 1,
        experiment_id: "flagship-runtime-smoke",
        status: "blocked",
        blocked_on_issues: [37, 37],
        reason: "duplicate blocker",
        next_action: "land prerequisites",
      },
    });

    expect(() =>
      projectLocalExperimentValidationEvidence(malformed, binding()),
    ).toThrow(/duplicate blocked issue/);
  });
});
