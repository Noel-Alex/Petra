import {
  cameraMotionSpecsEqual,
  copyCameraMotionSpec,
  type CameraMotionSpec,
} from "./cameraMotion";
import {
  rebaseCameraTransitionForMotionSpecChange,
  type CameraTransitionState,
} from "./cameraInteraction";

export interface CameraMotionRuntimeState {
  readonly transition: CameraTransitionState;
  readonly spec: CameraMotionSpec;
}

export interface CameraMotionRuntimeUpdate {
  readonly state: CameraMotionRuntimeState;
  readonly changed: boolean;
}

/**
 * Applies a new camera-motion policy without recreating the renderer.
 *
 * Full-motion updates rebase an active transition from the currently rendered
 * camera. Reduced/off updates only replace the stored policy because those
 * modes already own immediate/static camera state.
 */
export function updateCameraMotionRuntime(
  current: CameraMotionRuntimeState,
  nextSpec: CameraMotionSpec,
  animate: boolean,
): CameraMotionRuntimeUpdate {
  const spec = copyCameraMotionSpec(nextSpec);

  if (cameraMotionSpecsEqual(current.spec, spec)) {
    return { state: current, changed: false };
  }

  const transition = animate
    ? rebaseCameraTransitionForMotionSpecChange(
        current.transition,
        current.spec.durationMs,
        spec.durationMs,
      )
    : {
        ...current.transition,
        elapsedMs: spec.durationMs,
      };

  return {
    state: { transition, spec },
    changed: true,
  };
}
