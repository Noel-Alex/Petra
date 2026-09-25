import {
  assertAcceptedInterventionFootprint,
  projectAcceptedInterventionFootprint,
  type AcceptedInterventionFootprint,
} from "../render/acceptedInterventionFootprint";
import type {
  ComposedSimulationSnapshot,
  RunIdentity,
  SimulationEvent,
} from "../sim/protocol";
import type { ExperimentRuntimeState } from "./experimentRuntime";

export const RUNTIME_INTERVENTION_FOOTPRINT_FRAME_VERSION = 1 as const;

export interface RuntimeInterventionFootprintFrame {
  readonly version: typeof RUNTIME_INTERVENTION_FOOTPRINT_FRAME_VERSION;
  /** Exact scientific run identity from the enclosing authoritative checkpoint. */
  readonly runIdentity: RunIdentity;
  /** Runtime-owned reset/replay/restore history generation. */
  readonly runBranchIdentity: string;
  /** Accepted mutating-command frontier for this exact snapshot transaction. */
  readonly acceptedCommandCount: number;
  readonly tick: number;
  readonly simulationTimeHours: number;
  readonly snapshotTraceHash: string;
  readonly footprints: readonly AcceptedInterventionFootprint[];
}

interface RuntimeInterventionFootprintCache {
  readonly snapshot: ComposedSimulationSnapshot;
  readonly runIdentityKey: string;
  readonly runBranchIdentity: string;
  readonly eventCount: number;
  readonly lastEventSequence: number;
  readonly lastEventKey: string | null;
  readonly acceptedCommandCount: number;
  readonly tick: number;
  readonly simulationTimeHours: number;
  readonly frame: RuntimeInterventionFootprintFrame;
}

/**
 * Incremental app-owned projection over the authoritative event history.
 *
 * Within one ExperimentRuntime runBranchIdentity the current composed engine
 * appends accepted events and never rewrites the retained prefix. Restore,
 * replay, reset, and reseed rotate runBranchIdentity. This accumulator relies
 * on that explicit runtime contract, checks the retained boundary event in O(1),
 * and projects only the newly appended suffix. Any branch/frontier/boundary
 * discontinuity falls back to a full authoritative rebuild instead of reusing
 * stale presentation geometry.
 *
 * This cache is presentation-only. Event history remains replay/timeline
 * authority and no renderer state participates in continuity decisions.
 */
export class RuntimeInterventionFootprintAccumulator {
  private cache: RuntimeInterventionFootprintCache | null = null;

  project(
    runtimeState: ExperimentRuntimeState,
  ): RuntimeInterventionFootprintFrame {
    const { snapshot, runBranchIdentity } =
      validateRuntimeFootprintAuthority(runtimeState);
    const identityKey = runIdentityKey(snapshot.checkpoint.identity);
    const cache = this.cache;

    if (
      cache !== null &&
      cache.snapshot === snapshot &&
      cache.runBranchIdentity === runBranchIdentity
    ) {
      return cache.frame;
    }

    if (
      cache !== null &&
      sameRuntimeTransaction(
        cache,
        snapshot,
        runBranchIdentity,
        identityKey,
      )
    ) {
      this.cache = {
        ...cache,
        snapshot,
      };
      return cache.frame;
    }

    if (
      cache === null ||
      !canConsumeAppendOnlySuffix(
        cache,
        snapshot,
        runBranchIdentity,
        identityKey,
      )
    ) {
      return this.rebuild(snapshot, runBranchIdentity, identityKey);
    }

    const projectedSuffix = projectFootprintsFromEventRange(
      snapshot,
      cache.eventCount,
      cache.lastEventSequence,
    );
    const footprints =
      projectedSuffix.length === 0
        ? cache.frame.footprints
        : Object.freeze([
            ...cache.frame.footprints,
            ...projectedSuffix,
          ]);
    const frame = createRuntimeInterventionFootprintFrame(
      snapshot,
      runBranchIdentity,
      footprints,
    );
    this.cache = createCache(
      snapshot,
      runBranchIdentity,
      identityKey,
      frame,
    );
    return frame;
  }

