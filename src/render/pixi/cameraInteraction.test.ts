import { describe, expect, it } from "vitest";
import type { CameraView } from "../model";
import {
  dishToScreen,
  panCamera,
  resolveDishViewportGeometry,
  screenToDish,
  zoomAroundDishPoint,
} from "./camera";
import {
  applyDirectCamera,
  beginRebasedCameraTransition,
  completeCameraTransitionAtRendered,
  retargetWheelZoomFromRendered,
  type CameraTransitionState,
} from "./cameraInteraction";

const DURATION = 520;
const VIEWPORT = { width: 900, height: 700 };
const HALF_COMPLETE: CameraTransitionState = {
  camera: { centerX: 0.46, centerY: 0.52, zoom: 1.8 },
  transitionStartCamera: { centerX: 0.5, centerY: 0.5, zoom: 1 },
  targetCamera: { centerX: 0.32, centerY: 0.4, zoom: 3.2 },
  elapsedMs: 210,
};

describe("camera interruption policy", () => {
  it("cancels direct manipulation at the currently rendered camera", () => {
    const settled = completeCameraTransitionAtRendered(HALF_COMPLETE, DURATION);
    expect(settled.camera).toEqual(HALF_COMPLETE.camera);
    expect(settled.transitionStartCamera).toEqual(HALF_COMPLETE.camera);
    expect(settled.targetCamera).toEqual(HALF_COMPLETE.camera);

    const panned = applyDirectCamera(
      settled,
      panCamera(settled.camera, { x: 24, y: -12 }, VIEWPORT),
      DURATION,
    );
    expect(panned.camera).not.toEqual(HALF_COMPLETE.targetCamera);
    expect(panned.camera).toEqual(panned.targetCamera);
  });

  it("keeps pinch math anchored to the visible camera", () => {
    const screen = { x: 610, y: 305 };
    const anchor = screenToDish(screen, VIEWPORT, HALF_COMPLETE.camera);
    const zoomed = zoomAroundDishPoint(HALF_COMPLETE.camera, anchor, 1.35);
    const direct = applyDirectCamera(HALF_COMPLETE, zoomed, DURATION);
    const projected = dishToScreen(
      anchor,
      direct.camera,
      resolveDishViewportGeometry(VIEWPORT),
    );

    expect(projected.x).toBeCloseTo(screen.x, 8);
    expect(projected.y).toBeCloseTo(screen.y, 8);
  });

  it("rebases wheel zoom from visible pixels while accumulating pending zoom intent", () => {
    const screen = { x: 650, y: 340 };
    const anchor = screenToDish(screen, VIEWPORT, HALF_COMPLETE.camera);
    const first = retargetWheelZoomFromRendered({
      state: HALF_COMPLETE,
      screen,
      viewport: VIEWPORT,
      factor: 1.2,
      policy: { animate: true, durationMs: DURATION },
    });

    expect(first.camera).toEqual(HALF_COMPLETE.camera);
    expect(first.transitionStartCamera).toEqual(HALF_COMPLETE.camera);
    expect(first.targetCamera.zoom).toBeGreaterThan(HALF_COMPLETE.targetCamera.zoom);

    const second = retargetWheelZoomFromRendered({
      state: first,
      screen,
      viewport: VIEWPORT,
      factor: 1.2,
      policy: { animate: true, durationMs: DURATION },
    });
    expect(second.targetCamera.zoom).toBeGreaterThan(first.targetCamera.zoom);

    const projected = dishToScreen(
      anchor,
      second.targetCamera,
      resolveDishViewportGeometry(VIEWPORT),
    );
    expect(projected.x).toBeCloseTo(screen.x, 8);
    expect(projected.y).toBeCloseTo(screen.y, 8);
  });

  it("starts double-click style focus transitions from the rendered camera", () => {
    const screen = { x: 570, y: 290 };
    const anchor = screenToDish(screen, VIEWPORT, HALF_COMPLETE.camera);
    const next = beginRebasedCameraTransition(
      HALF_COMPLETE,
      { centerX: anchor.x, centerY: anchor.y, zoom: 3.2 },
      { animate: true, durationMs: DURATION },
    );

    expect(next.camera).toEqual(HALF_COMPLETE.camera);
    expect(next.transitionStartCamera).toEqual(HALF_COMPLETE.camera);
    expect(next.targetCamera.centerX).toBeCloseTo(anchor.x, 8);
    expect(next.targetCamera.centerY).toBeCloseTo(anchor.y, 8);
  });

  it("allows keyboard target intent to accumulate while rebasing animation from rendered state", () => {
    const pendingTarget: CameraView = {
      centerX: 0.36,
      centerY: 0.42,
      zoom: 4,
    };
    const next = beginRebasedCameraTransition(
      HALF_COMPLETE,
      pendingTarget,
      { animate: true, durationMs: DURATION },
    );

    expect(next.transitionStartCamera).toEqual(HALF_COMPLETE.camera);
    expect(next.targetCamera).toEqual(pendingTarget);
    expect(next.elapsedMs).toBe(0);
  });

  it("keeps reduced/off-style retargets immediate", () => {
    const target = { centerX: 0.4, centerY: 0.4, zoom: 2.5 };
    const next = beginRebasedCameraTransition(
      HALF_COMPLETE,
      target,
      { animate: false, durationMs: DURATION },
    );

    expect(next.camera).toEqual(next.targetCamera);
    expect(next.transitionStartCamera).toEqual(next.targetCamera);
    expect(next.elapsedMs).toBe(DURATION);
  });
});
