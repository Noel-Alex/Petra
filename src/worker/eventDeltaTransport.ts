import type { ComposedEcologyObservationEnvelope } from '../sim/composedEcologyObservation'
import {
  appendSimulationEventHistory,
  simulationEventHistoryDelta,
} from '../sim/eventHistory'
import {
  PROTOCOL_VERSION,
  type SimulationCheckpoint,
  type SimulationEvent,
  type SimulationSnapshot,
  type WorkerResponse,
} from '../sim/protocol'
import {
  parseWorkerResponse,
  type ProtocolParseResult,
} from '../sim/protocolRuntime'
import { stableSnapshotStringify } from '../sim/snapshotTrace'

export const WORKER_EVENT_DELTA_TRANSPORT_VERSION = 1 as const

export interface WorkerSnapshotDeltaState {
  readonly checkpoint: SimulationCheckpoint
  readonly traceHash: string
  readonly ecologyObservation?: ComposedEcologyObservationEnvelope
}

export interface WorkerSnapshotDeltaResponse {
  readonly protocolVersion: typeof PROTOCOL_VERSION
  readonly transportVersion: typeof WORKER_EVENT_DELTA_TRANSPORT_VERSION
  readonly type: 'snapshot-delta'
  readonly commandId: string
  readonly previousEventCount: number
  readonly previousTerminalEvent: SimulationEvent | null
  readonly currentEventCount: number
  readonly appendedEvents: readonly SimulationEvent[]
  readonly snapshot: WorkerSnapshotDeltaState
}

export type WorkerTransportResponse =
  | WorkerResponse
  | WorkerSnapshotDeltaResponse

type UnknownRecord = Record<string, unknown>

/**
 * Build the compact response only when copy-on-write history ancestry proves
 * the current engine history descends from the previously published history.
 *
 * Proof cost is O(number of newly appended events), never O(total retained
 * history). Restore/rebase/foreign histories deliberately fall back to the
 * existing full protocol-v8 snapshot response.
 */
export function createWorkerSnapshotTransportResponse(args: {
  readonly commandId: string
  readonly previousEvents: readonly SimulationEvent[] | null
  readonly snapshot: SimulationSnapshot
}): WorkerTransportResponse {
  const full: WorkerResponse = {
    protocolVersion: PROTOCOL_VERSION,
    type: 'snapshot',
    commandId: args.commandId,
    snapshot: args.snapshot,
  }

  const previous = args.previousEvents
  if (previous === null) return full

  const appendedEvents = simulationEventHistoryDelta(
    previous,
    args.snapshot.events,
  )
  if (appendedEvents === null) return full

  const previousTerminalEvent =
    previous.length === 0 ? null : previous[previous.length - 1]!

  return {
    protocolVersion: PROTOCOL_VERSION,
    transportVersion: WORKER_EVENT_DELTA_TRANSPORT_VERSION,
    type: 'snapshot-delta',
    commandId: args.commandId,
    previousEventCount: previous.length,
    previousTerminalEvent,
    currentEventCount: args.snapshot.events.length,
    appendedEvents,
    snapshot: snapshotTransportState(args.snapshot),
  }
}

/**
 * Parse the transport-only delta envelope while delegating scientific
 * checkpoint/event/ecology structure to the existing protocol-v8 parser.
 *
 * Only the retained terminal event plus the newly appended suffix are passed
 * through event validation, so old history is not reparsed every command.
 */
