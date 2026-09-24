import { describe, expect, it } from "vitest";

import type { CounterfactualBranch } from "../counterfactual";
import {
  createCounterfactualExportManifest,
  serializeCounterfactualExportManifest,
  validateCounterfactualExportManifest,
} from "./export";

const origin = {
  sourceRunId: "run-001",
  checkpointTraceHash: "trace-at-fork",
  tick: 120,
  simulationTimeHours: 2,
  commandCount: 4,
} as const;

const replayContext = {
  engineVersion: "petra-ts-core/0.1.0",
  protocolVersion: 1,
  scenarioId: "flagship",
  scenarioVersion: "1",
  parameterSetId: "flagship-parameters",
  parameterSetVersion: "1",
} as const;

function branch(
  branchId: string,
  seed: number,
  interventionCommandIds: readonly string[],
): CounterfactualBranch {
  return {
    branchId,
    label: branchId === "left" ? "Control" : "Intervention",
    origin,
    seed,
    interventionCommandIds,
  };
}

describe("counterfactual export manifest", () => {
  it("preserves replay identity while remaining explicit metadata-only", () => {
    const manifest = createCounterfactualExportManifest({
      left: branch("left", 42, ["dose-1"]),
      right: branch("right", 42, ["dose-2"]),
      replayContext,
    });

    expect(manifest.comparison).toMatchObject({
      hasSharedOrigin: true,
      divergenceCause: "intervention",
      firstDivergentCommandIndex: 0,
    });
    expect(manifest.branches.right.interventionCommandIds).toEqual(["dose-2"]);
    expect(manifest.replayContext).toEqual(replayContext);
    expect(manifest.capabilities).toEqual({
      checkpointPayloadIncluded: false,
      commandPayloadsIncluded: false,
      replayReady: false,
    });
  });

  it("keeps stochastic seed divergence explicit in exported metadata", () => {
    const manifest = createCounterfactualExportManifest({
      left: branch("left", 42, ["dose-1"]),
      right: branch("right", 99, ["dose-1"]),
      replayContext,
    });

    expect(manifest.comparison.divergenceCause).toBe("seed");
  });

  it("deep-copies branch origin and command identity from mutable callers", () => {
    const mutableOrigin = { ...origin };
    const mutableCommands = ["dose-1"];
    const left: CounterfactualBranch = {
      branchId: "left",
      label: "Control",
      origin: mutableOrigin,
      seed: 42,
      interventionCommandIds: mutableCommands,
    };

    const manifest = createCounterfactualExportManifest({
      left,
      right: branch("right", 42, ["dose-2"]),
      replayContext,
    });

    mutableOrigin.checkpointTraceHash = "tampered-after-export";
    mutableCommands.push("late-command");

    expect(manifest.branches.left.origin.checkpointTraceHash).toBe(
      "trace-at-fork",
    );
    expect(manifest.branches.left.interventionCommandIds).toEqual(["dose-1"]);
  });

  it("serializes identical inputs deterministically without wall-clock metadata", () => {
    const args = {
      left: branch("left", 42, ["dose-1"]),
      right: branch("right", 42, ["dose-2"]),
      replayContext,
    } as const;

    const first = serializeCounterfactualExportManifest(
      createCounterfactualExportManifest(args),
    );
    const second = serializeCounterfactualExportManifest(
      createCounterfactualExportManifest(args),
    );

    expect(first).toBe(second);
    expect(first).not.toContain("exportedAt");
  });

  it("rejects a manifest whose divergence claim was tampered independently of branches", () => {
    const manifest = createCounterfactualExportManifest({
      left: branch("left", 42, ["dose-1"]),
      right: branch("right", 42, ["dose-2"]),
      replayContext,
    });
    const tampered = {
      ...manifest,
      comparison: {
        ...manifest.comparison,
        divergenceCause: "seed" as const,
      },
    };

    expect(() => validateCounterfactualExportManifest(tampered)).toThrow(
      /does not match branch metadata/,
    );
  });

  it("rejects incomplete replay provenance instead of inventing versions", () => {
    expect(() =>
      createCounterfactualExportManifest({
        left: branch("left", 42, []),
        right: branch("right", 42, []),
        replayContext: {
          ...replayContext,
          parameterSetVersion: " ",
        },
      }),
    ).toThrow(/parameterSetVersion must be non-empty/);
  });
});
