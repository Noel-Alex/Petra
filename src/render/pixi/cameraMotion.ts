import type { CameraView } from "../model";

export type MotionEasing = readonly [number, number, number, number];

export interface CameraMotionSpec {
  readonly durationMs: number;
  readonly easing: MotionEasing;
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

/**
 * Resolve the y-value of a CSS-style cubic-bezier curve at normalized x=time.
 * Newton iteration handles the common case; bisection keeps the result stable
 * for flatter curves. Inputs are presentation policy only.
 */
export function cubicBezierProgress(
  progress: number,
  easing: MotionEasing,
): number {
  const x = clamp01(progress);
  if (x === 0 || x === 1) return x;

  const [x1, y1, x2, y2] = easing;
  validateControlPoint(x1, "x1");
  validateControlPoint(x2, "x2");

  let t = x;
  for (let iteration = 0; iteration < 6; iteration += 1) {
    const estimate = cubicBezierCoordinate(t, x1, x2) - x;
    const derivative = cubicBezierDerivative(t, x1, x2);
    if (Math.abs(estimate) < 1e-6) break;
    if (Math.abs(derivative) < 1e-6) {
      t = solveBezierByBisection(x, x1, x2);
      break;
    }
    const next = t - estimate / derivative;
    if (next < 0 || next > 1) {
      t = solveBezierByBisection(x, x1, x2);
      break;
    }
    t = next;
  }

  return cubicBezierCoordinate(clamp01(t), y1, y2);
}

function solveBezierByBisection(x: number, x1: number, x2: number): number {
  let lower = 0;
  let upper = 1;
  let t = x;

  for (let iteration = 0; iteration < 18; iteration += 1) {
    t = (lower + upper) / 2;
    const estimate = cubicBezierCoordinate(t, x1, x2);
    if (Math.abs(estimate - x) < 1e-6) break;
    if (estimate < x) lower = t;
    else upper = t;
  }

  return t;
}

function cubicBezierCoordinate(t: number, p1: number, p2: number): number {
  const oneMinusT = 1 - t;
  return (
    3 * oneMinusT * oneMinusT * t * p1 +
    3 * oneMinusT * t * t * p2 +
    t * t * t
  );
}

function cubicBezierDerivative(t: number, p1: number, p2: number): number {
  const oneMinusT = 1 - t;
  return (
    3 * oneMinusT * oneMinusT * p1 +
    6 * oneMinusT * t * (p2 - p1) +
    3 * t * t * (1 - p2)
  );
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

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    throw new RangeError("camera motion progress must be finite");
  }
  return Math.min(1, Math.max(0, value));
}

function mix(current: number, target: number, amount: number): number {
  return current + (target - current) * amount;
}
