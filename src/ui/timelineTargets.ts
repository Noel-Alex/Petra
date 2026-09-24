import type { SimulationEvent } from "../sim/protocol";

export const TIMELINE_TARGET_SCHEMA_VERSION = 1 as const;
export const TIMELINE_BOOKMARK_SCHEMA_VERSION = 1 as const;

export type ScientificTimelineTargetKind =
  | "resistant-fraction-crossing"
  | "population-collapse"
  | "resource-depletion"
  | "lineage-birth"
  | "lineage-extinction";

export type TimelineTargetRequest =
  | {
      readonly kind: "authoritative-event";
      readonly eventType: SimulationEvent["type"];
      readonly commandId?: string;
    }
  | {
      readonly kind: "scientific-event";
      readonly eventKind: ScientificTimelineTargetKind;
      /**
       * Stable identifier for the scenario/science definition that makes the
       * requested event meaningful. A display label is not sufficient.
       */
      readonly definitionId: string;
    };

export interface TimelineBookmark {
  readonly schemaVersion: typeof TIMELINE_BOOKMARK_SCHEMA_VERSION;
  readonly bookmarkId: string;
  readonly runBranchIdentity: string;
  readonly eventSequence: number;
  readonly tick: number;
  readonly simulationTimeHours: number;
  readonly label: string;
  readonly note?: string;
}

export interface CreateTimelineBookmarkArgs {
  readonly bookmarkId: string;
  readonly runBranchIdentity: string;
  readonly event: SimulationEvent;
  readonly label: string;
  readonly note?: string;
}

export type TimelineTargetSupport =
  | {
      readonly supported: true;
      readonly target: Extract<TimelineTargetRequest, { kind: "authoritative-event" }>;
    }
  | {
      readonly supported: false;
      readonly target: TimelineTargetRequest;
      readonly reason: string;
    };

export type FastForwardUntilEventPlan =
  | {
      readonly status: "continue";
      readonly target: Extract<TimelineTargetRequest, { kind: "authoritative-event" }>;
      readonly inspectedThroughSequence: number;
    }
  | {
      readonly status: "stop";
      readonly target: Extract<TimelineTargetRequest, { kind: "authoritative-event" }>;
      readonly event: SimulationEvent;
      readonly landing: {
        readonly sequence: number;
        readonly tick: number;
        readonly simulationTimeHours: number;
      };
    }
  | {
      readonly status: "refused";
      readonly target: TimelineTargetRequest;
      readonly reason: string;
    };

export interface PlanFastForwardUntilEventArgs {
  readonly runBranchIdentity: string;
  readonly target: TimelineTargetRequest;
  /**
   * Authoritative events supplied by the active run/branch, in their original
   * order. The planner never sorts or repairs this stream.
   */
  readonly events: readonly SimulationEvent[];
  /**
   * Last event sequence already inspected by the caller. Use -1 for a new
   * target. This is event-stream cursor state, not biological time.
   */
  readonly afterSequence: number;
}

export function createTimelineBookmark(
  args: CreateTimelineBookmarkArgs,
): TimelineBookmark {
  assertRunBranchIdentity(args.runBranchIdentity);
  assertToken(args.bookmarkId, "bookmarkId");
  assertToken(args.label, "bookmark label");
  if (args.note !== undefined && args.note.trim() !== args.note) {
    throw new RangeError("bookmark note must not have leading/trailing whitespace");
  }
  assertAuthoritativeEvent(args.event);

  return {
    schemaVersion: TIMELINE_BOOKMARK_SCHEMA_VERSION,
    bookmarkId: args.bookmarkId,
    runBranchIdentity: args.runBranchIdentity,
    eventSequence: args.event.sequence,
    tick: args.event.tick,
    simulationTimeHours: args.event.simulationTimeHours,
    label: args.label,
    ...(args.note === undefined ? {} : { note: args.note }),
  };
}

