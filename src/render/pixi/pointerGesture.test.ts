import { describe, expect, it } from "vitest";
import {
  beginPointerGesture,
  beginPointerGestureInDishAperture,
  createPointerGestureState,
  endPointerGesture,
  movePointerGesture,
} from "./pointerGesture";

describe("pointer gesture planner", () => {
  it("admits starts inside the dish, continues outside, and refuses an outside second pointer", () => {
    const viewport = { width: 800, height: 600 };
    const first = beginPointerGestureInDishAperture(
      createPointerGestureState(),
      1,
      { x: 400, y: 300 },
      viewport,
    );
    const movedOutside = movePointerGesture(first.state, 1, { x: 20, y: 20 });
    const rejectedSecond = beginPointerGestureInDishAperture(
      movedOutside.state,
      2,
      { x: 0, y: 0 },
      viewport,
    );

    expect(first.accepted).toBe(true);
    expect(movedOutside.accepted).toBe(true);
    expect(movedOutside.intent).toEqual({
      kind: "pan",
      deltaScreen: { x: -380, y: -280 },
    });
    expect(rejectedSecond.accepted).toBe(false);
    expect(rejectedSecond.state.active).toEqual([
      { id: 1, point: { x: 20, y: 20 } },
    ]);
  });

  it("emits one-pointer pan deltas", () => {
    const started = beginPointerGesture(
      createPointerGestureState(),
      1,
      { x: 100, y: 80 },
    );
    const moved = movePointerGesture(started.state, 1, { x: 118, y: 67 });

    expect(moved.accepted).toBe(true);
    expect(moved.intent).toEqual({
      kind: "pan",
      deltaScreen: { x: 18, y: -13 },
    });
  });

  it("emits pinch scale and centroid movement from two pointers", () => {
    const first = beginPointerGesture(
      createPointerGestureState(),
      1,
      { x: 100, y: 100 },
    );
    const second = beginPointerGesture(first.state, 2, { x: 200, y: 100 });
    const moved = movePointerGesture(second.state, 2, { x: 220, y: 100 });

    expect(moved.intent).toEqual({
      kind: "pinch",
      anchorScreen: { x: 150, y: 100 },
      centroidDelta: { x: 10, y: 0 },
      zoomFactor: 1.2,
    });
  });

  it("suppresses unstable pinch ratios at near-zero separation", () => {
    const first = beginPointerGesture(
      createPointerGestureState(),
      1,
      { x: 100, y: 100 },
    );
    const second = beginPointerGesture(first.state, 2, { x: 101, y: 100 });
    const moved = movePointerGesture(second.state, 2, { x: 102, y: 100 });

    expect(moved.accepted).toBe(true);
    expect(moved.intent).toEqual({ kind: "none" });
  });

  it("continues cleanly as one-pointer pan after the other pointer lifts", () => {
    const first = beginPointerGesture(
      createPointerGestureState(),
      1,
      { x: 100, y: 100 },
    );
    const second = beginPointerGesture(first.state, 2, { x: 200, y: 100 });
    const pinched = movePointerGesture(second.state, 2, { x: 220, y: 100 });
    const remaining = endPointerGesture(pinched.state, 1);
    const moved = movePointerGesture(remaining, 2, { x: 225, y: 106 });

    expect(moved.intent).toEqual({
      kind: "pan",
      deltaScreen: { x: 5, y: 6 },
    });
  });

  it("ignores a third simultaneous pointer and unknown moves", () => {
    const first = beginPointerGesture(
      createPointerGestureState(),
      1,
      { x: 10, y: 10 },
    );
    const second = beginPointerGesture(first.state, 2, { x: 20, y: 10 });
    const third = beginPointerGesture(second.state, 3, { x: 30, y: 10 });
    const moved = movePointerGesture(third.state, 3, { x: 40, y: 10 });

    expect(third.accepted).toBe(false);
    expect(third.state.active).toHaveLength(2);
    expect(moved.accepted).toBe(false);
    expect(moved.intent).toEqual({ kind: "none" });
  });

  it("removes cancelled pointers without leaving stale gesture state", () => {
    const first = beginPointerGesture(
      createPointerGestureState(),
      7,
      { x: 5, y: 6 },
    );
    expect(endPointerGesture(first.state, 7).active).toEqual([]);
  });
});
