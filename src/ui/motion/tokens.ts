export interface MotionToken {
  readonly durationMs: number;
  readonly easing: readonly [number, number, number, number];
}

/**
 * Original Petra motion tokens. These values are presentation policy only:
 * they do not encode biological rates or mechanism duration.
 */
export const MOTION = {
  panel: {
    durationMs: 220,
    easing: [0.2, 0.8, 0.2, 1],
  },
  cameraFocus: {
    durationMs: 520,
    easing: [0.16, 1, 0.3, 1],
  },
  interventionPulse: {
    durationMs: 420,
    easing: [0.22, 0.78, 0.28, 1],
  },
  mutationEmphasis: {
    durationMs: 360,
    easing: [0.18, 0.9, 0.24, 1],
  },
  selectionEmphasis: {
    durationMs: 720,
    easing: [0.18, 0.82, 0.22, 1],
  },
  fieldShift: {
    durationMs: 600,
    easing: [0.18, 0.74, 0.24, 1],
  },
  lysisBurst: {
    durationMs: 440,
    easing: [0.2, 0.86, 0.24, 1],
  },
  tooltip: {
    durationMs: 140,
    easing: [0.2, 0.7, 0.3, 1],
  },
} as const satisfies Record<string, MotionToken>;

export type MotionTokenName = keyof typeof MOTION;