/**
 * Current protocol-v4 only exposes generic lifecycle/fixture event types.
 *
 * Named scientific threshold/event requests therefore fail closed until the
 * authoritative runtime emits an explicit event vocabulary that can prove
 * those meanings. Generic `advanced` events are never promoted into growth,
 * resistance, depletion, collapse, or lineage evidence here.
 */
export function resolveTimelineTargetSupport(
  target: TimelineTargetRequest,
): TimelineTargetSupport {
  if (target.kind === "scientific-event") {
    assertToken(target.definitionId, "scientific event definitionId");
    return {
      supported: false,
      target,
      reason:
        `authoritative protocol does not currently emit ${target.eventKind} events; ` +
        "generic lifecycle events cannot prove this scientific condition",
    };
  }

  if (target.commandId !== undefined) {
    assertToken(target.commandId, "target commandId");
  }

  if (target.eventType === "synthetic-pulse") {
    return {
      supported: false,
      target,
      reason:
        "synthetic-pulse is infrastructure fixture activity and is not a product scientific fast-forward target",
    };
  }

  return { supported: true, target };
}

export function planFastForwardUntilEvent(
  args: PlanFastForwardUntilEventArgs,
): FastForwardUntilEventPlan {
  assertRunBranchIdentity(args.runBranchIdentity);
  assertCursor(args.afterSequence);
  validateAuthoritativeEventStream(args.events);

  const support = resolveTimelineTargetSupport(args.target);
  if (!support.supported) {
    return {
      status: "refused",
      target: support.target,
      reason: support.reason,
    };
  }

  let inspectedThroughSequence = args.afterSequence;

  for (const event of args.events) {
    if (event.sequence <= args.afterSequence) continue;
    inspectedThroughSequence = event.sequence;
    if (!matchesTarget(event, support.target)) continue;

    return {
      status: "stop",
      target: support.target,
      event: structuredClone(event),
      landing: {
        sequence: event.sequence,
        tick: event.tick,
        simulationTimeHours: event.simulationTimeHours,
      },
    };
  }

  return {
    status: "continue",
    target: support.target,
    inspectedThroughSequence,
  };
}

function matchesTarget(
  event: SimulationEvent,
  target: Extract<TimelineTargetRequest, { kind: "authoritative-event" }>,
): boolean {
  if (event.type !== target.eventType) return false;
  return target.commandId === undefined || event.commandId === target.commandId;
}

function validateAuthoritativeEventStream(
  events: readonly SimulationEvent[],
): void {
  let previousSequence: number | null = null;
  for (const event of events) {
    assertAuthoritativeEvent(event);
    if (
      previousSequence !== null &&
      event.sequence <= previousSequence
    ) {
      throw new RangeError(
        "authoritative timeline events must remain strictly increasing in supplied order",
      );
    }
    previousSequence = event.sequence;
  }
}

function assertAuthoritativeEvent(event: SimulationEvent): void {
  if (!Number.isSafeInteger(event.sequence) || event.sequence < 0) {
    throw new RangeError("event sequence must be a non-negative safe integer");
  }
  if (!Number.isSafeInteger(event.tick) || event.tick < 0) {
    throw new RangeError("event tick must be a non-negative safe integer");
  }
  if (
    !Number.isFinite(event.simulationTimeHours) ||
    event.simulationTimeHours < 0
  ) {
    throw new RangeError(
      "event simulationTimeHours must be finite and non-negative",
    );
  }
}

function assertCursor(sequence: number): void {
  if (!Number.isSafeInteger(sequence) || sequence < -1) {
    throw new RangeError("afterSequence must be -1 or a non-negative safe integer");
  }
}

function assertRunBranchIdentity(value: string): void {
  assertToken(value, "runBranchIdentity");
}

function assertToken(value: string, label: string): void {
  if (value.length === 0 || value.trim() !== value) {
    throw new RangeError(`${label} must be a non-empty trimmed string`);
  }
}
