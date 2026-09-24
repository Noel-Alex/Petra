import {
  resolveMotion,
  type MotionPreference,
  type MotionTreatment,
} from "./policy";
import { CAUSAL_EVENT_BURST_POLICY } from "./scheduler";
import { MOTION, type MotionTokenName } from "./tokens";

export const STORY_MOMENT_KINDS = [
  "first-resistant-lineage",
  "lineage-extinction",
  "drug-zone-breakthrough",
  "population-crash-recovery",
  "phage-wave",
  "fork-divergence",
] as const;

export type StoryMomentKind = (typeof STORY_MOMENT_KINDS)[number];

type EventStoryMomentKind =
  | "first-resistant-lineage"
  | "lineage-extinction"
  | "drug-zone-breakthrough";

export type StoryMomentEvidence =
  | {
      readonly source: "authoritative-story-event";
      readonly storyKind: EventStoryMomentKind;
      readonly eventId: string;
      readonly sequence: number;
    }
  | {
      readonly source: "authoritative-metric-transition";
      readonly storyKind: "population-crash-recovery";
      readonly metricId: string;
      readonly fromSampleId: string;
      readonly toSampleId: string;
    }
  | {
      readonly source: "authoritative-event-burst";
      readonly storyKind: "phage-wave";
      readonly firstEventId: string;
      readonly lastEventId: string;
      readonly firstSequence: number;
      readonly lastSequence: number;
    }
  | {
      readonly source: "authoritative-compare";
      readonly storyKind: "fork-divergence";
      readonly comparisonId: string;
    };

export type StoryMomentEvidenceSource = StoryMomentEvidence["source"];

export type StoryMomentVisual =
  | "lineage-origin"
  | "lineage-outline"
  | "extinction-marker"
  | "zone-boundary"
  | "boundary-crossing"
  | "population-envelope"
  | "recovery-trace"
  | "phage-wavefront"
  | "lysis-ripple"
  | "fork-split"
  | "compare-link"
  | "quiet-pulse";

export interface StoryMomentCue {
  readonly visual: StoryMomentVisual;
  readonly essential: boolean;
  readonly startMs: number;
  readonly durationMs: number;
  readonly treatment: MotionTreatment;
  readonly easing: readonly [number, number, number, number];
}

export interface StoryMomentRequest {
  readonly kind: StoryMomentKind;
  readonly preference: MotionPreference;
  readonly evidence?: StoryMomentEvidence;
}

export interface StoryMomentPlan {
  readonly eligible: true;
  readonly kind: StoryMomentKind;
  readonly evidenceSource: StoryMomentEvidenceSource;
  readonly evidenceIdentity: string;
  readonly token: MotionTokenName;
  readonly tone: "scientific-neutral";
  readonly headline: string;
  readonly detail: string;
  readonly cues: readonly StoryMomentCue[];
  readonly cameraPolicy: "preserve-user-view";
  readonly timingMeaning: "presentation-wall-time-only";
  readonly scientificAuthority: "presentation-only";
  readonly powerUpFraming: false;
}

export interface StoryMomentRefusal {
  readonly eligible: false;
  readonly kind: StoryMomentKind;
  readonly reason: "evidence-mismatch";
  readonly receivedEvidenceSource: StoryMomentEvidenceSource | "none";
  readonly requiredEvidenceSource: StoryMomentEvidenceSource;
}

export type StoryMomentResult = StoryMomentPlan | StoryMomentRefusal;

interface StoryMomentCueSpec {
  readonly visual: StoryMomentVisual;
  readonly essential: boolean;
  readonly offset: number;
  readonly share: number;
}

interface StoryMomentSpec {
  readonly evidenceSource: StoryMomentEvidenceSource;
  readonly token: MotionTokenName;
  readonly headline: string;
  readonly detail: string;
  readonly cues: readonly StoryMomentCueSpec[];
}

export interface StoryMomentBurstItem {
  readonly id: string;
  readonly sequence: number;
  readonly kind: StoryMomentKind;
  readonly evidence: StoryMomentEvidence;
}

export type StoryMomentBurstPresentation = "animated" | "reduced" | "static";

export interface ScheduledStoryMoment {
  readonly id: string;
  readonly sequence: number;
  readonly authorityOrder: number;
  readonly kind: StoryMomentKind;
  readonly presentation: StoryMomentBurstPresentation;
  readonly degradedForBurst: boolean;
  readonly startMs: number;
  readonly plan: StoryMomentPlan;
}

