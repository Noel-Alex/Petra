export type MotionPreference = "full" | "reduced" | "off";

export type MotionKind =
  | "causal"
  | "spatial"
  | "navigational"
  | "decorative";

export type MotionTreatment =
  | "animate"
  | "crossfade"
  | "instant"
  | "static-emphasis";

export interface MotionRequest {
  readonly kind: MotionKind;
  readonly durationMs: number;
  readonly distancePx?: number;
  readonly loops?: boolean;
}

export interface ResolvedMotion {
  readonly treatment: MotionTreatment;
  readonly durationMs: number;
  readonly loops: boolean;
}

/**
 * Resolves product motion without changing scientific state.
 *
 * Reduced motion preserves causal meaning while removing large transforms,
 * persistent movement and decorative loops. "off" keeps only static causal
 * emphasis so a mutation/intervention is still perceivable without animation.
 */
export function resolveMotion(
  preference: MotionPreference,
  request: MotionRequest,
): ResolvedMotion {
  const durationMs = sanitizeDuration(request.durationMs);
  const loops = request.loops === true;

  if (preference === "full") {
    return {
      treatment: "animate",
      durationMs,
      loops,
    };
  }

  if (preference === "off") {
    return request.kind === "causal"
      ? { treatment: "static-emphasis", durationMs: 0, loops: false }
      : { treatment: "instant", durationMs: 0, loops: false };
  }

  if (request.kind === "causal") {
    return {
      treatment: "crossfade",
      durationMs: clamp(durationMs, 90, 180),
      loops: false,
    };
  }

  if (request.kind === "navigational") {
    return {
      treatment: "crossfade",
      durationMs: clamp(durationMs, 80, 150),
      loops: false,
    };
  }

  return {
    treatment: "instant",
    durationMs: 0,
    loops: false,
  };
}

export function resolveMotionPreference(args: {
  readonly explicit?: MotionPreference;
  readonly prefersReducedMotion: boolean;
}): MotionPreference {
  if (args.explicit !== undefined) {
    return args.explicit;
  }

  return args.prefersReducedMotion ? "reduced" : "full";
}

function sanitizeDuration(durationMs: number): number {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    throw new RangeError("motion duration must be a finite non-negative number");
  }

  return Math.round(durationMs);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
