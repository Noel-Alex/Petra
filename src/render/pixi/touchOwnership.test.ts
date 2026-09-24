import { describe, expect, it } from "vitest";
import {
  onePointerPanOwnedAtGestureStart,
  rendererOwnsGestureIntent,
  rendererTouchActionForNextGesture,
} from "./touchOwnership";

const overview = { centerX: 0.5, centerY: 0.5, zoom: 1 };
const zoomed = { centerX: 0.5, centerY: 0.5, zoom: 2 };

describe("renderer touch ownership", () => {
  it("leaves one-pointer overview pan to the browser", () => {
    const panOwned = onePointerPanOwnedAtGestureStart(overview);

    expect(panOwned).toBe(false);
    expect(rendererOwnsGestureIntent("pan", panOwned)).toBe(false);
    expect(rendererTouchActionForNextGesture(overview)).toBe("pan-x pan-y");
  });

  it("owns one-pointer pan when a gesture starts zoomed", () => {
    const panOwned = onePointerPanOwnedAtGestureStart(zoomed);

    expect(panOwned).toBe(true);
    expect(rendererOwnsGestureIntent("pan", panOwned)).toBe(true);
    expect(rendererTouchActionForNextGesture(zoomed)).toBe("none");
  });

  it("always owns a two-pointer pinch admitted to the dish", () => {
    expect(rendererOwnsGestureIntent("pinch", false)).toBe(true);
    expect(rendererOwnsGestureIntent("pinch", true)).toBe(true);
  });

  it("does not claim no-op movement", () => {
    expect(rendererOwnsGestureIntent("none", false)).toBe(false);
    expect(rendererOwnsGestureIntent("none", true)).toBe(false);
  });

  it("keeps gesture-start ownership stable across later camera changes", () => {
    const overviewStartedPanOwned =
      onePointerPanOwnedAtGestureStart(overview);
    const zoomedStartedPanOwned =
      onePointerPanOwnedAtGestureStart(zoomed);

    expect(
      rendererOwnsGestureIntent("pan", overviewStartedPanOwned),
    ).toBe(false);
    expect(rendererTouchActionForNextGesture(zoomed)).toBe("none");
    expect(
      rendererOwnsGestureIntent("pan", overviewStartedPanOwned),
    ).toBe(false);

    expect(
      rendererOwnsGestureIntent("pan", zoomedStartedPanOwned),
    ).toBe(true);
    expect(rendererTouchActionForNextGesture(overview)).toBe("pan-x pan-y");
    expect(
      rendererOwnsGestureIntent("pan", zoomedStartedPanOwned),
    ).toBe(true);
  });

  it("rejects invalid camera zoom through the shared camera policy", () => {
    expect(() =>
      onePointerPanOwnedAtGestureStart({
        centerX: 0.5,
        centerY: 0.5,
        zoom: Number.NaN,
      }),
    ).toThrow();
  });
});