export interface StoryMomentBurstPlan {
  readonly requestedPreference: MotionPreference;
  readonly moments: readonly ScheduledStoryMoment[];
  readonly animatedMomentCount: number;
  readonly staticMomentCount: number;
  readonly overflowCounts: Readonly<Record<StoryMomentKind, number>>;
  readonly cameraPolicy: "preserve-user-view";
  readonly orderMeaning: "authoritative-input-order";
  readonly timingMeaning: "presentation-wall-time-only";
}

export const STORY_MOMENT_BURST_POLICY = {
  full: {
    animatedMomentLimit: 2,
    eventStaggerMs: CAUSAL_EVENT_BURST_POLICY.full.eventStaggerMs,
  },
  reduced: {
    animatedMomentLimit: 1,
    eventStaggerMs: CAUSAL_EVENT_BURST_POLICY.reduced.eventStaggerMs,
  },
  off: {
    animatedMomentLimit: 0,
    eventStaggerMs: 0,
  },
} as const satisfies Readonly<
  Record<
    MotionPreference,
    {
      readonly animatedMomentLimit: number;
      readonly eventStaggerMs: number;
    }
  >
>;

/**
 * Resolve one premium Petra story moment from explicit scientific authority.
 *
 * The caller must already own the semantic fact that the named moment happened.
 * This planner never promotes a generic mutation, renderer delta, chart shape,
 * or animation callback into a resistant lineage, extinction, breakthrough,
 * recovery, phage wave, or branch divergence.
 */
export function planStoryMoment(
  request: StoryMomentRequest,
): StoryMomentResult {
  const spec: StoryMomentSpec | undefined = STORY_SPECS[request.kind];
  if (spec === undefined) {
    throw new RangeError(
      `unknown story moment kind: ${String(request.kind)}`,
    );
  }

  const evidence = request.evidence;
  if (
    evidence === undefined ||
    evidence.source !== spec.evidenceSource ||
    evidence.storyKind !== request.kind
  ) {
    return {
      eligible: false,
      kind: request.kind,
      reason: "evidence-mismatch",
      receivedEvidenceSource: evidence?.source ?? "none",
      requiredEvidenceSource: spec.evidenceSource,
    };
  }

  validateEvidence(evidence);

  const token = MOTION[spec.token];
  const cues = spec.cues
    .filter((cue) => request.preference !== "off" || cue.essential)
    .map((cue) =>
      resolveCue(
        cue,
        token.durationMs,
        token.easing,
        request.preference,
      ),
    );

  return {
    eligible: true,
    kind: request.kind,
    evidenceSource: evidence.source,
    evidenceIdentity: evidenceIdentity(evidence),
    token: spec.token,
    tone: "scientific-neutral",
    headline: spec.headline,
    detail: spec.detail,
    cues,
    cameraPolicy: "preserve-user-view",
    timingMeaning: "presentation-wall-time-only",
    scientificAuthority: "presentation-only",
    powerUpFraming: false,
  };
}

/**
 * Bound simultaneous high-salience story moments so the dish remains readable.
 *
 * Overflow moments are not dropped. They resolve through motion-off treatment,
 * retaining their essential static cue and copy without adding more movement.
 */
