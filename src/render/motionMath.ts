export type MotionEasing = readonly [number, number, number, number];

/**
 * Resolve the y-value of a CSS-style cubic-bezier curve at normalized x=time.
 *
 * This is renderer-level presentation math shared by camera and biological
 * visual continuity. It has no Pixi, DOM, or scientific-state authority.
 */
export function cubicBezierProgress(
  progress: number,
  easing: MotionEasing,
): number {
  const x = clamp01(progress);
  if (x === 0 || x === 1) return x;

  const [x1, y1, x2, y2] = easing;
  validateControlPoint(x1, "x1");
  validateFiniteControlPoint(y1, "y1");
  validateControlPoint(x2, "x2");
  validateFiniteControlPoint(y2, "y2");

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

function solveBezierByBisection(
  x: number,
  x1: number,
  x2: number,
): number {
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

function cubicBezierCoordinate(
  t: number,
  p1: number,
  p2: number,
): number {
  const oneMinusT = 1 - t;
  return (
    3 * oneMinusT * oneMinusT * t * p1 +
    3 * oneMinusT * t * t * p2 +
    t * t * t
  );
}

function cubicBezierDerivative(
  t: number,
  p1: number,
  p2: number,
): number {
  const oneMinusT = 1 - t;
  return (
    3 * oneMinusT * oneMinusT * p1 +
    6 * oneMinusT * t * (p2 - p1) +
    3 * t * t * (1 - p2)
  );
}

function validateControlPoint(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${label} must be within [0, 1]`);
  }
}

function validateFiniteControlPoint(
  value: number,
  label: string,
): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be finite`);
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    throw new RangeError("motion progress must be finite");
  }
  return Math.min(1, Math.max(0, value));
}
