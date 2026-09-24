import {
  resolveCausalEventChoreography,
  type CausalEventKind,
  type CausalMotionCue,
} from "./events";
import type { MotionPreference, MotionTreatment } from "./policy";

export interface CausalEventBurstItem {
  readonly id: string;
  readonly sequence: number;
  readonly eventKind: CausalEventKind;
}

export interface ScheduledCausalMotionCue
  extends Omit<CausalMotionCue, "startMs"> {
  readonly startMs: number;
  readonly localStartMs: number;
}

export type BurstPresentation = "animated" | "reduced" | "static";

export interface ScheduledCausalEvent {
  readonly id: string;
  readonly sequence: number;
  readonly authorityOrder: number;
  readonly eventKind: CausalEventKind;
  readonly presentation: BurstPresentation;
  readonly degradedForBurst: boolean;
  readonly startMs: number;
  readonly cues: readonly ScheduledCausalMotionCue[];
  readonly announceText: string;
}

export interface CausalEventBurstPlan {
  readonly requestedPreference: MotionPreference;
  readonly events: readonly ScheduledCausalEvent[];
  readonly animatedEventCount: number;
  readonly staticEventCount: number;
  readonly overflowCounts: Readonly<Record<CausalEventKind, number>>;
  readonly cameraPolicy: "preserve-user-view";
  readonly requiresAuthoritativeEvents: true;
  readonly timingMeaning: "presentation-wall-time-only";
  readonly orderMeaning: "authoritative-input-order";
}

/**
 * Presentation-only density policy for already-authoritative event bursts.
 *
 * These values are visual engineering policy, not biological rates. The cap
 * bounds simultaneously animated event stories; overflow events are still
 * represented immediately through each choreography's essential static cue.
 */
export const CAUSAL_EVENT_BURST_POLICY = {
  full: {
    animatedEventLimit: 5,
    eventStaggerMs: 64,
  },
  reduced: {
    animatedEventLimit: 3,
    eventStaggerMs: 0,
  },
  off: {
    animatedEventLimit: 0,
    eventStaggerMs: 0,
  },
} as const satisfies Readonly<
  Record<
    MotionPreference,
    {
      readonly animatedEventLimit: number;
      readonly eventStaggerMs: number;
    }
  >
>;

/**
 * Converts an authoritative event batch into a bounded presentation plan.
 *
 * Input order is preserved exactly. The scheduler never sorts, delays, drops,
 * merges, or synthesizes simulator events. It only decides how much animation
 * to spend on their already-authoritative visual cues.
 *
 * Once the burst animation budget is exhausted, later events resolve through
 * the existing motion-off choreography. This removes decorative movement while
 * retaining every essential cue as static emphasis.
 */
export function planCausalEventBurst(
  events: readonly CausalEventBurstItem[],
  preference: MotionPreference,
): CausalEventBurstPlan {
  assertValidBurst(events);

  const policy = CAUSAL_EVENT_BURST_POLICY[preference];
  const overflowCounts = createEmptyOverflowCounts();
  const scheduledEvents = events.map((event, authorityOrder) => {
    const insideAnimationBudget =
      authorityOrder < policy.animatedEventLimit;
    const effectivePreference: MotionPreference = insideAnimationBudget
      ? preference
      : "off";
    const choreography = resolveCausalEventChoreography(
      event.eventKind,
      effectivePreference,
    );
    const degradedForBurst = effectivePreference !== preference;
    const startMs =
      insideAnimationBudget && effectivePreference !== "off"
        ? authorityOrder * policy.eventStaggerMs
        : 0;

    if (degradedForBurst) {
      overflowCounts[event.eventKind] += 1;
    }

    return {
      id: event.id,
      sequence: event.sequence,
      authorityOrder,
      eventKind: event.eventKind,
      presentation: resolveBurstPresentation(effectivePreference),
      degradedForBurst,
      startMs,
      cues: choreography.cues.map((cue) => ({
        visual: cue.visual,
        essential: cue.essential,
        startMs: startMs + cue.startMs,
        localStartMs: cue.startMs,
        durationMs: cue.durationMs,
        treatment: cue.treatment,
        easing: cue.easing,
      })),
      announceText: choreography.announceText,
    } satisfies ScheduledCausalEvent;
  });

  return {
    requestedPreference: preference,
    events: scheduledEvents,
    animatedEventCount: scheduledEvents.filter((event) =>
      event.cues.some((cue) => isAnimatedTreatment(cue.treatment)),
    ).length,
    staticEventCount: scheduledEvents.filter((event) =>
      event.cues.every((cue) => !isAnimatedTreatment(cue.treatment)),
    ).length,
    overflowCounts,
    cameraPolicy: "preserve-user-view",
    requiresAuthoritativeEvents: true,
    timingMeaning: "presentation-wall-time-only",
    orderMeaning: "authoritative-input-order",
  };
}

function resolveBurstPresentation(
  preference: MotionPreference,
): BurstPresentation {
  if (preference === "full") {
    return "animated";
  }

  if (preference === "reduced") {
    return "reduced";
  }

  return "static";
}

function isAnimatedTreatment(treatment: MotionTreatment): boolean {
  return treatment === "animate" || treatment === "crossfade";
}

function assertValidBurst(events: readonly CausalEventBurstItem[]): void {
  const ids = new Set<string>();
  let previousSequence = Number.NEGATIVE_INFINITY;

  for (const event of events) {
    if (event.id.trim().length === 0) {
      throw new RangeError("causal event id must be non-empty");
    }

    if (ids.has(event.id)) {
      throw new RangeError(`duplicate causal event id: ${event.id}`);
    }

    if (!Number.isSafeInteger(event.sequence) || event.sequence < 0) {
      throw new RangeError(
        "causal event sequence must be a non-negative safe integer",
      );
    }

    if (event.sequence <= previousSequence) {
      throw new RangeError(
        "causal event burst must preserve strictly increasing authority order",
      );
    }

    ids.add(event.id);
    previousSequence = event.sequence;
  }
}

function createEmptyOverflowCounts(): Record<CausalEventKind, number> {
  return {
    "intervention-applied": 0,
    "mutation-observed": 0,
    "selection-shift-observed": 0,
    "nutrient-depletion-observed": 0,
    "lysis-observed": 0,
  };
}
