import type { CameraMotionSpec } from "../render/pixi/cameraMotion";
import {
  resolveMotion,
  type MotionPreference,
  type MotionTreatment,
} from "../ui/motion/policy";
import { MOTION } from "../ui/motion/tokens";

export interface DishCameraMotionPlan {
  readonly mode: MotionPreference;
  readonly treatment: MotionTreatment;
  readonly cameraMotion: CameraMotionSpec;
}

/**
 * Projects Petra's shared navigation policy into the generic Pixi camera
 * interpolation contract.
 *
 * CameraMotionSpec describes spatial travel only. Reduced/off modes therefore
 * request zero travel; their distinct presentation semantics remain carried by
 * the renderer motion mode and surrounding UI rather than a hidden 520 ms spec.
 */
export function resolveDishCameraMotion(
  mode: MotionPreference,
): DishCameraMotionPlan {
  const resolved = resolveMotion(mode, {
    kind: "navigational",
    durationMs: MOTION.cameraFocus.durationMs,
  });

  return {
    mode,
    treatment: resolved.treatment,
    cameraMotion: {
      durationMs: resolved.treatment === "animate" ? resolved.durationMs : 0,
      easing: MOTION.cameraFocus.easing,
    },
  };
}
