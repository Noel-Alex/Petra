import type { RunIdentity } from "../sim/protocol";
import {
  CAUSAL_LIVE_REGION_POLICY,
  INITIAL_CAUSAL_ANNOUNCEMENT_CURSOR,
  planCausalAnnouncements,
  type CausalAnnouncementCursor,
  type CausalAnnouncementPlan,
} from "../ui/motion/announcements";
import type { CausalEventBurstItem } from "../ui/motion/scheduler";
import type { ExperimentRuntimeState } from "./experimentRuntime";

export interface AuthoritativeCausalEventStream {
  /** Exact active simulation run identity supplied by runtime authority. */
  readonly runIdentity: RunIdentity;
  /**
   * Stable run/branch generation identity.
   *
   * This must change when the authority stream moves to a different branch or
   * fresh run generation, even when the underlying RunIdentity fields happen
   * to be identical (for example an explicit reset/reinitialize).
   */
  readonly runBranchIdentity: string;
  readonly events: readonly CausalEventBurstItem[];
}

/**
 * Bind already-authoritative causal event items to the exact runtime-owned
 * run/history scope. This helper supplies identity only; it does not promote
 * timeline labels or renderer observations into causal scientific events.
 */
export function bindRuntimeCausalEventStream(
  runtimeState: ExperimentRuntimeState,
  events: readonly CausalEventBurstItem[],
): AuthoritativeCausalEventStream {
  if (runtimeState.snapshot === null) {
    throw new Error(
      "runtime causal event stream requires an authoritative runtime snapshot",
    );
  }
  if (
    !sameRunIdentity(
      runtimeState.controls.identity,
      runtimeState.snapshot.checkpoint.identity,
    )
  ) {
    throw new Error(
      "runtime causal event stream snapshot identity does not match active controls",
    );
  }

  return Object.freeze({
    runIdentity: structuredClone(runtimeState.controls.identity),
    runBranchIdentity: runtimeState.runBranchIdentity,
    events: Object.freeze(structuredClone(events)),
  });
}

export interface CausalNarrationSession {
  readonly activeRunKey: string | null;
  readonly streamIdentity: string | null;
  readonly acceptedEventCount: number;
  readonly acceptedHistoryKey: string;
  readonly cursor: CausalAnnouncementCursor;
  readonly plan: CausalAnnouncementPlan;
}

export function createCausalNarrationSession(): CausalNarrationSession {
  return {
    activeRunKey: null,
    streamIdentity: null,
    acceptedEventCount: 0,
    acceptedHistoryKey: causalEventHistoryKey([]),
    cursor: INITIAL_CAUSAL_ANNOUNCEMENT_CURSOR,
    plan: silentPlan(INITIAL_CAUSAL_ANNOUNCEMENT_CURSOR),
  };
}

/**
 * App-layer trust boundary for causal narration.
 *
 * The current synthetic protocol intentionally supplies no CausalEventKind.
 * #37/#42 may pass an explicit authoritative stream through this adapter once
 * the composed runtime owns those identities. Until then, narration remains
 * mounted but silent.
 */
