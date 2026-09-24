import { describe, expect, it } from "vitest";
import type { RenderHyphalPath } from "./model";
import {
  evaluateHyphalPathTransitionAtProgress,
  fullyRevealHyphalPaths,
  hyphalPathLength,
  planHyphalPathTransition,
} from "./hyphalPathPresentation";

function path(
  id: string,
  points: ReadonlyArray<readonly [number, number]>,
): RenderHyphalPath {
  return {
    id,
    organismKind: "fungus",
    points: points.map(([x, y]) => ({ x, y })),
  };
}

describe("hyphal path presentation", () => {
  it("fully reveals authoritative geometry without changing it", () => {
    const source = path("h1", [
      [0.2, 0.2],
      [0.4, 0.2],
      [0.4, 0.5],
    ]);
    const state = fullyRevealHyphalPaths([source]);

    expect(state[0]?.path).toBe(source);
    expect(state[0]?.visibleLength).toBeCloseTo(0.5);
  });

  it("reveals only the authoritative extension of an existing prefix", () => {
    const before = path("h1", [
      [0.2, 0.2],
      [0.4, 0.2],
    ]);
    const after = path("h1", [
      [0.2, 0.2],
      [0.4, 0.2],
      [0.4, 0.6],
    ]);
    const plan = planHyphalPathTransition(
      fullyRevealHyphalPaths([before]),
      [after],
    );
    expect(plan.kind).toBe("interpolate");
    if (plan.kind !== "interpolate") return;

    const half = evaluateHyphalPathTransitionAtProgress(
      plan.transition,
      0.5,
    );
    expect(half.complete).toBe(false);
    expect(half.state[0]?.path).toBe(after);
    expect(half.state[0]?.visibleLength).toBeCloseTo(0.4);

    const complete = evaluateHyphalPathTransitionAtProgress(
      plan.transition,
      1,
    );
    expect(complete).toEqual({
      complete: true,
      state: plan.transition.targetState,
    });
    expect(complete.state[0]?.visibleLength).toBeCloseTo(0.6);
  });

  it("grows a newly authorized branch from zero", () => {
    const branch = path("branch", [
      [0.5, 0.5],
      [0.7, 0.5],
    ]);
    const plan = planHyphalPathTransition([], [branch]);
    expect(plan.kind).toBe("interpolate");
    if (plan.kind !== "interpolate") return;

    expect(
      evaluateHyphalPathTransitionAtProgress(plan.transition, 0).state[0]
        ?.visibleLength,
    ).toBe(0);
    expect(
      evaluateHyphalPathTransitionAtProgress(plan.transition, 0.25).state[0]
        ?.visibleLength,
    ).toBeCloseTo(0.05);
  });

  it("rebases from the currently visible length without jumping forward", () => {
    const target = path("h1", [
      [0.1, 0.1],
      [0.4, 0.1],
      [0.7, 0.1],
    ]);
    const current = [{ path: target, visibleLength: 0.2 }] as const;
    const plan = planHyphalPathTransition(current, [target]);
    expect(plan.kind).toBe("interpolate");
    if (plan.kind !== "interpolate") return;

    expect(
      evaluateHyphalPathTransitionAtProgress(plan.transition, 0).state[0]
        ?.visibleLength,
    ).toBeCloseTo(0.2);
  });

  it("fails closed on removal, shortening, or topology movement", () => {
    const before = path("h1", [
      [0.2, 0.2],
      [0.4, 0.2],
      [0.4, 0.5],
    ]);

    expect(
      planHyphalPathTransition(fullyRevealHyphalPaths([before]), []),
    ).toEqual({ kind: "snap", reason: "path-removal" });

    const shortened = path("h1", [
      [0.2, 0.2],
      [0.4, 0.2],
    ]);
    expect(
      planHyphalPathTransition(
        fullyRevealHyphalPaths([before]),
        [shortened],
      ),
    ).toEqual({ kind: "snap", reason: "path-topology-mismatch" });

    const moved = path("h1", [
      [0.2, 0.2],
      [0.45, 0.2],
      [0.4, 0.5],
    ]);
    expect(
      planHyphalPathTransition(
        fullyRevealHyphalPaths([before]),
        [moved],
      ),
    ).toEqual({ kind: "snap", reason: "path-topology-mismatch" });
  });

  it("rejects invalid presentation progress", () => {
    const target = path("h1", [
      [0.1, 0.1],
      [0.2, 0.1],
    ]);
    const plan = planHyphalPathTransition([], [target]);
    if (plan.kind !== "interpolate") throw new Error("expected plan");

    expect(() =>
      evaluateHyphalPathTransitionAtProgress(plan.transition, -0.01),
    ).toThrow(/within \[0, 1\]/);
    expect(() =>
      evaluateHyphalPathTransitionAtProgress(plan.transition, 1.01),
    ).toThrow(/within \[0, 1\]/);
  });

  it("computes normalized polyline length deterministically", () => {
    expect(
      hyphalPathLength([
        { x: 0, y: 0 },
        { x: 0.3, y: 0.4 },
        { x: 0.6, y: 0.4 },
      ]),
    ).toBeCloseTo(0.8);
  });
});
