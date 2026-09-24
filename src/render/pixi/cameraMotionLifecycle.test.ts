import { describe, expect, it } from "vitest";

import type { CameraMotionSpec } from "./cameraMotion";
import {
  updateCameraMotionRuntime,
  type CameraMotionRuntimeState,
} from "./cameraMotionLifecycle";

const FULL: CameraMotionSpec = {
  durationMs: 520,
  easing: [0.16, 1, 0.3, 1],
};
const ALT: CameraMotionSpec = {
  durationMs: 320,
  easing: [0.2, 0.8, 0.25, 1],
};
const OFF: CameraMotionSpec = {
  durationMs: 0,
  easing: [0.16, 1, 0.3, 1],
};

function activeState(spec: CameraMotionSpec = FULL): CameraMotionRuntimeState {
  return {
    spec,
    transition: {
      camera: { centerX: 0.46, centerY: 0.52, zoom: 1.8 },
      transitionStartCamera: { centerX: 0.5, centerY: 0.5, zoom: 1 },
      targetCamera: { centerX: 0.32, centerY: 0.4, zoom: 3.2 },
      elapsedMs: 210,
    },
  };
}

describe("live camera-motion policy", () => {
  it("does nothing for an equal spec", () => {
    const current = activeState();
    const update = updateCameraMotionRuntime(
      current,
      { durationMs: 520, easing: [0.16, 1, 0.3, 1] },
      true,
    );

    expect(update.changed).toBe(false);
    expect(update.state).toBe(current);
  });

  it("rebases an in-flight Full transition from the rendered camera", () => {
    const current = activeState();
    const update = updateCameraMotionRuntime(current, ALT, true);

    expect(update.changed).toBe(true);
    expect(update.state.transition.camera).toEqual(current.transition.camera);
    expect(update.state.transition.transitionStartCamera).toEqual(
      current.transition.camera,
    );
    expect(update.state.transition.targetCamera).toEqual(
      current.transition.targetCamera,
    );
    expect(update.state.transition.elapsedMs).toBe(0);
    expect(update.state.spec).toEqual(ALT);
  });

  it("finishes an in-flight transition immediately when duration becomes zero", () => {
    const current = activeState();
    const update = updateCameraMotionRuntime(current, OFF, true);

    expect(update.state.transition.camera).toEqual(
      current.transition.targetCamera,
    );
    expect(update.state.transition.transitionStartCamera).toEqual(
      current.transition.targetCamera,
    );
    expect(update.state.transition.targetCamera).toEqual(
      current.transition.targetCamera,
    );
    expect(update.state.transition.elapsedMs).toBe(0);
  });

  it("updates Reduced/Off policy without creating camera travel", () => {
    const settled: CameraMotionRuntimeState = {
      spec: OFF,
      transition: {
        camera: { centerX: 0.4, centerY: 0.4, zoom: 2 },
        transitionStartCamera: { centerX: 0.4, centerY: 0.4, zoom: 2 },
        targetCamera: { centerX: 0.4, centerY: 0.4, zoom: 2 },
        elapsedMs: 0,
      },
    };

    const update = updateCameraMotionRuntime(settled, FULL, false);
    expect(update.state.transition.camera).toEqual(settled.transition.camera);
    expect(update.state.transition.targetCamera).toEqual(
      settled.transition.targetCamera,
    );
    expect(update.state.transition.elapsedMs).toBe(FULL.durationMs);
  });

  it("copies the incoming spec so later caller mutation cannot alter policy", () => {
    const easing = [0.2, 0.8, 0.25, 1] as [number, number, number, number];
    const next = { durationMs: 320, easing };
    const update = updateCameraMotionRuntime(activeState(), next, true);

    easing[0] = 0.9;
    next.durationMs = 999;

    expect(update.state.spec).toEqual(ALT);
    expect(Object.isFrozen(update.state.spec)).toBe(true);
    expect(Object.isFrozen(update.state.spec.easing)).toBe(true);
  });

  it("rejects invalid incoming policy before changing runtime state", () => {
    const current = activeState();
    expect(() =>
      updateCameraMotionRuntime(
        current,
        { durationMs: -1, easing: [0.16, 1, 0.3, 1] },
        true,
      ),
    ).toThrow(/duration/);

    expect(() =>
      updateCameraMotionRuntime(
        current,
        { durationMs: 100, easing: [1.2, 1, 0.3, 1] },
        true,
      ),
    ).toThrow(/x1/);
  });
});
