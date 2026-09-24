import { describe, expect, it } from "vitest";

import {
  onePointerPanOwnedAtGestureStart,
  rendererOwnsGestureIntent,
  rendererTouchActionForNextGesture,
} from "./touchOwnership";

describe("renderer touch ownership", () => {
  it("leaves one-pointer overview pan to the browser", () => {
    const camera = { centerX: 0.5, centerY: 0.5, zoom: 1 };

    expect(onePointerPanOwnedAtGestureStart(camera)).toBe(false);
    expect(rendererTouchActionForNextGesture(camera)).toBe("pan-x pan-y");
    expect(rendererOwnsGestureIntent("pan", false)).toBe(false);
  });

  it("owns one-pointer pan when a gesture starts zoomed", () => {
    const camera = { centerX: 0.45, centerY: 0.55, zoom: 2.4 };

    expect(onePointerPanOwnedAtGestureStart(camera)).toBe(true);
    expect(rendererTouchActionForNextGesture(camera)).toBe("none");
    expect(rendererOwnsGestureIntent("pan", true)).toBe(true);
  });

  it("always owns pinch and never owns a no-op intent", () => {
    expect(rendererOwnsGestureIntent("pinch", false)).toBe(true);
    expect(rendererOwnsGestureIntent("pinch", true)).toBe(true);
    expect(rendererOwnsGestureIntent("none", false)).toBe(false);
    expect(rendererOwnsGestureIntent("none", true)).toBe(false);
  });

  it("keeps ownership latched even if the camera later changes", () => {
    const overviewOwned = onePointerPanOwnedAtGestureStart({
      centerX: 0.5,
      centerY: 0.5,
      zoom: 1,
    });
    const zoomedOwned = onePointerPanOwnedAtGestureStart({
      centerX: 0.5,
      centerY: 0.5,
      zoom: 3,
    });

    expect(rendererOwnsGestureIntent("pan", overviewOwned)).toBe(false);
    expect(rendererOwnsGestureIntent("pan", zoomedOwned)).toBe(true);

    // Touch-action may change for the *next* gesture, but the already latched
    // ownership value above intentionally does not.
    expect(
      rendererTouchActionForNextGesture({
        centerX: 0.5,
        centerY: 0.5,
        zoom: 3,
      }),
    ).toBe("none");
    expect(
      rendererTouchActionForNextGesture({
        centerX: 0.5,
        centerY: 0.5,
        zoom: 1,
      }),
    ).toBe("pan-x pan-y");
  });

  it("rejects malformed camera zoom instead of guessing ownership", () => {
    expect(() =>
      onePointerPanOwnedAtGestureStart({
        centerX: 0.5,
        centerY: 0.5,
        zoom: Number.NaN,
      }),
    ).toThrow(/camera zoom/);
    expect(() =>
      rendererTouchActionForNextGesture({
        centerX: 0.5,
        centerY: 0.5,
        zoom: 0,
      }),
    ).toThrow(/camera zoom/);
  });
});