export function planStoryMomentBurst(
  items: readonly StoryMomentBurstItem[],
  preference: MotionPreference,
): StoryMomentBurstPlan {
  validateBurst(items);

  const policy = STORY_MOMENT_BURST_POLICY[preference];
  const overflowCounts = emptyStoryMomentCounts();

  const moments = items.map((item, authorityOrder) => {
    const insideAnimationBudget =
      authorityOrder < policy.animatedMomentLimit;
    const effectivePreference: MotionPreference =
      preference === "off"
        ? "off"
        : insideAnimationBudget
          ? preference
          : "off";
    const result = planStoryMoment({
      kind: item.kind,
      preference: effectivePreference,
      evidence: item.evidence,
    });
    if (!result.eligible) {
      throw new RangeError(
        `story moment evidence mismatch for ${item.kind}`,
      );
    }

    const degradedForBurst =
      preference !== "off" && effectivePreference !== preference;
    if (degradedForBurst) {
      overflowCounts[item.kind] += 1;
    }

    return {
      id: item.id,
      sequence: item.sequence,
      authorityOrder,
      kind: item.kind,
      presentation: burstPresentation(effectivePreference),
      degradedForBurst,
      startMs:
        effectivePreference === "full"
          ? authorityOrder * policy.eventStaggerMs
          : 0,
      plan: result,
    } satisfies ScheduledStoryMoment;
  });

  return {
    requestedPreference: preference,
    moments,
    animatedMomentCount: moments.filter((moment) =>
      moment.plan.cues.some(
        (cue) =>
          cue.treatment === "animate" ||
          cue.treatment === "crossfade",
      ),
    ).length,
    staticMomentCount: moments.filter((moment) =>
      moment.plan.cues.every(
        (cue) =>
          cue.treatment === "static-emphasis" ||
          cue.treatment === "instant",
      ),
    ).length,
    overflowCounts,
    cameraPolicy: "preserve-user-view",
    orderMeaning: "authoritative-input-order",
    timingMeaning: "presentation-wall-time-only",
  };
}

const STORY_SPECS: Readonly<Record<StoryMomentKind, StoryMomentSpec>> = {
  "first-resistant-lineage": {
    evidenceSource: "authoritative-story-event",
    token: "mutationEmphasis",
    headline: "Resistant lineage recorded",
    detail:
      "Authority recorded the first resistant lineage. The emphasis marks its appearance; antibiotic pressure does not instruct a useful mutation.",
    cues: [
      {
        visual: "lineage-origin",
        essential: true,
        offset: 0,
        share: 1,
      },
      {
        visual: "quiet-pulse",
        essential: false,
        offset: 0.08,
        share: 0.68,
      },
    ],
  },
  "lineage-extinction": {
    evidenceSource: "authoritative-story-event",
    token: "selectionEmphasis",
    headline: "Lineage extinction recorded",
    detail:
      "The lineage is no longer present in authoritative state. The visual recession explains the record without turning loss into spectacle.",
    cues: [
      {
        visual: "lineage-outline",
        essential: true,
        offset: 0,
        share: 0.72,
      },
      {
        visual: "extinction-marker",
        essential: true,
        offset: 0.22,
        share: 0.78,
      },
    ],
  },
  "drug-zone-breakthrough": {
    evidenceSource: "authoritative-story-event",
    token: "selectionEmphasis",
    headline: "Drug-zone breakthrough recorded",
    detail:
      "Authority recorded a lineage crossing the defined drug-zone boundary. The boundary cue marks where that event occurred, not why it succeeded.",
    cues: [
      {
        visual: "zone-boundary",
        essential: true,
        offset: 0,
        share: 0.7,
      },
      {
        visual: "boundary-crossing",
        essential: true,
        offset: 0.18,
        share: 0.82,
      },
    ],
  },
  "population-crash-recovery": {
    evidenceSource: "authoritative-metric-transition",
    token: "fieldShift",
    headline: "Population crash and recovery recorded",
    detail:
      "Authoritative metric samples show a crash followed by recovery. The linked emphasis does not assign a biological cause by itself.",
    cues: [
      {
        visual: "population-envelope",
        essential: true,
        offset: 0,
        share: 1,
      },
      {
        visual: "recovery-trace",
        essential: false,
        offset: 0.28,
        share: 0.72,
      },
    ],
  },
  "phage-wave": {
    evidenceSource: "authoritative-event-burst",
    token: "lysisBurst",
    headline: "Phage wave recorded",
    detail:
      "A bounded authoritative lysis-event wave is present. Ripple timing is presentation only and is not the phage latent period.",
    cues: [
      {
        visual: "phage-wavefront",
        essential: true,
        offset: 0,
        share: 1,
      },
      {
        visual: "lysis-ripple",
        essential: false,
        offset: 0.14,
        share: 0.72,
      },
    ],
  },
  "fork-divergence": {
    evidenceSource: "authoritative-compare",
    token: "selectionEmphasis",
    headline: "Counterfactual branches diverged",
    detail:
      "Authoritative branch metadata shows divergence after a shared fork. The compare surface must state whether intervention, seed, or both differ.",
    cues: [
      {
        visual: "fork-split",
        essential: true,
        offset: 0,
        share: 0.84,
      },
      {
        visual: "compare-link",
        essential: false,
        offset: 0.18,
        share: 0.72,
      },
    ],
  },
};

