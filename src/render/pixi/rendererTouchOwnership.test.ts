import { describe, expect, it } from "vitest";

import pixiDishSource from "./PixiDish.tsx?raw";
import rendererSource from "./renderer.ts?raw";

describe("Pixi touch ownership integration", () => {
  it("leaves host touch-action under renderer camera policy", () => {
    expect(pixiDishSource).not.toContain(
      'touchAction: rendererInteractive ? "none" : "auto"',
    );
    expect(rendererSource).toContain(
      "rendererTouchActionForNextGesture(camera)",
    );
    expect(rendererSource).toContain(
      "const previousHostTouchAction = host.style.touchAction",
    );
    expect(rendererSource).toContain(
      "host.style.touchAction = previousHostTouchAction",
    );
  });

  it("latches one-pointer ownership only when a new admitted gesture starts", () => {
    const start = rendererSource.indexOf("const onPointerDown");
    const end = rendererSource.indexOf("const onPointerMove");
    const pointerDown = rendererSource.slice(start, end);

    expect(pointerDown).toContain(
      "const startingNewGesture = gestureState.active.length === 0",
    );
    expect(pointerDown).toContain(
      "onePointerPanOwned = onePointerPanOwnedAtGestureStart(camera)",
    );
    expect(pointerDown).not.toContain(
      "completeCameraTransitionAtRendered",
    );
  });

  it("checks ownership before rebasing camera or preventing browser default", () => {
    const start = rendererSource.indexOf("const onPointerMove");
    const end = rendererSource.indexOf("const finishPointer");
    const pointerMove = rendererSource.slice(start, end);

    const ownershipIndex = pointerMove.indexOf(
      "rendererOwnsGestureIntent",
    );
    const rebaseIndex = pointerMove.indexOf(
      "completeCameraTransitionAtRendered",
    );
    const preventIndex = pointerMove.indexOf("event.preventDefault()");

    expect(ownershipIndex).toBeGreaterThanOrEqual(0);
    expect(rebaseIndex).toBeGreaterThan(ownershipIndex);
    expect(preventIndex).toBeGreaterThan(rebaseIndex);
    expect(pointerMove).not.toContain("if (camera.zoom <= 1) return");
  });

  it("releases the latched ownership after the last pointer ends", () => {
    const start = rendererSource.indexOf("const finishPointer");
    const end = rendererSource.indexOf("const onWheel");
    const finish = rendererSource.slice(start, end);

    expect(finish).toContain(
      "if (gestureState.active.length === 0)",
    );
    expect(finish).toContain("onePointerPanOwned = false");
  });
});
