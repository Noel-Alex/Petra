import { describe, expect, it } from "vitest";
import visualInterpolationSource from "./visualInterpolation.ts?raw";

import type { DishRenderSnapshot, RenderLineage } from "./model";
import {
  advanceDishVisualTransition,
  planDishVisualTransition,
  type DishPresentationFrame,
  type DishVisualMotionSpec,
} from "./visualInterpolation";

const LINEAR: DishVisualMotionSpec = {
  durationMs: 100,
  easing: [0, 0, 1, 1],
};

function lineage(
  id: string,
  density: readonly number[],
  appearanceToken:
    | "lineage-cyan"
    | "lineage-coral" = "lineage-cyan",
): RenderLineage {
  return {
    id,
    label: id,
    appearanceToken,
    patternToken: "solid-ring",
    density: new Float32Array(density),
  };
}

function snapshot(args: {
  id: string;
  biomass: readonly number[];
  field: readonly number[];
  lineages: readonly RenderLineage[];
  samplingIdentity?: string;
  unit?: string;
  mask?: readonly number[];
}): DishRenderSnapshot {
  return {
    snapshotId: args.id,
    samplingIdentity: args.samplingIdentity ?? "run-1",
    simulationTimeHours: args.id === "a" ? 0 : 1,
    gridWidth: 2,
    gridHeight: 1,
    dishMask: new Uint8Array(args.mask ?? [1, 1]),
    biomass: new Float32Array(args.biomass),
    fields: [
      {
        id: "nutrient",
        kind: "nutrient",
        label: "Nutrient",
        unit: args.unit ?? "a.u.",
        width: 2,
        height: 1,
        values: new Float32Array(args.field),
        minimum: 0,
        maximum: 10,
      },
    ],
    lineages: args.lineages,
    events: [],
  };
}

