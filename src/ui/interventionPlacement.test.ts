import { describe, expect, it } from "vitest";

import {
  beginInterventionPlacement,
  cancelInterventionPlacement,
  constrainPointToCircularDish,
  createInterventionPlacementState,
  isPointInsideCircularDish,
  moveInterventionPlacement,
  setInterventionPlacementAxis,
} from "./interventionPlacement";

describe("intervention placement state", () => {
  it("enters and cancels presentation placement without inventing a command", () => {
    const idle = createInterventionPlacementState();
    const placing = beginInterventionPlacement(idle, "antibiotic");

    expect(placing).toEqual({
      phase: "placing",
      tool: "antibiotic",
      point: { x: 0.5, y: 0.5 },
    });

    expect(cancelInterventionPlacement(placing)).toEqual({
      phase: "idle",
      tool: null,
      point: { x: 0.5, y: 0.5 },
    });
  });

  it("preserves the target while switching visual tools", () => {
    const started = beginInterventionPlacement(
      createInterventionPlacementState(),
      "inoculate",
    );
    const moved = moveInterventionPlacement(started, { x: 0.64, y: 0.31 });
    const switched = beginInterventionPlacement(moved, "fungus");

    expect(switched.tool).toBe("fungus");
    expect(switched.point).toEqual(moved.point);
  });

  it("projects out-of-dish coordinates onto the circular rim", () => {
    const point = constrainPointToCircularDish({ x: 1, y: 1 });

    expect(isPointInsideCircularDish(point)).toBe(true);
    expect(Math.hypot(point.x - 0.5, point.y - 0.5)).toBeCloseTo(0.5, 12);
  });

  it("keeps valid interior points exact", () => {
    expect(constrainPointToCircularDish({ x: 0.2, y: 0.6 })).toEqual({
      x: 0.2,
      y: 0.6,
    });
  });

  it("supports keyboard-equivalent axis movement and rejects non-finite input", () => {
    const placing = beginInterventionPlacement(
      createInterventionPlacementState(),
      "nutrient",
    );
    const moved = setInterventionPlacementAxis(placing, "x", 0.72);

    expect(moved.point).toEqual({ x: 0.72, y: 0.5 });
    expect(() =>
      setInterventionPlacementAxis(placing, "y", Number.NaN),
    ).toThrow(/finite/i);
  });

  it("ignores target movement while no placement tool owns the interaction", () => {
    const idle = createInterventionPlacementState();
    expect(moveInterventionPlacement(idle, { x: 0.2, y: 0.2 })).toBe(idle);
  });
});
