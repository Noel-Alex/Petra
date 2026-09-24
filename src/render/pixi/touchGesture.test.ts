import { describe, expect, it } from "vitest";
import {
  applyPinchCamera,
  pinchFrame,
  removeGesturePointer,
  upsertGesturePointer,
  type GesturePointer,
} from "./touchGesture";

const touch = (
  pointerId: number,
  x: number,
  y: number,
): GesturePointer => ({
  pointerId,
  pointerType: "touch",
  point: { x, y },
});

describe("touch gesture camera planning", () => {
  it("tracks contacts deterministically by pointer id", () => {
    const pointers = upsertGesturePointer(
      [touch(9, 20, 20)],
      touch(3, 10, 10),
    );
    expect(pointers.map((pointer) => pointer.pointerId)).toEqual([3, 9]);

    const updated = upsertGesturePointer(pointers, touch(9, 30, 40));
    expect(updated).toEqual([touch(3, 10, 10), touch(9, 30, 40)]);
    expect(removeGesturePointer(updated, 3)).toEqual([touch(9, 30, 40)]);
  });

  it("forms pinch frames from touch contacts only", () => {
    const frame = pinchFrame([
      { pointerId: 1, pointerType: "mouse", point: { x: 0, y: 0 } },
      touch(8, 400, 300),
      touch(2, 200, 300),
    ]);

    expect(frame).toEqual({
      pointerIds: [2, 8],
      centroid: { x: 300, y: 300 },
      distance: 200,
    });
  });

  it("zooms around the gesture centroid using existing camera bounds", () => {
    const previous = pinchFrame([touch(1, 250, 300), touch(2, 350, 300)]);
    const current = pinchFrame([touch(1, 200, 300), touch(2, 400, 300)]);
    if (previous === null || current === null) throw new Error("expected pinch");

    expect(
      applyPinchCamera(
        { centerX: 0.5, centerY: 0.5, zoom: 1 },
        previous,
        current,
        { width: 600, height: 600 },
      ),
    ).toEqual({ centerX: 0.5, centerY: 0.5, zoom: 2 });
  });

  it("translates the camera when the pinch centroid moves", () => {
    const previous = pinchFrame([touch(1, 250, 300), touch(2, 350, 300)]);
    const current = pinchFrame([touch(1, 300, 300), touch(2, 400, 300)]);
    if (previous === null || current === null) throw new Error("expected pinch");

    expect(
      applyPinchCamera(
        { centerX: 0.5, centerY: 0.5, zoom: 2 },
        previous,
        current,
        { width: 600, height: 600 },
      ),
    ).toEqual({
      centerX: 0.4583333333333333,
      centerY: 0.5,
      zoom: 2,
    });
  });

  it("rejects switching pointer identity inside one pinch delta", () => {
    const previous = pinchFrame([touch(1, 250, 300), touch(2, 350, 300)]);
    const current = pinchFrame([touch(1, 250, 300), touch(3, 350, 300)]);
    if (previous === null || current === null) throw new Error("expected pinch");

    expect(() =>
      applyPinchCamera(
        { centerX: 0.5, centerY: 0.5, zoom: 1 },
        previous,
        current,
        { width: 600, height: 600 },
      ),
    ).toThrow(/same pointer pair/);
  });
});