function resolveCue(
  cue: StoryMomentCueSpec,
  tokenDurationMs: number,
  easing: readonly [number, number, number, number],
  preference: MotionPreference,
): StoryMomentCue {
  const requestedDurationMs = Math.max(
    1,
    Math.round(tokenDurationMs * cue.share),
  );
  const motion = resolveMotion(preference, {
    kind: cue.essential ? "causal" : "decorative",
    durationMs: requestedDurationMs,
  });

  return {
    visual: cue.visual,
    essential: cue.essential,
    startMs:
      preference === "full"
        ? Math.round(tokenDurationMs * cue.offset)
        : 0,
    durationMs: motion.durationMs,
    treatment: motion.treatment,
    easing,
  };
}

function validateEvidence(evidence: StoryMomentEvidence): void {
  switch (evidence.source) {
    case "authoritative-story-event":
      assertNonEmpty("story event id", evidence.eventId);
      assertSequence("story event sequence", evidence.sequence);
      return;
    case "authoritative-metric-transition":
      assertNonEmpty("story metric id", evidence.metricId);
      assertNonEmpty("story metric fromSampleId", evidence.fromSampleId);
      assertNonEmpty("story metric toSampleId", evidence.toSampleId);
      if (evidence.fromSampleId === evidence.toSampleId) {
        throw new RangeError(
          "story metric transition requires distinct authoritative samples",
        );
      }
      return;
    case "authoritative-event-burst":
      assertNonEmpty("story burst firstEventId", evidence.firstEventId);
      assertNonEmpty("story burst lastEventId", evidence.lastEventId);
      assertSequence("story burst firstSequence", evidence.firstSequence);
      assertSequence("story burst lastSequence", evidence.lastSequence);
      if (evidence.lastSequence < evidence.firstSequence) {
        throw new RangeError(
          "story event burst must preserve authoritative sequence order",
        );
      }
      return;
    case "authoritative-compare":
      assertNonEmpty("story comparison id", evidence.comparisonId);
      return;
  }
}

function evidenceIdentity(evidence: StoryMomentEvidence): string {
  switch (evidence.source) {
    case "authoritative-story-event":
      return JSON.stringify([
        evidence.source,
        evidence.storyKind,
        evidence.sequence,
        evidence.eventId,
      ]);
    case "authoritative-metric-transition":
      return JSON.stringify([
        evidence.source,
        evidence.storyKind,
        evidence.metricId,
        evidence.fromSampleId,
        evidence.toSampleId,
      ]);
    case "authoritative-event-burst":
      return JSON.stringify([
        evidence.source,
        evidence.storyKind,
        evidence.firstSequence,
        evidence.firstEventId,
        evidence.lastSequence,
        evidence.lastEventId,
      ]);
    case "authoritative-compare":
      return JSON.stringify([
        evidence.source,
        evidence.storyKind,
        evidence.comparisonId,
      ]);
  }
}

function validateBurst(items: readonly StoryMomentBurstItem[]): void {
  const ids = new Set<string>();
  let previousSequence = Number.NEGATIVE_INFINITY;

  for (const item of items) {
    assertNonEmpty("story moment id", item.id);
    if (ids.has(item.id)) {
      throw new RangeError(`duplicate story moment id: ${item.id}`);
    }
    assertSequence("story moment sequence", item.sequence);
    if (item.sequence <= previousSequence) {
      throw new RangeError(
        "story moment burst must preserve strictly increasing authority order",
      );
    }
    ids.add(item.id);
    previousSequence = item.sequence;
  }
}

function emptyStoryMomentCounts(): Record<StoryMomentKind, number> {
  return {
    "first-resistant-lineage": 0,
    "lineage-extinction": 0,
    "drug-zone-breakthrough": 0,
    "population-crash-recovery": 0,
    "phage-wave": 0,
    "fork-divergence": 0,
  };
}

function burstPresentation(
  preference: MotionPreference,
): StoryMomentBurstPresentation {
  if (preference === "full") return "animated";
  if (preference === "reduced") return "reduced";
  return "static";
}

function assertNonEmpty(name: string, value: string): void {
  if (value.trim().length === 0) {
    throw new TypeError(`${name} must be non-empty`);
  }
}

function assertSequence(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(
      `${name} must be a non-negative safe integer`,
    );
  }
}
