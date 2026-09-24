import {
  resolveMotion,
  type MotionPreference,
  type ResolvedMotion,
} from "./policy";

export const DECORATIVE_LOOP_SCHEMA_VERSION = 1 as const;

export const DECORATIVE_LOOPS = {
  onboardingAmbientPrimary: {
    durationMs: 8_000,
    easing: [0.42, 0, 0.58, 1],
  },
  onboardingAmbientSecondary: {
    durationMs: 11_000,
    easing: [0.42, 0, 0.58, 1],
  },
  onboardingFocusOrbit: {
    durationMs: 12_000,
    easing: [0, 0, 1, 1],
  },
} as const;

export type DecorativeLoopName = keyof typeof DECORATIVE_LOOPS;

export interface ResolvedDecorativeLoop {
  readonly name: DecorativeLoopName;
  readonly motion: ResolvedMotion;
  readonly easing: readonly [number, number, number, number];
}

export function resolveDecorativeLoop(
  name: DecorativeLoopName,
  preference: MotionPreference,
): ResolvedDecorativeLoop {
  const token = DECORATIVE_LOOPS[name];
  return {
    name,
    motion: resolveMotion(preference, {
      kind: "decorative",
      durationMs: token.durationMs,
      loops: true,
    }),
    easing: token.easing,
  };
}
