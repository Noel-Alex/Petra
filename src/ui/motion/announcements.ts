import {
  resolveCausalEventChoreography,
  type CausalEventKind,
} from "./events";
import type { CausalEventBurstItem } from "./scheduler";

export interface CausalAnnouncementCursor {
  readonly sequence: number;
  readonly eventId: string | null;
}

export interface CausalLiveRegionPolicy {
  readonly politeness: "polite";
  readonly atomic: true;
}

export interface CausalAnnouncementPlan {
  readonly presentation: "none" | "specific" | "summary";
  readonly message: string | null;
  readonly eventIds: readonly string[];
  readonly firstSequence: number | null;
  readonly lastSequence: number | null;
  readonly nextCursor: CausalAnnouncementCursor;
  readonly liveRegion: CausalLiveRegionPolicy;
  readonly orderMeaning: "authoritative-sequence-only";
  readonly timingMeaning: "independent-of-animation-wall-time";
  readonly historyPolicy: "scientific-timeline-remains-complete";
}

export const INITIAL_CAUSAL_ANNOUNCEMENT_CURSOR: CausalAnnouncementCursor =
  Object.freeze({
    sequence: -1,
    eventId: null,
  });

export const CAUSAL_LIVE_REGION_POLICY: CausalLiveRegionPolicy = Object.freeze({
  politeness: "polite",
  atomic: true,
});

/**
 * Plans bounded screen-reader narration for already-authoritative causal events.
 *
 * This planner never drops or merges scientific history. It only decides how
 * one accepted batch should be spoken. The caller keeps the full authoritative
 * event list/timeline and stores the returned cursor per run identity.
 *
 * Motion preference is deliberately absent: full/reduced/off motion must speak
 * the same scientific meaning.
 */
export function planCausalAnnouncements(
  events: readonly CausalEventBurstItem[],
  cursor: CausalAnnouncementCursor = INITIAL_CAUSAL_ANNOUNCEMENT_CURSOR,
): CausalAnnouncementPlan {
  assertCursor(cursor);
  assertValidAnnouncementBatch(events);
  assertCursorIdentity(events, cursor);

  const newEvents = events.filter((event) => event.sequence > cursor.sequence);

  if (newEvents.length === 0) {
    return {
      presentation: "none",
      message: null,
      eventIds: [],
      firstSequence: null,
      lastSequence: null,
      nextCursor: cursor,
      liveRegion: CAUSAL_LIVE_REGION_POLICY,
      orderMeaning: "authoritative-sequence-only",
      timingMeaning: "independent-of-animation-wall-time",
      historyPolicy: "scientific-timeline-remains-complete",
    };
  }

  if (
    cursor.eventId !== null &&
    newEvents.some((event) => event.id === cursor.eventId)
  ) {
    throw new RangeError(
      "causal announcement event id cannot be reused at a newer authority sequence",
    );
  }

  const first = newEvents[0]!;
  const last = newEvents[newEvents.length - 1]!;
  const nextCursor = {
    sequence: last.sequence,
    eventId: last.id,
  } satisfies CausalAnnouncementCursor;

  return {
    presentation: newEvents.length === 1 ? "specific" : "summary",
    message:
      newEvents.length === 1
        ? eventSpecificAnnouncement(first.eventKind)
        : summarizeEventBurst(newEvents),
    eventIds: newEvents.map((event) => event.id),
    firstSequence: first.sequence,
    lastSequence: last.sequence,
    nextCursor,
    liveRegion: CAUSAL_LIVE_REGION_POLICY,
    orderMeaning: "authoritative-sequence-only",
    timingMeaning: "independent-of-animation-wall-time",
    historyPolicy: "scientific-timeline-remains-complete",
  };
}

function eventSpecificAnnouncement(eventKind: CausalEventKind): string {
  return resolveCausalEventChoreography(eventKind, "off").announceText;
}

function summarizeEventBurst(events: readonly CausalEventBurstItem[]): string {
  const counts = new Map<CausalEventKind, number>();

  for (const event of events) {
    counts.set(event.eventKind, (counts.get(event.eventKind) ?? 0) + 1);
  }

  const parts = [...counts.entries()].map(([kind, count]) =>
    formatKindCount(kind, count),
  );

  return `${events.length} new scientific events recorded: ${parts.join(
    ", ",
  )}. All individual events remain available in the scientific timeline.`;
}

function formatKindCount(kind: CausalEventKind, count: number): string {
  const [singular, plural] = SPOKEN_EVENT_LABELS[kind];
  return `${count} ${count === 1 ? singular : plural}`;
}

const SPOKEN_EVENT_LABELS: Readonly<
  Record<CausalEventKind, readonly [singular: string, plural: string]>
> = {
  "intervention-applied": ["intervention", "interventions"],
  "mutation-observed": ["lineage change", "lineage changes"],
  "selection-shift-observed": ["selection shift", "selection shifts"],
  "nutrient-depletion-observed": [
    "nutrient depletion event",
    "nutrient depletion events",
  ],
  "lysis-observed": ["lysis event", "lysis events"],
};

function assertCursor(cursor: CausalAnnouncementCursor): void {
  if (
    !Number.isSafeInteger(cursor.sequence) ||
    cursor.sequence < -1 ||
    (cursor.sequence === -1 && cursor.eventId !== null) ||
    (cursor.sequence >= 0 &&
      (cursor.eventId === null || cursor.eventId.trim().length === 0))
  ) {
    throw new RangeError(
      "causal announcement cursor requires sequence -1 with no id, or a non-negative sequence with a non-empty event id",
    );
  }
}

function assertCursorIdentity(
  events: readonly CausalEventBurstItem[],
  cursor: CausalAnnouncementCursor,
): void {
  if (cursor.sequence < 0) return;

  const matchingSequence = events.find(
    (event) => event.sequence === cursor.sequence,
  );
  if (
    matchingSequence !== undefined &&
    matchingSequence.id !== cursor.eventId
  ) {
    throw new RangeError(
      "causal announcement cursor identity does not match authoritative event sequence",
    );
  }
}

function assertValidAnnouncementBatch(
  events: readonly CausalEventBurstItem[],
): void {
  const ids = new Set<string>();
  let previousSequence = Number.NEGATIVE_INFINITY;

  for (const event of events) {
    if (event.id.trim().length === 0) {
      throw new RangeError("causal announcement event id must be non-empty");
    }
    if (ids.has(event.id)) {
      throw new RangeError(
        `duplicate causal announcement event id: ${event.id}`,
      );
    }
    if (!Number.isSafeInteger(event.sequence) || event.sequence < 0) {
      throw new RangeError(
        "causal announcement sequence must be a non-negative safe integer",
      );
    }
    if (event.sequence <= previousSequence) {
      throw new RangeError(
        "causal announcement batch must preserve strictly increasing authority order",
      );
    }
    if (!(event.eventKind in SPOKEN_EVENT_LABELS)) {
      throw new RangeError(
        `unsupported causal announcement event kind: ${String(event.eventKind)}`,
      );
    }

    ids.add(event.id);
    previousSequence = event.sequence;
  }
}