export function parseWorkerSnapshotDeltaResponse(
  value: unknown,
): ProtocolParseResult<WorkerSnapshotDeltaResponse> {
  const record = asRecord(value)
  if (record === null) {
    return transportFailure('expected an object')
  }
  if (record.protocolVersion !== PROTOCOL_VERSION) {
    return transportFailure(
      `protocolVersion must equal ${PROTOCOL_VERSION}`,
    )
  }
  if (
    record.transportVersion !==
    WORKER_EVENT_DELTA_TRANSPORT_VERSION
  ) {
    return transportFailure(
      `transportVersion must equal ${WORKER_EVENT_DELTA_TRANSPORT_VERSION}`,
    )
  }
  if (record.type !== 'snapshot-delta') {
    return transportFailure('type must be "snapshot-delta"')
  }
  if (
    typeof record.commandId !== 'string' ||
    record.commandId.length === 0
  ) {
    return transportFailure('commandId must be a non-empty string')
  }
  if (!isNonNegativeSafeInteger(record.previousEventCount)) {
    return transportFailure(
      'previousEventCount must be a non-negative safe integer',
    )
  }
  if (!isNonNegativeSafeInteger(record.currentEventCount)) {
    return transportFailure(
      'currentEventCount must be a non-negative safe integer',
    )
  }
  if (!Array.isArray(record.appendedEvents)) {
    return transportFailure('appendedEvents must be an array')
  }
  for (let index = 0; index < record.appendedEvents.length; index += 1) {
    if (!(index in record.appendedEvents)) {
      return transportFailure('appendedEvents must be dense')
    }
  }

  const previousEventCount = record.previousEventCount as number
  const currentEventCount = record.currentEventCount as number
  const appendedEvents = record.appendedEvents as readonly unknown[]
  if (
    currentEventCount !== previousEventCount + appendedEvents.length
  ) {
    return transportFailure(
      'currentEventCount must equal previousEventCount plus appendedEvents length',
    )
  }

  if (previousEventCount === 0) {
    if (record.previousTerminalEvent !== null) {
      return transportFailure(
        'previousTerminalEvent must be null for empty prior history',
      )
    }
  } else {
    const terminal = asRecord(record.previousTerminalEvent)
    if (
      terminal === null ||
      terminal.sequence !== previousEventCount - 1
    ) {
      return transportFailure(
        'previousTerminalEvent sequence must match the prior history frontier',
      )
    }
  }

  for (let index = 0; index < appendedEvents.length; index += 1) {
    const event = asRecord(appendedEvents[index])
    if (
      event === null ||
      event.sequence !== previousEventCount + index
    ) {
      return transportFailure(
        `appendedEvents[${index}] sequence must equal ${previousEventCount + index}`,
      )
    }
  }

  const snapshot = asRecord(record.snapshot)
  if (snapshot === null) {
    return transportFailure('snapshot must be an object')
  }
  if (snapshot.events !== undefined) {
    return transportFailure(
      'snapshot transport state must not contain a full events array',
    )
  }

  const validationEvents =
    previousEventCount === 0
      ? appendedEvents
      : [record.previousTerminalEvent, ...appendedEvents]
  const coreValidation = parseWorkerResponse({
    protocolVersion: PROTOCOL_VERSION,
    type: 'snapshot',
    commandId: record.commandId,
    snapshot: {
      checkpoint: snapshot.checkpoint,
      events: validationEvents,
      traceHash: snapshot.traceHash,
      ...(snapshot.ecologyObservation === undefined
        ? {}
        : { ecologyObservation: snapshot.ecologyObservation }),
    },
  })
  if (!coreValidation.ok) {
    return {
      ok: false,
      error:
        'Invalid worker delta response: ' +
        coreValidation.error.replace(/^Invalid worker response:\s*/, ''),
      commandId: null,
    }
  }

  return {
    ok: true,
    value: value as WorkerSnapshotDeltaResponse,
  }
}

/**
 * Reconstruct the exact full SimulationSnapshot expected by existing runtime
 * consumers while sharing the already-owned immutable retained event prefix.
 */
export function materializeWorkerSnapshotDelta(
  previousSnapshot: SimulationSnapshot | null,
  response: WorkerSnapshotDeltaResponse,
): SimulationSnapshot {
  if (previousSnapshot === null) {
    throw new Error(
      'worker snapshot delta requires an accepted baseline snapshot',
    )
  }
  if (
    previousSnapshot.events.length !== response.previousEventCount
  ) {
    throw new Error(
      'worker snapshot delta previous event count does not match session history',
    )
  }

  const previousTerminal =
    previousSnapshot.events.length === 0
      ? null
      : previousSnapshot.events[previousSnapshot.events.length - 1]!
  if (
    !sameOptionalEvent(
      previousTerminal,
      response.previousTerminalEvent,
    )
  ) {
    throw new Error(
      'worker snapshot delta retained event frontier does not match session history',
    )
  }

  if (
    stableSnapshotStringify(previousSnapshot.checkpoint.identity) !==
    stableSnapshotStringify(response.snapshot.checkpoint.identity)
  ) {
    throw new Error(
      'worker snapshot delta run identity does not match session history',
    )
  }
  if (
    response.snapshot.checkpoint.tick <
      previousSnapshot.checkpoint.tick ||
    response.snapshot.checkpoint.commandCount <
      previousSnapshot.checkpoint.commandCount ||
    response.snapshot.checkpoint.simulationTimeHours <
      previousSnapshot.checkpoint.simulationTimeHours
  ) {
    throw new Error(
      'worker snapshot delta checkpoint frontier regressed',
    )
  }

  let events = previousSnapshot.events
  for (const event of response.appendedEvents) {
    events = appendSimulationEventHistory(events, event)
  }
  if (events.length !== response.currentEventCount) {
    throw new Error(
      'worker snapshot delta materialized event count does not match frontier',
    )
  }

  return {
    checkpoint: structuredClone(response.snapshot.checkpoint),
    events,
    traceHash: response.snapshot.traceHash,
    ...(response.snapshot.ecologyObservation === undefined
      ? {}
      : {
          ecologyObservation: structuredClone(
            response.snapshot.ecologyObservation,
          ),
        }),
  } as SimulationSnapshot
}

function snapshotTransportState(
  snapshot: SimulationSnapshot,
): WorkerSnapshotDeltaState {
  return {
    checkpoint: snapshot.checkpoint,
    traceHash: snapshot.traceHash,
    ...('ecologyObservation' in snapshot &&
    snapshot.ecologyObservation !== undefined
      ? { ecologyObservation: snapshot.ecologyObservation }
      : {}),
  }
}

function sameOptionalEvent(
  left: SimulationEvent | null,
  right: SimulationEvent | null,
): boolean {
  if (left === null || right === null) return left === right
  return stableSnapshotStringify(left) === stableSnapshotStringify(right)
}

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
    ? (value as UnknownRecord)
    : null
}

function isNonNegativeSafeInteger(value: unknown): boolean {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0
  )
}

function transportFailure(
  message: string,
): ProtocolParseResult<never> {
  return {
    ok: false,
    error: `Invalid worker delta response: ${message}`,
    commandId: null,
  }
}