  reset(): void {
    this.cache = null;
  }

  private rebuild(
    snapshot: ComposedSimulationSnapshot,
    runBranchIdentity: string,
    identityKey: string,
  ): RuntimeInterventionFootprintFrame {
    const footprints = Object.freeze(
      projectFootprintsFromEventRange(snapshot, 0, -1),
    );
    const frame = createRuntimeInterventionFootprintFrame(
      snapshot,
      runBranchIdentity,
      footprints,
    );
    this.cache = createCache(
      snapshot,
      runBranchIdentity,
      identityKey,
      frame,
    );
    return frame;
  }
}

/**
 * Reference full-history projection retained for deterministic parity tests and
 * stateless callers. The live App path should use
 * RuntimeInterventionFootprintAccumulator so ordinary advances do not rescan
 * unrelated historical events.
 */
export function projectRuntimeInterventionFootprintFrame(
  runtimeState: ExperimentRuntimeState,
): RuntimeInterventionFootprintFrame {
  const { snapshot, runBranchIdentity } =
    validateRuntimeFootprintAuthority(runtimeState);
  return createRuntimeInterventionFootprintFrame(
    snapshot,
    runBranchIdentity,
    Object.freeze(projectFootprintsFromEventRange(snapshot, 0, -1)),
  );
}

/**
 * Resolves the exact intervention collection admitted into one composed dish
 * projection. Supplying a runtime frame avoids any event-history traversal;
 * omitting it intentionally uses the full-history reference path.
 */
export function resolveComposedInterventionFootprints(
  snapshot: ComposedSimulationSnapshot,
  runBranchIdentity: string,
  frame: RuntimeInterventionFootprintFrame | null,
): readonly AcceptedInterventionFootprint[] {
  assertCanonicalIdentity("runBranchIdentity", runBranchIdentity);

  if (frame === null) {
    return Object.freeze(projectFootprintsFromEventRange(snapshot, 0, -1));
  }

  if (frame.version !== RUNTIME_INTERVENTION_FOOTPRINT_FRAME_VERSION) {
    throw new RangeError(
      "runtime intervention footprint frame version is unsupported",
    );
  }
  if (frame.runBranchIdentity !== runBranchIdentity) {
    throw new Error(
      "runtime intervention footprint frame does not match dish runtime branch identity",
    );
  }
  if (
    runIdentityKey(frame.runIdentity) !==
    runIdentityKey(snapshot.checkpoint.identity)
  ) {
    throw new Error(
      "runtime intervention footprint frame does not match dish run identity",
    );
  }
  if (
    frame.acceptedCommandCount !== snapshot.checkpoint.commandCount ||
    frame.tick !== snapshot.checkpoint.tick ||
    !Object.is(
      frame.simulationTimeHours,
      snapshot.checkpoint.simulationTimeHours,
    ) ||
    frame.snapshotTraceHash !== snapshot.traceHash
  ) {
    throw new Error(
      "runtime intervention footprint frame does not match the exact dish snapshot frontier",
    );
  }

  let previousSequence = -1;
  for (const footprint of frame.footprints) {
    assertAcceptedInterventionFootprint(footprint);
    if (footprint.eventSequence <= previousSequence) {
      throw new RangeError(
        "accepted intervention footprints must preserve strictly increasing event sequence",
      );
    }
    assertFootprintWithinCheckpoint(snapshot, footprint);
    previousSequence = footprint.eventSequence;
  }
  return frame.footprints;
}

function validateRuntimeFootprintAuthority(
  runtimeState: ExperimentRuntimeState,
): {
  readonly snapshot: ComposedSimulationSnapshot;
  readonly runBranchIdentity: string;
} {
  const snapshot = runtimeState.snapshot;
  if (snapshot === null) {
    throw new Error(
      "runtime intervention footprints require an authoritative runtime snapshot",
    );
  }
  if (snapshot.checkpoint.authority !== "composed") {
    throw new Error(
      "runtime intervention footprints require composed simulation authority",
    );
  }

  assertCanonicalIdentity(
    "runBranchIdentity",
    runtimeState.runBranchIdentity,
  );
  assertCheckpointFrontier(snapshot);

  if (
    runIdentityKey(runtimeState.controls.identity) !==
    runIdentityKey(snapshot.checkpoint.identity)
  ) {
    throw new Error(
      "runtime intervention footprint snapshot identity does not match active controls",
    );
  }

  return {
    snapshot,
    runBranchIdentity: runtimeState.runBranchIdentity,
  };
}

