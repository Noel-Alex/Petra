import { describe, expect, it } from "vitest";

import {
  applyPinchGesture,
  removeTouchPointer,
  upsertTouchPointer,
  type TouchPointerSample,
} from "./touchGesture";

const viewport = { width: 800, height: 600 };

describe("touch pinch camera helpers", () => {
  it("keeps pointer identity deterministic across add/update/remove", () => {
    let pointers: readonly TouchPointerSample[] = [];
    pointers = upsertTouchPointer(pointers, 9, { x: 500, y: 300 });
    pointers = upsertTouchPointer(pointers, 3, { x: 300, y: 300 });
    pointers = upsertTouchPointer(pointers, 9, { x: 520, y: 300 });

    expect(pointers).toEqual([
      { id: 3, point: { x: 300, y: 300 } },
      { id: 9, point: { x: 520, y: 300 } },
    ]);

    expect(removeTouchPointer(pointers, 3)).toEqual([
      { id: 9, point: { x: 520, y: 300 } },
    ]);
  });

  it("zooms around a stable two-finger centroid", () => {
    const previous = [
      { id: 1, point: { x: 300, y: 300 } },
      { id: 2, point: { x: 500, y: 300 } },
    ] as const;
    const next = [
      { id: 1, point: { x: 200, y: 300 } },
      { id: 2, point: { x: 600, y: 300 } },
    ] as const;

    expect(
      applyPinchGesture(
        { centerX: 0.5, centerY: 0.5, zoom: 1 },
        previous,
        next,
        viewport,
      ),
    ).toEqual({ centerX: 0.5, centerY: 0.5, zoom: 2 });
  });

  it("tracks centroid movement as a pan after pinch scaling", () => {
    const previous = [
      { id: 1, point: { x: 300, y: 300 } },
      { id: 2, point: { x: 500, y: 300 } },
    ] as const;
    const next = [
      { id: 1, point: { x: 360, y: 300 } },
      { id: 2, point: { x: 560, y: 300 } },
    ] as const;

    expect(
      applyPinchGesture(
        { centerX: 0.5, centerY: 0.5, zoom: 2 },
        previous,
        next,
        viewport,
      ),
    ).toEqual({ centerX: 0.45, centerY: 0.5, zoom: 2 });
  });

  it("waits for two consecutive samples before applying a new pinch", () => {
    const camera = { centerX: 0.5, centerY: 0.5, zoom: 1 };
    const previous = [{ id: 1, point: { x: 300, y: 300 } }] as const;
    const next = [
      { id: 1, point: { x: 300, y: 300 } },
      { id: 2, point: { x: 500, y: 300 } },
    ] as const;

    expect(applyPinchGesture(camera, previous, next, viewport)).toEqual(camera);
  });

  it("ignores a degenerate zero-distance pair instead of producing invalid camera state", () => {
    const camera = { centerX: 0.5, centerY: 0.5, zoom: 2 };
    const previous = [
      { id: 1, point: { x: 400, y: 300 } },
      { id: 2, point: { x: 400, y: 300 } },
    ] as const;

    expect(applyPinchGesture(camera, previous, previous, viewport)).toEqual(camera);
  });
});
