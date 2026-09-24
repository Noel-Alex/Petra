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
  const spec = PHASE_SPECS[request.phase];
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
    ...(spec.kind === "navigational" ? { distancePx: 360 } : {}),
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

const PHASE_SPECS: Readonly<Record<DishMotionPhase, DishMotionPhaseSpec>> =
  Object.freeze({
    appear: Object.freeze({
      token: "fieldShift",
      kind: "causal",
      acceptedEvidence: Object.freeze([
        "authoritative-state",
        "authoritative-event",
      ]),
      channels: Object.freeze(["opacity", "density", "radius"]),
      semanticBoundary: "authoritative-change-presentation",
      preserveUserCamera: true,
    }),
    grow: Object.freeze({
      token: "fieldShift",
      kind: "causal",
      acceptedEvidence: Object.freeze([
        "authoritative-state",
        "authoritative-event",
      ]),
      channels: Object.freeze(["density", "radius", "contour"]),
      semanticBoundary: "authoritative-change-presentation",
      preserveUserCamera: true,
    }),
    divide: Object.freeze({
      token: "selectionEmphasis",
      kind: "causal",
      acceptedEvidence: Object.freeze(["authoritative-event"]),
      channels: Object.freeze(["opacity", "position", "outline"]),
      semanticBoundary: "authoritative-change-presentation",
      preserveUserCamera: true,
    }),
    "aggregate-merge": Object.freeze({
      token: "fieldShift",
      kind: "spatial",
      acceptedEvidence: Object.freeze(["presentation-lod"]),
      channels: Object.freeze(["opacity", "density", "contour"]),
      semanticBoundary: "presentation-only-lod",
      preserveUserCamera: true,
    }),
    recede: Object.freeze({
      token: "fieldShift",
      kind: "causal",
      acceptedEvidence: Object.freeze([
        "authoritative-state",
        "authoritative-event",
      ]),
      channels: Object.freeze(["opacity", "density", "radius"]),
      semanticBoundary: "authoritative-change-presentation",
      preserveUserCamera: true,
    }),
    migrate: Object.freeze({
      token: "fieldShift",
      kind: "causal",
      acceptedEvidence: Object.freeze([
        "authoritative-state",
        "authoritative-event",
      ]),
      channels: Object.freeze(["position", "density", "contour"]),
      semanticBoundary: "authoritative-change-presentation",
      preserveUserCamera: true,
    }),
    "fungal-branch": Object.freeze({
      token: "selectionEmphasis",
      kind: "causal",
      acceptedEvidence: Object.freeze([
        "authoritative-state",
        "authoritative-event",
      ]),
      channels: Object.freeze(["path-length", "opacity", "outline"]),
      semanticBoundary: "authoritative-change-presentation",
      preserveUserCamera: true,
    }),
    "field-diffusion": Object.freeze({
      token: "fieldShift",
      kind: "causal",
      acceptedEvidence: Object.freeze(["authoritative-state"]),
      channels: Object.freeze(["field-texture", "contour", "opacity"]),
      semanticBoundary: "authoritative-change-presentation",
      preserveUserCamera: true,
    }),
    select: Object.freeze({
      token: "selectionEmphasis",
      kind: "navigational",
      acceptedEvidence: Object.freeze(["presentation-intent"]),
      channels: Object.freeze(["outline", "opacity"]),
      semanticBoundary: "presentation-only-interaction",
      preserveUserCamera: true,
    }),
    "intervention-placement": Object.freeze({
      token: "toolPreview",
      kind: "spatial",
      acceptedEvidence: Object.freeze(["presentation-intent"]),
      channels: Object.freeze(["outline", "radius", "opacity"]),
      semanticBoundary: "presentation-only-interaction",
      preserveUserCamera: true,
    }),
    focus: Object.freeze({
      token: "cameraFocus",
      kind: "navigational",
      acceptedEvidence: Object.freeze(["presentation-intent"]),
      channels: Object.freeze(["camera", "outline"]),
      semanticBoundary: "presentation-only-interaction",
      preserveUserCamera: false,
    }),
  });