function createRuntimeInterventionFootprintFrame(
  snapshot: ComposedSimulationSnapshot,
  runBranchIdentity: string,
  footprints: readonly AcceptedInterventionFootprint[],
): RuntimeInterventionFootprintFrame {
  return Object.freeze({
    version: RUNTIME_INTERVENTION_FOOTPRINT_FRAME_VERSION,
    runIdentity: structuredClone(snapshot.checkpoint.identity),
    runBranchIdentity,
    acceptedCommandCount: snapshot.checkpoint.commandCount,
    tick: snapshot.checkpoint.tick,
    simulationTimeHours: snapshot.checkpoint.simulationTimeHours,
    snapshotTraceHash: snapshot.traceHash,
    footprints,
  });
}

function createCache(
  snapshot: ComposedSimulationSnapshot,
  runBranchIdentity: string,
  identityKey: string,
  frame: RuntimeInterventionFootprintFrame,
): RuntimeInterventionFootprintCache {
  const lastEvent =
    snapshot.events.length === 0
      ? null
      : snapshot.events[snapshot.events.length - 1]!;
  return {
    snapshot,
    runIdentityKey: identityKey,
    runBranchIdentity,
    eventCount: snapshot.events.length,
    lastEventSequence: lastEvent?.sequence ?? -1,
    lastEventKey: lastEvent === null ? null : eventContinuityKey(lastEvent),
    acceptedCommandCount: snapshot.checkpoint.commandCount,
    tick: snapshot.checkpoint.tick,
    simulationTimeHours: snapshot.checkpoint.simulationTimeHours,
    frame,
  };
}

function sameRuntimeTransaction(
  cache: RuntimeInterventionFootprintCache,
  snapshot: ComposedSimulationSnapshot,
  runBranchIdentity: string,
  identityKey: string,
): boolean {
  if (
    cache.runBranchIdentity !== runBranchIdentity ||
    cache.runIdentityKey !== identityKey ||
    cache.eventCount !== snapshot.events.length ||
    cache.acceptedCommandCount !== snapshot.checkpoint.commandCount ||
    cache.tick !== snapshot.checkpoint.tick ||
    !Object.is(
      cache.simulationTimeHours,
      snapshot.checkpoint.simulationTimeHours,
    ) ||
    cache.frame.snapshotTraceHash !== snapshot.traceHash
  ) {
    return false;
  }
  return retainedBoundaryMatches(cache, snapshot.events);
}

function canConsumeAppendOnlySuffix(
  cache: RuntimeInterventionFootprintCache,
  snapshot: ComposedSimulationSnapshot,
  runBranchIdentity: string,
  identityKey: string,
): boolean {
  if (
    cache.runBranchIdentity !== runBranchIdentity ||
    cache.runIdentityKey !== identityKey ||
    snapshot.events.length < cache.eventCount ||
    snapshot.checkpoint.commandCount < cache.acceptedCommandCount ||
    snapshot.checkpoint.tick < cache.tick ||
    snapshot.checkpoint.simulationTimeHours < cache.simulationTimeHours
  ) {
    return false;
  }
  return retainedBoundaryMatches(cache, snapshot.events);
}

function retainedBoundaryMatches(
  cache: RuntimeInterventionFootprintCache,
  events: readonly SimulationEvent[],
): boolean {
  if (cache.eventCount === 0) return true;
  const boundary = events[cache.eventCount - 1];
  return (
    boundary !== undefined &&
    boundary.sequence === cache.lastEventSequence &&
    eventContinuityKey(boundary) === cache.lastEventKey
  );
}

