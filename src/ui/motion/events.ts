import {
  resolveMotion,
  type MotionPreference,
  type MotionTreatment,
} from "./policy";
import { MOTION, type MotionTokenName } from "./tokens";

export type CausalEventKind =
  | "intervention-applied"
  | "mutation-observed"
  | "selection-shift-observed"
  | "nutrient-depletion-observed"
  | "lysis-observed";

export type CausalCueVisual =
  | "field-wave"
  | "impact-ring"
  | "mutation-spark"
  | "lineage-branch"
  | "lineage-outline"
  | "population-shift"
  | "resource-fade"
  | "depletion-contour"
  | "infection-ripple"
  | "lysis-outline";

export interface CausalMotionCue {
  readonly visual: CausalCueVisual;
  readonly essential: boolean;
  readonly startMs: number;
  readonly durationMs: number;
  readonly treatment: MotionTreatment;
  readonly easing: readonly [number, number, number, number];
}

export interface CausalEventChoreography {
  readonly eventKind: CausalEventKind;
  readonly motionToken: MotionTokenName;
  readonly cues: readonly CausalMotionCue[];
  readonly announceText: string;
  readonly cameraPolicy: "preserve-user-view";
  readonly requiresAuthoritativeEvent: true;
  readonly timingMeaning: "presentation-wall-time-only";
}

interface CueSpec {
  readonly visual: CausalCueVisual;
  readonly essential: boolean;
  readonly offset: number;
  readonly share: number;
}

interface ChoreographySpec {
  readonly token: MotionTokenName;
  readonly announceText: string;
  readonly cues: readonly CueSpec[];
}

/**
 * Presentation-only choreography for authoritative scientific events.
 *
 * Adapters may translate these cues into CSS, React Motion, or Pixi effects,
 * but they must never create simulator events from animation callbacks.
 * Wall-clock cue timing is visual emphasis only, never biological duration.
 */
export function resolveCausalEventChoreography(
  eventKind: CausalEventKind,
  preference: MotionPreference,
): CausalEventChoreography {
  const spec = EVENT_SPECS[eventKind];
  const token = MOTION[spec.token];

  const cues = spec.cues
    .filter((cue) => preference !== "off" || cue.essential)
    .map((cue) => resolveCue(cue, token.durationMs, token.easing, preference));

  return {
    eventKind,
    motionToken: spec.token,
    cues,
    announceText: spec.announceText,
    cameraPolicy: "preserve-user-view",
    requiresAuthoritativeEvent: true,
    timingMeaning: "presentation-wall-time-only",
  };
}

const EVENT_SPECS: Readonly<Record<CausalEventKind, ChoreographySpec>> = {
  "intervention-applied": {
    token: "interventionPulse",
    announceText:
      "Intervention recorded. The pulse marks where the command acts; its animation time is not the biological timescale.",
    cues: [
      { visual: "field-wave", essential: true, offset: 0, share: 0.72 },
      { visual: "impact-ring", essential: false, offset: 0.34, share: 0.66 },
    ],
  },
  "mutation-observed": {
    token: "mutationEmphasis",
    announceText:
      "Lineage change recorded. The marker shows where the event appeared; antibiotic does not direct a useful mutation.",
    cues: [
      { visual: "mutation-spark", essential: false, offset: 0, share: 0.42 },
      { visual: "lineage-branch", essential: true, offset: 0.18, share: 0.82 },
    ],
  },
  "selection-shift-observed": {
    token: "selectionEmphasis",
    announceText:
      "Lineage frequencies changed under selection. The emphasis explains an observed shift; it does not create one.",
    cues: [
      { visual: "lineage-outline", essential: true, offset: 0, share: 0.6 },
      { visual: "population-shift", essential: false, offset: 0.3, share: 0.7 },
    ],
  },
  "nutrient-depletion-observed": {
    token: "fieldShift",
    announceText:
      "Nutrient depletion recorded. The texture and contour change reveal authoritative field state.",
    cues: [
      { visual: "resource-fade", essential: true, offset: 0, share: 1 },
      { visual: "depletion-contour", essential: true, offset: 0.22, share: 0.78 },
    ],
  },
  "lysis-observed": {
    token: "lysisBurst",
    announceText:
      "Lysis recorded. The ripple marks an authoritative event; its visual burst is not the infection latency.",
    cues: [
      { visual: "infection-ripple", essential: false, offset: 0, share: 0.46 },
      { visual: "lysis-outline", essential: true, offset: 0.18, share: 0.82 },
    ],
  },
};

function resolveCue(
  cue: CueSpec,
  tokenDurationMs: number,
  easing: readonly [number, number, number, number],
  preference: MotionPreference,
): CausalMotionCue {
  const requestedDurationMs = Math.max(1, Math.round(tokenDurationMs * cue.share));
  const motion = resolveMotion(preference, {
    kind: cue.essential ? "causal" : "decorative",
    durationMs: requestedDurationMs,
  });

  return {
    visual: cue.visual,
    essential: cue.essential,
    startMs: preference === "full" ? Math.round(tokenDurationMs * cue.offset) : 0,
    durationMs: motion.durationMs,
    treatment: motion.treatment,
    easing,
  };
}
