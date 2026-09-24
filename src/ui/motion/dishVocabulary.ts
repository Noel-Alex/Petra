import {
  resolveMotion,
  type MotionKind,
  type MotionPreference,
  type MotionTreatment,
} from "./policy";
import { MOTION, type MotionTokenName } from "./tokens";

export const DISH_MOTION_PHASES = [
  "appear",
  "grow",
  "divide",
  "aggregate-merge",
  "recede",
  "migrate",
  "fungal-branch",
  "field-diffusion",
  "select",
  "intervention-placement",
  "focus",
] as const;

export type DishMotionPhase = (typeof DISH_MOTION_PHASES)[number];

export type DishMotionEvidence =
  | "none"
  | "authoritative-state"
  | "authoritative-event"
  | "presentation-intent"
  | "presentation-lod";

export type DishMotionVisualChannel =
  | "opacity"
  | "density"
  | "radius"
  | "position"
  | "path-length"
  | "contour"
  | "field-texture"
  | "outline"
  | "camera";

type RequiredDishMotionEvidence = Exclude<DishMotionEvidence, "none">;

interface DishMotionPhaseSpec {
  readonly token: MotionTokenName;
  readonly kind: MotionKind;
  readonly acceptedEvidence: readonly RequiredDishMotionEvidence[];
  readonly channels: readonly DishMotionVisualChannel[];
  readonly semanticBoundary:
    | "authoritative-change-presentation"
    | "presentation-only-lod"
    | "presentation-only-interaction";
  readonly preserveUserCamera: boolean;
}

export interface DishMotionPhaseRequest {
  readonly phase: DishMotionPhase;
  readonly preference: MotionPreference;
  /**
   * Explicit reason this visual phase is allowed to run.
   *
   * Biological-looking phases fail closed unless their caller supplies
   * authoritative state/event evidence. Presentation-only phases require an
   * explicit interaction or LOD intent instead.
   */
  readonly evidence?: DishMotionEvidence;
}

export interface DishMotionPhasePlan {
  readonly eligible: true;
  readonly phase: DishMotionPhase;
  readonly token: MotionTokenName;
  readonly treatment: MotionTreatment;
  readonly durationMs: number;
  readonly easing: readonly [number, number, number, number];
  readonly channels: readonly DishMotionVisualChannel[];
  readonly semanticBoundary: DishMotionPhaseSpec["semanticBoundary"];
  readonly preserveUserCamera: boolean;
  readonly timingMeaning: "presentation-wall-time-only";
}

export interface DishMotionPhaseRefusal {
  readonly eligible: false;
  readonly phase: DishMotionPhase;
  readonly reason: "evidence-mismatch";
  readonly receivedEvidence: DishMotionEvidence;
  readonly acceptedEvidence: readonly RequiredDishMotionEvidence[];
}

export type DishMotionPhaseResult =
  | DishMotionPhasePlan
  | DishMotionPhaseRefusal;

/**
 * Resolve one named Petra dish-motion phase without granting it scientific
 * authority.
 *
 * The vocabulary describes how already-authorized change may be presented.
 * It never decides that growth, division, death, migration, branching, or
 * diffusion happened. Those phases require explicit authoritative evidence.
 */
export function planDishMotionPhase(
  request: DishMotionPhaseRequest,
): DishMotionPhaseResult {
  const spec: DishMotionPhaseSpec | undefined = PHASE_SPECS[request.phase];
  if (spec === undefined) {
    throw new RangeError(
      `unknown dish motion phase: ${String(request.phase)}`,
    );
  }

  const evidence = request.evidence ?? "none";
  if (!spec.acceptedEvidence.includes(evidence as RequiredDishMotionEvidence)) {
    return {
      eligible: false,
      phase: request.phase,
      reason: "evidence-mismatch",
      receivedEvidence: evidence,
      acceptedEvidence: spec.acceptedEvidence,
    };
  }

  const token = MOTION[spec.token];
  const motion = resolveMotion(request.preference, {
    kind: spec.kind,
    durationMs: token.durationMs,
  });

  return {
    eligible: true,
    phase: request.phase,
    token: spec.token,
    treatment: motion.treatment,
    durationMs: motion.durationMs,
    easing: token.easing,
    channels: spec.channels,
    semanticBoundary: spec.semanticBoundary,
    preserveUserCamera: spec.preserveUserCamera,
    timingMeaning: "presentation-wall-time-only",
  };
}

const PHASE_SPECS = {
  appear: {
    token: "fieldShift",
    kind: "causal",
    acceptedEvidence: ["authoritative-state", "authoritative-event"],
    channels: ["opacity", "density", "radius"],
    semanticBoundary: "authoritative-change-presentation",
    preserveUserCamera: true,
  },
  grow: {
    token: "fieldShift",
    kind: "causal",
    acceptedEvidence: ["authoritative-state", "authoritative-event"],
    channels: ["density", "radius", "contour"],
    semanticBoundary: "authoritative-change-presentation",
    preserveUserCamera: true,
  },
  divide: {
    token: "fieldShift",
    kind: "causal",
    acceptedEvidence: ["authoritative-event"],
    channels: ["opacity", "position", "outline"],
    semanticBoundary: "authoritative-change-presentation",
    preserveUserCamera: true,
  },
  "aggregate-merge": {
    token: "fieldShift",
    kind: "spatial",
    acceptedEvidence: ["presentation-lod"],
    channels: ["opacity", "density", "contour"],
    semanticBoundary: "presentation-only-lod",
    preserveUserCamera: true,
  },
  recede: {
    token: "fieldShift",
    kind: "causal",
    acceptedEvidence: ["authoritative-state", "authoritative-event"],
    channels: ["opacity", "density", "radius"],
    semanticBoundary: "authoritative-change-presentation",
    preserveUserCamera: true,
  },
  migrate: {
    token: "fieldShift",
    kind: "causal",
    acceptedEvidence: ["authoritative-state", "authoritative-event"],
    channels: ["position", "density", "contour"],
    semanticBoundary: "authoritative-change-presentation",
    preserveUserCamera: true,
  },
  "fungal-branch": {
    token: "fieldShift",
    kind: "causal",
    acceptedEvidence: ["authoritative-state", "authoritative-event"],
    channels: ["path-length", "opacity", "outline"],
    semanticBoundary: "authoritative-change-presentation",
    preserveUserCamera: true,
  },
  "field-diffusion": {
    token: "fieldShift",
    kind: "causal",
    acceptedEvidence: ["authoritative-state"],
    channels: ["field-texture", "contour", "opacity"],
    semanticBoundary: "authoritative-change-presentation",
    preserveUserCamera: true,
  },
  select: {
    token: "selectionEmphasis",
    kind: "navigational",
    acceptedEvidence: ["presentation-intent"],
    channels: ["outline", "opacity"],
    semanticBoundary: "presentation-only-interaction",
    preserveUserCamera: true,
  },
  "intervention-placement": {
    token: "toolPreview",
    kind: "spatial",
    acceptedEvidence: ["presentation-intent"],
    channels: ["outline", "radius", "opacity"],
    semanticBoundary: "presentation-only-interaction",
    preserveUserCamera: true,
  },
  focus: {
    token: "cameraFocus",
    kind: "navigational",
    acceptedEvidence: ["presentation-intent"],
    channels: ["camera", "outline"],
    semanticBoundary: "presentation-only-interaction",
    preserveUserCamera: false,
  },
} as const satisfies Readonly<Record<DishMotionPhase, DishMotionPhaseSpec>>;
