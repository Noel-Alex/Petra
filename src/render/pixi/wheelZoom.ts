export const WHEEL_DELTA_PIXEL = 0 as const;
export const WHEEL_DELTA_LINE = 1 as const;
export const WHEEL_DELTA_PAGE = 2 as const;

export interface WheelZoomPolicy {
  readonly lineEquivalentPx: number;
  readonly maximumDeltaPx: number;
  readonly sensitivityPerPx: number;
}

/**
 * Presentation-only input policy. Browser/device feel is accepted separately.
 */
export const DEFAULT_WHEEL_ZOOM_POLICY: WheelZoomPolicy = Object.freeze({
  lineEquivalentPx: 16,
  maximumDeltaPx: 240,
  sensitivityPerPx: 0.0015,
});

export interface WheelZoomInput {
  readonly deltaY: number;
  readonly deltaMode: number;
  readonly viewportHeight: number;
}

export function normalizeWheelDeltaY(
  input: WheelZoomInput,
  policy: WheelZoomPolicy = DEFAULT_WHEEL_ZOOM_POLICY,
): number {
  validatePolicy(policy);
  if (!Number.isFinite(input.deltaY)) {
    throw new RangeError("deltaY must be finite");
  }
  if (!Number.isFinite(input.viewportHeight) || input.viewportHeight <= 0) {
    throw new RangeError("viewportHeight must be finite and > 0");
  }

  let pixels: number;
  switch (input.deltaMode) {
    case WHEEL_DELTA_PIXEL:
      pixels = input.deltaY;
      break;
    case WHEEL_DELTA_LINE:
      pixels = input.deltaY * policy.lineEquivalentPx;
      break;
    case WHEEL_DELTA_PAGE:
      pixels = input.deltaY * input.viewportHeight;
      break;
    default:
      throw new RangeError(`unsupported wheel deltaMode: ${input.deltaMode}`);
  }

  return Math.min(
    policy.maximumDeltaPx,
    Math.max(-policy.maximumDeltaPx, pixels),
  );
}

export function wheelZoomFactor(
  input: WheelZoomInput,
  policy: WheelZoomPolicy = DEFAULT_WHEEL_ZOOM_POLICY,
): number {
  return Math.exp(
    -normalizeWheelDeltaY(input, policy) * policy.sensitivityPerPx,
  );
}

function validatePolicy(policy: WheelZoomPolicy): void {
  for (const [name, value] of [
    ["lineEquivalentPx", policy.lineEquivalentPx],
    ["maximumDeltaPx", policy.maximumDeltaPx],
    ["sensitivityPerPx", policy.sensitivityPerPx],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError(`${name} must be finite and > 0`);
    }
  }
}
