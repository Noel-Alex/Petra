import type { CameraView } from "../model";
import {
  cubicBezierProgress,
  type MotionEasing,
} from "../motionMath";

export { cubicBezierProgress };
export type { MotionEasing };

export interface CameraMotionSpec {
  readonly durationMs: number;
  readonly easing: MotionEasing;
}

export function copyCameraMotionSpec(
  spec: CameraMotionSpec,
): CameraMotionSpec {
  const durationMs = validateDuration(spec.durationMs);
  const [x1, y1, x2, y2] = spec.easing;
  validateControlPoint(x1, "x1");
  validateFiniteControlPoint(y1, "y1");
  validateControlPoint(x2, "x2");
  validateFiniteControlPoint(y2, "y2");

  return Object.freeze({
    durationMs,
    easing: Object.freeze([x1, y1, x2, y2]) as MotionEasing,
  });
}

export function cameraMotionSpecsEqual(
  left: CameraMotionSpec,
  right: CameraMotionSpec,
): boolean {
  return (
    left.durationMs === right.durationMs &&
    left.easing[0] === right.easing[0] &&
    left.easing[1] === right.easing[1] &&
    left.easing[2] === right.easing[2] &&
    left.easing[3] === right.easing[3]
  );
}

export function interpolateCameraTransition(args: {
  readonly from: CameraView;
  readonly to: CameraView;
  readonly elapsedMs: number;
  readonly motion: CameraMotionSpec;
}): CameraView {
  const durationMs = validateDuration(args.motion.durationMs);
  const elapsedMs = validateElapsed(args.elapsedMs);

  if (durationMs === 0 || elapsedMs >= durationMs) {
    return args.to;
  }

  const progress = elapsedMs / durationMs;
  const eased = cubicBezierProgress(progress, args.motion.easing);
  return {
    centerX: mix(args.from.centerX, args.to.centerX, eased),
    centerY: mix(args.from.centerY, args.to.centerY, eased),
    zoom: mix(args.from.zoom, args.to.zoom, eased),
  };
}

export function cameraTransitionComplete(args: {
  readonly elapsedMs: number;
  readonly durationMs: number;
}): boolean {
  return validateDuration(args.durationMs) === 0 ||
    validateElapsed(args.elapsedMs) >= args.durationMs;
}

function validateDuration(durationMs: number): number {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    throw new RangeError("camera motion duration must be finite and non-negative");
  }
  return durationMs;
}

function validateElapsed(elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    throw new RangeError("camera motion elapsed time must be finite and non-negative");
  }
  return elapsedMs;
}

function validateControlPoint(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${label} must be within [0, 1]`);
  }
}

function validateFiniteControlPoint(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be finite`);
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    throw new RangeError("camera motion progress must be finite");
  }
  return Math.min(1, Math.max(0, value));
}

function mix(current: number, target: number, amount: number): number {
  return current + (target - current) * amount;
}
