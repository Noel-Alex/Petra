import { describe, expect, it } from "vitest";

import { createResizeRedrawScheduler } from "./resizeScheduler";

describe("createResizeRedrawScheduler", () => {
  it("coalesces resize bursts and redraws only after resize", () => {
    const callbacks: FrameRequestCallback[] = [];
    const order: string[] = [];

    const scheduler = createResizeRedrawScheduler(
      () => order.push("resize"),
      () => order.push("redraw"),
      {
        requestFrame(callback) {
          callbacks.push(callback);
          return callbacks.length;
        },
        cancelFrame() {},
      },
    );

    scheduler.schedule();
    scheduler.schedule();
    scheduler.schedule();

    expect(callbacks).toHaveLength(1);
    expect(order).toEqual([]);

    callbacks[0]?.(0);

    expect(order).toEqual(["resize", "redraw"]);
  });

  it("allows a later resize after the previous frame completes", () => {
    const callbacks: FrameRequestCallback[] = [];
    let redraws = 0;

    const scheduler = createResizeRedrawScheduler(
      () => {},
      () => {
        redraws += 1;
      },
      {
        requestFrame(callback) {
          callbacks.push(callback);
          return callbacks.length;
        },
        cancelFrame() {},
      },
    );

    scheduler.schedule();
    callbacks[0]?.(0);
    scheduler.schedule();
    callbacks[1]?.(16);

    expect(redraws).toBe(2);
  });

  it("cancels pending work and ignores future schedules after destroy", () => {
    const callbacks: FrameRequestCallback[] = [];
    const cancelled: number[] = [];
    let redraws = 0;

    const scheduler = createResizeRedrawScheduler(
      () => {},
      () => {
        redraws += 1;
      },
      {
        requestFrame(callback) {
          callbacks.push(callback);
          return callbacks.length;
        },
        cancelFrame(handle) {
          cancelled.push(handle);
        },
      },
    );

    scheduler.schedule();
    scheduler.cancel();
    scheduler.schedule();

    expect(cancelled).toEqual([1]);
    expect(callbacks).toHaveLength(1);
    expect(redraws).toBe(0);
  });
});
