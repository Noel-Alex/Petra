import type { CameraView } from "../model";
import {
  clampCamera,
  screenToDish,
  zoomAroundDishPoint,
  type ScreenPoint,
  type ViewportSize,
} from "./camera";

export interface CameraTransitionState {
  readonly camera: CameraView;
  readonly transitionStartCamera: CameraView;
  readonly targetCamera: CameraView;
  readonly elapsedMs: number;
}

export interface CameraRetargetPolicy {
  readonly animate: boolean;
  readonly durationMs: number;
}

export function completeCameraTransitionAtRendered(
  state: CameraTransitionState,
  durationMs: number,
): CameraTransitionState {
  assertDuration(durationMs);
  const camera = clampCamera(state.camera);
  return {
    camera,
    transitionStartCamera: camera,
    targetCamera: camera,
    elapsedMs: durationMs,
  };
}

export function applyDirectCamera(
  state: CameraTransitionState,
  nextCamera: CameraView,
  durationMs: number,
): CameraTransitionState {
  assertDuration(durationMs);
  const camera = clampCamera(nextCamera);
  return {
    camera,
    transitionStartCamera: camera,
    targetCamera: camera,
    elapsedMs: durationMs,
  };
}

export function beginRebasedCameraTransition(
  state: CameraTransitionState,
  nextTarget: CameraView,
  policy: CameraRetargetPolicy,
): CameraTransitionState {
  assertDuration(policy.durationMs);
  const targetCamera = clampCamera(nextTarget);

  if (!policy.animate || policy.durationMs === 0) {
    return {
      camera: targetCamera,
      transitionStartCamera: targetCamera,
      targetCamera,
      elapsedMs: policy.durationMs,
    };
  }

  const camera = clampCamera(state.camera);
  return {
    camera,
    transitionStartCamera: camera,
    targetCamera,
    elapsedMs: 0,
  };
}

export function rebaseCameraTransitionForMotionSpecChange(
  state: CameraTransitionState,
  previousDurationMs: number,
  nextDurationMs: number,
): CameraTransitionState {
  assertDuration(previousDurationMs);
  assertDuration(nextDurationMs);

  const transitionActive =
    previousDurationMs > 0 && state.elapsedMs < previousDurationMs;

  if (!transitionActive) {
    return {
      camera: clampCamera(state.camera),
      transitionStartCamera: clampCamera(state.camera),
      targetCamera: clampCamera(state.targetCamera),
      elapsedMs: nextDurationMs,
    };
  }

  const targetCamera = clampCamera(state.targetCamera);
  if (nextDurationMs === 0) {
    return {
      camera: targetCamera,
      transitionStartCamera: targetCamera,
      targetCamera,
      elapsedMs: 0,
    };
  }

  const camera = clampCamera(state.camera);
  return {
    camera,
    transitionStartCamera: camera,
    targetCamera,
    elapsedMs: 0,
  };
}

export function retargetWheelZoomFromRendered(args: {
  readonly state: CameraTransitionState;
  readonly screen: ScreenPoint;
  readonly viewport: ViewportSize;
  readonly factor: number;
  readonly policy: CameraRetargetPolicy;
}): CameraTransitionState {
  const anchor = screenToDish(args.screen, args.viewport, args.state.camera);
  const accumulatedZoom = zoomAroundDishPoint(
    args.state.targetCamera,
    {
      x: args.state.targetCamera.centerX,
      y: args.state.targetCamera.centerY,
    },
    args.factor,
  ).zoom;
  const nextTarget = zoomAroundDishPoint(
    args.state.camera,
    anchor,
    accumulatedZoom / args.state.camera.zoom,
  );

  return beginRebasedCameraTransition(args.state, nextTarget, args.policy);
}

function assertDuration(durationMs: number): void {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    throw new RangeError("camera transition duration must be finite and non-negative");
  }
}