export function advanceCausalNarrationSession(
  session: CausalNarrationSession,
  activeRunIdentity: RunIdentity | null,
  stream: AuthoritativeCausalEventStream | null | undefined,
): CausalNarrationSession {
  if (activeRunIdentity === null) {
    return createCausalNarrationSession();
  }

  const activeRunKey = causalRunIdentityKey(activeRunIdentity);
  const runChanged = session.activeRunKey !== activeRunKey;
  const baseCursor = runChanged
    ? INITIAL_CAUSAL_ANNOUNCEMENT_CURSOR
    : session.cursor;
  const baseStreamIdentity = runChanged ? null : session.streamIdentity;
  const baseAcceptedEventCount = runChanged ? 0 : session.acceptedEventCount;
  const baseAcceptedHistoryKey = runChanged
    ? causalEventHistoryKey([])
    : session.acceptedHistoryKey;

  if (stream === null || stream === undefined) {
    return {
      activeRunKey,
      streamIdentity: baseStreamIdentity,
      acceptedEventCount: baseAcceptedEventCount,
      acceptedHistoryKey: baseAcceptedHistoryKey,
      cursor: baseCursor,
      plan: silentPlan(baseCursor),
    };
  }

  assertRunBranchIdentity(stream.runBranchIdentity);

  if (!sameRunIdentity(activeRunIdentity, stream.runIdentity)) {
    return {
      activeRunKey,
      streamIdentity: baseStreamIdentity,
      acceptedEventCount: baseAcceptedEventCount,
      acceptedHistoryKey: baseAcceptedHistoryKey,
      cursor: baseCursor,
      plan: silentPlan(baseCursor),
    };
  }

  const streamIdentity =
    activeRunKey + "::" + stream.runBranchIdentity.trim();
  const streamChanged = baseStreamIdentity !== streamIdentity;
  const cursor = streamChanged
    ? INITIAL_CAUSAL_ANNOUNCEMENT_CURSOR
    : baseCursor;
  const acceptedEventCount = streamChanged ? 0 : baseAcceptedEventCount;
  const acceptedHistoryKey = streamChanged
    ? causalEventHistoryKey([])
    : baseAcceptedHistoryKey;

  assertAppendOnlyCausalHistory(
    stream.events,
    acceptedEventCount,
    acceptedHistoryKey,
  );

  const plan = planCausalAnnouncements(stream.events, cursor);

  return {
    activeRunKey,
    streamIdentity,
    acceptedEventCount: stream.events.length,
    acceptedHistoryKey: causalEventHistoryKey(stream.events),
    cursor: plan.nextCursor,
    plan,
  };
}

export function causalRunIdentityKey(identity: RunIdentity): string {
  return JSON.stringify([
    identity.engineVersion,
    identity.protocolVersion,
    identity.scenarioId,
    identity.scenarioVersion,
    identity.parameterSetId,
    identity.parameterSetVersion,
    identity.parameterSetBinding ?? null,
    identity.seed,
  ]);
}

/**
 * Dependency key for the React adapter.
 *
 * The key includes every replay-relevant causal event field, not object
 * identity or only the final frontier. This makes a same-length replacement of
 * earlier authority observable to React so the append-only guard runs again.
 *
 * Cost is O(n) in the causal-event history length and intentionally limited to
 * the three primitive fields currently owned by CausalEventBurstItem. If the
 * authoritative runtime later supplies a collision-resistant rolling history
 * identity, that may replace this presentation-side scan only with an explicit
 * protocol contract.
 */
export function causalEventStreamRevisionKey(
  stream: AuthoritativeCausalEventStream | null | undefined,
): string {
  if (stream === null || stream === undefined) return "none";

  return JSON.stringify([
    causalRunIdentityKey(stream.runIdentity),
    stream.runBranchIdentity,
    causalEventHistoryKey(stream.events),
  ]);
}

function causalEventHistoryKey(
  events: readonly CausalEventBurstItem[],
): string {
  return JSON.stringify(
    events.map((event) => [event.sequence, event.id, event.eventKind]),
  );
}

function assertAppendOnlyCausalHistory(
  events: readonly CausalEventBurstItem[],
  acceptedEventCount: number,
  acceptedHistoryKey: string,
): void {
  if (
    !Number.isSafeInteger(acceptedEventCount) ||
    acceptedEventCount < 0 ||
    acceptedEventCount > events.length
  ) {
    throw new RangeError(
      "causal narration accepted history must remain present in the append-only authority stream",
    );
  }

  const currentAcceptedHistoryKey = causalEventHistoryKey(
    events.slice(0, acceptedEventCount),
  );
  if (currentAcceptedHistoryKey !== acceptedHistoryKey) {
    throw new RangeError(
      "causal narration accepted history cannot be replaced within one run/branch identity",
    );
  }
}

function silentPlan(cursor: CausalAnnouncementCursor): CausalAnnouncementPlan {
  // No authority stream is supplied in this lifecycle state, so there is
  // nothing to run append-only stream validation against. Preserve the exact
  // accepted cursor while keeping the stable live region silent. Once a stream
  // is supplied again, normal #501/#508 continuity validation resumes.
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

function assertRunBranchIdentity(runBranchIdentity: string): void {
  if (runBranchIdentity.trim().length === 0) {
    throw new TypeError(
      "causal narration runBranchIdentity must be non-empty",
    );
  }
}

function sameRunIdentity(left: RunIdentity, right: RunIdentity): boolean {
  return causalRunIdentityKey(left) === causalRunIdentityKey(right);
}
