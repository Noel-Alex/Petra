import type { RunIdentity } from "../sim/protocol";
import {
  INITIAL_CAUSAL_ANNOUNCEMENT_CURSOR,
  planCausalAnnouncements,
  type CausalAnnouncementCursor,
  type CausalAnnouncementPlan,
} from "../ui/motion/announcements";
import type { CausalEventBurstItem } from "../ui/motion/scheduler";
import { runIdentityKey } from "./runIdentityKey";

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

export interface CausalNarrationSession {
  readonly activeRunKey: string | null;
  readonly streamIdentity: string | null;
  readonly cursor: CausalAnnouncementCursor;
  readonly plan: CausalAnnouncementPlan;
}

export function createCausalNarrationSession(): CausalNarrationSession {
  return {
    activeRunKey: null,
    streamIdentity: null,
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

  if (stream === null || stream === undefined) {
    return {
      activeRunKey,
      streamIdentity: baseStreamIdentity,
      cursor: baseCursor,
      plan: silentPlan(baseCursor),
    };
  }

  assertRunBranchIdentity(stream.runBranchIdentity);

  if (!sameRunIdentity(activeRunIdentity, stream.runIdentity)) {
    return {
      activeRunKey,
      streamIdentity: baseStreamIdentity,
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
  const plan = planCausalAnnouncements(stream.events, cursor);

  return {
    activeRunKey,
    streamIdentity,
    cursor: plan.nextCursor,
    plan,
  };
}

export function causalRunIdentityKey(identity: RunIdentity): string {
  return runIdentityKey(identity);
}

/**
 * Dependency key for the React adapter.
 *
 * Streams are append-only within one runBranchIdentity, so the accepted
 * frontier is enough to detect new authority without serializing the complete
 * scientific history on every React render.
 */
export function causalEventStreamRevisionKey(
  stream: AuthoritativeCausalEventStream | null | undefined,
): string {
  if (stream === null || stream === undefined) return "none";

  const last = stream.events[stream.events.length - 1];
  return JSON.stringify([
    causalRunIdentityKey(stream.runIdentity),
    stream.runBranchIdentity,
    stream.events.length,
    last?.sequence ?? null,
    last?.id ?? null,
    last?.eventKind ?? null,
  ]);
}

function silentPlan(cursor: CausalAnnouncementCursor): CausalAnnouncementPlan {
  return planCausalAnnouncements([], cursor);
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
