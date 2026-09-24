import { describe, expect, it } from "vitest";
import {
  beginPointerGesture,
  createPointerGestureState,
  endPointerGesture,
  movePointerGesture,
} from "./pointerGesture";

describe("pointer gesture planner", () => {
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
