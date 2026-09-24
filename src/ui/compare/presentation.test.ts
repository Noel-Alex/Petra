import { describe, expect, it } from "vitest";

import type { CounterfactualBranch } from "../counterfactual";
import {
  normalizeSwipePercent,
  resolveComparePresentation,
} from "./presentation";

const origin = {
  sourceRunId: "run-a",
  checkpointTraceHash: "trace-12",
  tick: 12,
  simulationTimeHours: 3,
  commandCount: 2,
} as const;

function branch(
  branchId: string,
  seed: number,
  interventionCommandIds: readonly string[],
  traceHash = origin.checkpointTraceHash,
): CounterfactualBranch {
  return {
    branchId,
    label: branchId,
    origin: { ...origin, checkpointTraceHash: traceHash },
    seed,
    interventionCommandIds,
  };
}

describe("counterfactual compare presentation", () => {
  it("uses causal emphasis only for a clean intervention divergence", () => {
    const left = branch("control", 7, ["dose-a"]);
    const right = branch("treatment", 7, ["dose-b"]);

    const presentation = resolveComparePresentation(
      left,
      right,
      "side-by-side",
      "full",
    );

    expect(presentation.tone).toBe("intervention");
    expect(presentation.canAttributeDifferenceToIntervention).toBe(true);
    expect(presentation.divergenceMotion.treatment).toBe("animate");
    expect(presentation.detail).toContain("exact origin and seed");
  });

  it("keeps stochastic divergence explicit instead of implying intervention cause", () => {
    const left = branch("seed-1", 1, ["same"]);
    const right = branch("seed-2", 2, ["same"]);

    const presentation = resolveComparePresentation(left, right, "swipe", "full");

    expect(presentation.tone).toBe("stochastic");
    expect(presentation.canAttributeDifferenceToIntervention).toBe(false);
    expect(presentation.headline).toContain("Stochastic-seed");
  });

  it("preserves causal copy when motion is off", () => {
    const left = branch("control", 7, ["dose-a"]);
    const right = branch("treatment", 7, ["dose-b"]);

    const presentation = resolveComparePresentation(left, right, "swipe", "off");

    expect(presentation.headline).toBe("Intervention divergence");
    expect(presentation.divergenceMotion).toEqual({
      treatment: "static-emphasis",
      durationMs: 0,
      loops: false,
    });
    expect(presentation.layoutMotion.durationMs).toBe(0);
  });

  it("warns when branch origins are not an exact controlled pair", () => {
    const left = branch("left", 7, ["dose-a"]);
    const right = branch("right", 7, ["dose-a"], "different-trace");

    const presentation = resolveComparePresentation(
      left,
      right,
      "side-by-side",
      "reduced",
    );

    expect(presentation.tone).toBe("warning");
    expect(presentation.canAttributeDifferenceToIntervention).toBe(false);
    expect(presentation.detail).toContain("do not present");
  });

  it("clamps swipe reveal to the visual surface", () => {
    expect(normalizeSwipePercent(-20)).toBe(0);
    expect(normalizeSwipePercent(42.5)).toBe(42.5);
    expect(normalizeSwipePercent(140)).toBe(100);
    expect(() => normalizeSwipePercent(Number.NaN)).toThrow(RangeError);
  });
});
