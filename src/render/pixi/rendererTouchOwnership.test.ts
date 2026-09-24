import { describe, expect, it } from "vitest";
import rendererSource from "./renderer.ts?raw";

describe("Pixi touch ownership integration", () => {
  it("latches one-pointer ownership only when a new admitted gesture begins", () => {
    const downStart = rendererSource.indexOf(
      "const onPointerDown = (event: PointerEvent) => {",
    );
    const moveStart = rendererSource.indexOf(
      "const onPointerMove = (event: PointerEvent) => {",
      downStart,
    );
    const down = rendererSource.slice(downStart, moveStart);

    expect(down).toContain(
      "const startingNewGesture = gestureState.active.length === 0;",
    );
    expect(down).toContain("if (!started.accepted) return;");
    expect(down).toContain(
      "onePointerPanOwned = onePointerPanOwnedAtGestureStart(camera);",
    );
    expect(down).not.toContain("completeCameraTransitionAtRendered(");
  });

  it("claims browser default only after an intent is confirmed renderer-owned", () => {
    const moveStart = rendererSource.indexOf(
      "const onPointerMove = (event: PointerEvent) => {",
    );
    const finishStart = rendererSource.indexOf(
      "const finishPointer = (event: PointerEvent) => {",
      moveStart,
    );
    const move = rendererSource.slice(moveStart, finishStart);

    const ownershipCheck = move.indexOf("rendererOwnsGestureIntent(");
    const transitionSettle = move.indexOf("completeCameraTransitionAtRendered(");
    const preventDefault = move.indexOf("event.preventDefault();");

    expect(ownershipCheck).toBeGreaterThan(-1);
    expect(transitionSettle).toBeGreaterThan(ownershipCheck);
    expect(preventDefault).toBeGreaterThan(transitionSettle);
    expect(move).not.toContain("if (camera.zoom <= 1) return;");
  });

  it("clears latched ownership when the last pointer ends or is cancelled", () => {
    const finishStart = rendererSource.indexOf(
      "const finishPointer = (event: PointerEvent) => {",
    );
    const wheelStart = rendererSource.indexOf(
      "const onWheel = (event: WheelEvent) => {",
      finishStart,
    );
    const finish = rendererSource.slice(finishStart, wheelStart);

    expect(finish).toContain("gestureState.active.length === 0");
    expect(finish).toContain("onePointerPanOwned = false;");
    expect(rendererSource).toContain(
      'app.canvas.addEventListener("pointercancel", finishPointer);',
    );
  });

  it("owns host touch-action for the renderer lifetime and restores it", () => {
    expect(rendererSource).toContain(
      "const previousHostTouchAction = host.style.touchAction;",
    );
    expect(rendererSource).toContain(
      "rendererTouchActionForNextGesture(camera)",
    );
    expect(rendererSource).toContain(
      "host.style.touchAction = nextTouchAction;",
    );
    expect(rendererSource).toContain(
      "host.style.touchAction = previousHostTouchAction;",
    );
  });
});