function projectFootprintsFromEventRange(
  snapshot: ComposedSimulationSnapshot,
  startIndex: number,
  previousSequence: number,
): AcceptedInterventionFootprint[] {
  if (
    !Number.isSafeInteger(startIndex) ||
    startIndex < 0 ||
    startIndex > snapshot.events.length
  ) {
    throw new RangeError(
      "runtime intervention footprint event range is invalid",
    );
  }
  assertCheckpointFrontier(snapshot);

  const footprints: AcceptedInterventionFootprint[] = [];
  let previousEventSequence = previousSequence;

  for (let index = startIndex; index < snapshot.events.length; index += 1) {
    const event = snapshot.events[index]!;
    assertEventWithinCheckpoint(snapshot, event);
    if (event.sequence <= previousEventSequence) {
      throw new RangeError(
        "accepted intervention footprints must preserve strictly increasing event sequence",
      );
    }
    previousEventSequence = event.sequence;

    const footprint = projectAcceptedInterventionFootprint(event);
    if (footprint === null) continue;
    footprints.push(footprint);
  }

  return footprints;
}

function assertCheckpointFrontier(
  snapshot: ComposedSimulationSnapshot,
): void {
  assertNonNegativeSafeInteger(
    "checkpoint tick",
    snapshot.checkpoint.tick,
  );
  assertFiniteNonNegative(
    "checkpoint simulationTimeHours",
    snapshot.checkpoint.simulationTimeHours,
  );
  assertNonNegativeSafeInteger(
    "accepted command count",
    snapshot.checkpoint.commandCount,
  );
  assertCanonicalIdentity("snapshot trace hash", snapshot.traceHash);
}

function assertEventWithinCheckpoint(
  snapshot: ComposedSimulationSnapshot,
  event: SimulationEvent,
): void {
  assertNonNegativeSafeInteger("event sequence", event.sequence);
  assertNonNegativeSafeInteger("event tick", event.tick);
  assertFiniteNonNegative(
    "event simulationTimeHours",
    event.simulationTimeHours,
  );
  if (event.tick > snapshot.checkpoint.tick) {
    throw new RangeError(
      "accepted intervention footprint event cannot occur after the enclosing checkpoint tick",
    );
  }
  if (
    event.simulationTimeHours >
    snapshot.checkpoint.simulationTimeHours
  ) {
    throw new RangeError(
      "accepted intervention footprint event cannot occur after the enclosing checkpoint biological time",
    );
  }
}

function assertFootprintWithinCheckpoint(
  snapshot: ComposedSimulationSnapshot,
  footprint: AcceptedInterventionFootprint,
): void {
  if (footprint.tick > snapshot.checkpoint.tick) {
    throw new RangeError(
      "accepted intervention footprint cannot occur after the enclosing checkpoint tick",
    );
  }
  if (
    footprint.simulationTimeHours >
    snapshot.checkpoint.simulationTimeHours
  ) {
    throw new RangeError(
      "accepted intervention footprint cannot occur after the enclosing checkpoint biological time",
    );
  }
}

function eventContinuityKey(event: SimulationEvent): string {
  return JSON.stringify(event);
}

function runIdentityKey(identity: RunIdentity): string {
  const binding =
    identity.parameterSetBinding === undefined
      ? null
      : [
          identity.parameterSetBinding.schemaVersion,
          identity.parameterSetBinding.authority,
          identity.parameterSetBinding.parameterSetId,
          identity.parameterSetBinding.parameterSetVersion,
          identity.parameterSetBinding.configurationFingerprint,
        ];

  return JSON.stringify([
    identity.engineVersion,
    identity.protocolVersion,
    identity.scenarioId,
    identity.scenarioVersion,
    identity.parameterSetId,
    identity.parameterSetVersion,
    binding,
    identity.seed,
  ]);
}

function assertCanonicalIdentity(name: string, value: string): void {
  if (value.length === 0 || value !== value.trim()) {
    throw new TypeError(`${name} must be a non-empty canonical string`);
  }
}

function assertNonNegativeSafeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(
      `${name} must be a non-negative safe integer`,
    );
  }
}

function assertFiniteNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be finite and non-negative`);
  }
}