describe("dish visual continuity", () => {
  it("stays framework-neutral instead of depending on the Pixi adapter", () => {
    expect(visualInterpolationSource).toContain('from "./motionMath"');
    expect(visualInterpolationSource).not.toContain("/pixi/");
    expect(visualInterpolationSource).not.toContain("pixi.js");
  });

  it("interpolates only presentation channels and completes at exact authority", () => {
    const from = snapshot({
      id: "a",
      biomass: [0, 2],
      field: [2, 4],
      lineages: [lineage("ancestor", [0, 4])],
    });
    const to = snapshot({
      id: "b",
      biomass: [10, 6],
      field: [6, 8],
      lineages: [lineage("ancestor", [8, 0])],
    });

    const plan = planDishVisualTransition(from, to, LINEAR);
    expect(plan.kind).toBe("interpolate");
    if (plan.kind !== "interpolate") return;

    const half = advanceDishVisualTransition(plan.transition, 50);
    expect(half.complete).toBe(false);
    const frame = half.state as DishPresentationFrame;
    expect(frame.frameKind).toBe("interpolated-presentation");
    expect(frame.targetSnapshotId).toBe("b");
    expect(frame.progress).toBeCloseTo(0.5);
    expect(frame.easedProgress).toBeCloseTo(0.5);
    expect(Array.from(frame.biomass)).toEqual([5, 4]);
    expect(Array.from(frame.fields[0]!.values)).toEqual([4, 6]);
    expect(Array.from(frame.lineages[0]!.density)).toEqual([4, 2]);
    expect("simulationTimeHours" in frame).toBe(false);
    expect("snapshotId" in frame).toBe(false);

    const complete = advanceDishVisualTransition(plan.transition, 100);
    expect(complete).toEqual({ complete: true, state: to });
  });

  it("grows entering and recedes exiting lineage channels through zero density", () => {
    const from = snapshot({
      id: "a",
      biomass: [4, 0],
      field: [2, 2],
      lineages: [lineage("old", [4, 0])],
    });
    const to = snapshot({
      id: "b",
      biomass: [0, 6],
      field: [2, 2],
      lineages: [lineage("new", [0, 6], "lineage-coral")],
    });

    const plan = planDishVisualTransition(from, to, LINEAR);
    expect(plan.kind).toBe("interpolate");
    if (plan.kind !== "interpolate") return;

    const half = advanceDishVisualTransition(plan.transition, 50);
    const frame = half.state as DishPresentationFrame;

    expect(frame.lineages.map((item) => item.id)).toEqual(["new", "old"]);
    expect(Array.from(frame.lineages[0]!.density)).toEqual([0, 3]);
    expect(Array.from(frame.lineages[1]!.density)).toEqual([2, 0]);
  });

  it("refuses to morph incompatible scientific channel identity or geometry", () => {
    const base = snapshot({
      id: "a",
      biomass: [1, 1],
      field: [2, 2],
      lineages: [lineage("ancestor", [1, 1])],
    });

    expect(
      planDishVisualTransition(
        base,
        snapshot({
          id: "b",
          biomass: [2, 2],
          field: [3, 3],
          lineages: [lineage("ancestor", [2, 2])],
          samplingIdentity: "different-run",
        }),
        LINEAR,
      ),
    ).toEqual({ kind: "snap", reason: "sampling-identity-mismatch" });

    expect(
      planDishVisualTransition(
        base,
        snapshot({
          id: "b",
          biomass: [2, 2],
          field: [3, 3],
          lineages: [lineage("ancestor", [2, 2])],
          unit: "different-unit",
        }),
        LINEAR,
      ),
    ).toEqual({ kind: "snap", reason: "field-metadata-mismatch" });

    expect(
      planDishVisualTransition(
        base,
        snapshot({
          id: "b",
          biomass: [2, 2],
          field: [3, 3],
          lineages: [lineage("ancestor", [2, 2])],
          mask: [1, 0],
        }),
        LINEAR,
      ),
    ).toEqual({ kind: "snap", reason: "dish-mask-mismatch" });
  });

  it("refuses identity-preserving lineage IDs whose visual metadata changed", () => {
    const from = snapshot({
      id: "a",
      biomass: [1, 1],
      field: [1, 1],
      lineages: [lineage("same-id", [1, 1], "lineage-cyan")],
    });
    const to = snapshot({
      id: "b",
      biomass: [2, 2],
      field: [1, 1],
      lineages: [lineage("same-id", [2, 2], "lineage-coral")],
    });

    expect(planDishVisualTransition(from, to, LINEAR)).toEqual({
      kind: "snap",
      reason: "lineage-metadata-mismatch",
    });
  });

  it("reuses presentation buffers and never mutates authoritative endpoints", () => {
    const from = snapshot({
      id: "a",
      biomass: [0, 2],
      field: [2, 4],
      lineages: [lineage("ancestor", [0, 4])],
    });
    const to = snapshot({
      id: "b",
      biomass: [10, 6],
      field: [6, 8],
      lineages: [lineage("ancestor", [8, 0])],
    });
    const beforeFrom = Array.from(from.biomass);
    const beforeTo = Array.from(to.biomass);

    const plan = planDishVisualTransition(from, to, LINEAR);
    if (plan.kind !== "interpolate") {
      throw new Error("expected interpolation plan");
    }

    const quarter = advanceDishVisualTransition(plan.transition, 25);
    const half = advanceDishVisualTransition(plan.transition, 50);

    expect(quarter.state).toBe(half.state);
    expect(Array.from(from.biomass)).toEqual(beforeFrom);
    expect(Array.from(to.biomass)).toEqual(beforeTo);
  });

  it("can rebase a new transition from the currently rendered presentation frame", () => {
    const first = snapshot({
      id: "a",
      biomass: [0, 0],
      field: [0, 0],
      lineages: [lineage("ancestor", [0, 0])],
    });
    const second = snapshot({
      id: "b",
      biomass: [10, 10],
      field: [10, 10],
      lineages: [lineage("ancestor", [10, 10])],
    });
    const third = snapshot({
      id: "c",
      biomass: [20, 20],
      field: [5, 5],
      lineages: [lineage("ancestor", [20, 20])],
    });

    const firstPlan = planDishVisualTransition(first, second, LINEAR);
    if (firstPlan.kind !== "interpolate") throw new Error("expected plan");
    const current = advanceDishVisualTransition(
      firstPlan.transition,
      50,
    ).state;

    const rebased = planDishVisualTransition(current, third, LINEAR);
    expect(rebased.kind).toBe("interpolate");
    if (rebased.kind !== "interpolate") return;

    const halfwayAgain = advanceDishVisualTransition(
      rebased.transition,
      50,
    ).state as DishPresentationFrame;
    expect(Array.from(halfwayAgain.biomass)).toEqual([12.5, 12.5]);
  });
});
