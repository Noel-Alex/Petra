import type { ComposedEcologyObservationEnvelope } from '../sim/composedEcologyObservation'
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
import {
  appendSimulationEventHistory,
  simulationEventHistoryDelta,
} from '../sim/eventHistory'
import { stableSnapshotStringify } from '../sim/snapshotTrace'

export const WORKER_SNAPSHOT_DELTA_TRANSPORT_VERSION = 1 as const

export interface WorkerSnapshotDeltaState {
  readonly checkpoint: SimulationCheckpoint
  readonly traceHash: string
  readonly ecologyObservation?: ComposedEcologyObservationEnvelope
}

export interface WorkerSnapshotDeltaResponse {
  readonly protocolVersion: typeof PROTOCOL_VERSION
  readonly transportVersion: typeof WORKER_SNAPSHOT_DELTA_TRANSPORT_VERSION
  readonly type: 'snapshot-delta'
  readonly commandId: string
  readonly previousEventCount: number
  readonly previousTerminalEvent: SimulationEvent | null
  readonly currentEventCount: number
  readonly appendedEvents: readonly SimulationEvent[]
  readonly snapshotState: WorkerSnapshotDeltaState
}

export type WorkerTransportResponse =
  | WorkerResponse
  | WorkerSnapshotDeltaResponse

type UnknownRecord = Record<string, unknown>

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0
  )
}

/**
 * Create a transport-only delta response when engine-owned immutable event
 * history proves the current snapshot descends from the previously published
 * snapshot by append operations only.
 *
 * Returning null is intentional: callers must send a normal full protocol
 * snapshot and rebase the transport frontier.
 */
export function createWorkerSnapshotDeltaResponse(args: {
  readonly previous: SimulationSnapshot
  readonly current: SimulationSnapshot
  readonly commandId: string
}): WorkerSnapshotDeltaResponse | null {
  if (
    stableSnapshotStringify(args.previous.checkpoint.identity) !==
    stableSnapshotStringify(args.current.checkpoint.identity)
  ) {
    return null
  }

  const appendedEvents = simulationEventHistoryDelta(
    args.previous.events,
    args.current.events,
  )
  if (appendedEvents === null) return null

  const previousTerminalEvent =
    args.previous.events.length === 0
      ? null
      : args.previous.events[args.previous.events.length - 1]!

  return {
    protocolVersion: PROTOCOL_VERSION,
    transportVersion: WORKER_SNAPSHOT_DELTA_TRANSPORT_VERSION,
    type: 'snapshot-delta',
    commandId: args.commandId,
    previousEventCount: args.previous.events.length,
    previousTerminalEvent,
    currentEventCount: args.current.events.length,
    appendedEvents,
    snapshotState: {
      checkpoint: args.current.checkpoint,
      traceHash: args.current.traceHash,
      ...(args.current.ecologyObservation === undefined
        ? {}
        : { ecologyObservation: args.current.ecologyObservation }),
    },
  }
}

/**
 * Transport parser for the existing protocol-v8 full response plus the
 * transport-only append-delta extension.
 *
 * Delta state reuses the protocol-v8 response parser for checkpoint,
 * ecology-observation, trace-string and event structural validation. Only
 * frontier/count semantics are transport-owned here.
 */
export function parseWorkerTransportResponse(
  value: unknown,
): ProtocolParseResult<WorkerTransportResponse> {
  const full = parseWorkerResponse(value)
  if (full.ok) return full

  const record = asRecord(value)
  if (record === null || record.type !== 'snapshot-delta') {
    return full
  }
  if (record.protocolVersion !== PROTOCOL_VERSION) {
    return {
      ok: false,
      error:
        `Worker protocol mismatch: expected ${PROTOCOL_VERSION}, received ${String(record.protocolVersion)}`,
      commandId: null,
    }
  }
  if (
    record.transportVersion !==
    WORKER_SNAPSHOT_DELTA_TRANSPORT_VERSION
  ) {
    return {
      ok: false,
      error:
        'Invalid worker response: snapshot-delta transportVersion is unsupported',
      commandId: null,
    }
  }
  if (typeof record.commandId !== 'string') {
    return {
      ok: false,
      error:
        'Invalid worker response: snapshot-delta.commandId must be a string',
      commandId: null,
    }
  }
  if (!isNonNegativeSafeInteger(record.previousEventCount)) {
    return deltaFailure(
      'previousEventCount must be a non-negative safe integer',
    )
  }
  if (!isNonNegativeSafeInteger(record.currentEventCount)) {
    return deltaFailure(
      'currentEventCount must be a non-negative safe integer',
    )
  }
  if (!Array.isArray(record.appendedEvents)) {
    return deltaFailure('appendedEvents must be an array')
  }

  const previousTerminalEvent = record.previousTerminalEvent
  if (
    (record.previousEventCount === 0 && previousTerminalEvent !== null) ||
    (record.previousEventCount > 0 && previousTerminalEvent === null)
  ) {
    return deltaFailure(
      'previousTerminalEvent nullability must match previousEventCount',
    )
  }

  if (
    record.currentEventCount !==
    record.previousEventCount + record.appendedEvents.length
  ) {
    return deltaFailure(
      'currentEventCount must equal previousEventCount plus appendedEvents length',
    )
  }

  const state = asRecord(record.snapshotState)
  if (state === null) {
    return deltaFailure('snapshotState must be an object')
  }

  const validationEvents =
    previousTerminalEvent === null
      ? record.appendedEvents
      : [previousTerminalEvent, ...record.appendedEvents]

  const syntheticFullResponse = {
    protocolVersion: PROTOCOL_VERSION,
    type: 'snapshot',
    commandId: record.commandId,
    snapshot: {
      checkpoint: state.checkpoint,
      events: validationEvents,
      traceHash: state.traceHash,
      ...(state.ecologyObservation === undefined
        ? {}
        : { ecologyObservation: state.ecologyObservation }),
    },
  }

  const validated = parseWorkerResponse(syntheticFullResponse)
  if (!validated.ok) {
    return {
      ok: false,
      error: validated.error.replace(
        'Invalid worker response: snapshot.snapshot ',
        'Invalid worker response: snapshot-delta ',
      ),
      commandId: null,
    }
  }

  if (
    previousTerminalEvent !== null &&
    previousTerminalEvent.sequence !== record.previousEventCount - 1
  ) {
    return deltaFailure(
      'previousTerminalEvent.sequence must equal previousEventCount - 1',
    )
  }

  for (let index = 0; index < record.appendedEvents.length; index += 1) {
    const event = record.appendedEvents[index] as SimulationEvent
    const expectedSequence = record.previousEventCount + index
    if (event.sequence !== expectedSequence) {
      return deltaFailure(
        `appendedEvents[${index}].sequence must equal ${expectedSequence}`,
      )
    }
  }

  return {
    ok: true,
    value: value as WorkerSnapshotDeltaResponse,
  }
}

/**
 * Reconstruct the normal immutable SimulationSnapshot consumed by the rest of
 * the app from a validated delta transport response.
 */
export function reconstructSimulationSnapshotFromDelta(args: {
  readonly previous: SimulationSnapshot
  readonly response: WorkerSnapshotDeltaResponse
}): SimulationSnapshot {
  const { previous, response } = args

  if (previous.events.length !== response.previousEventCount) {
    throw new Error(
      'snapshot-delta previousEventCount does not match session history',
    )
  }
  if (
    stableSnapshotStringify(previous.checkpoint.identity) !==
    stableSnapshotStringify(response.snapshotState.checkpoint.identity)
  ) {
    throw new Error(
      'snapshot-delta run identity does not match session history',
    )
  }

  const previousTerminal =
    previous.events.length === 0
      ? null
      : previous.events[previous.events.length - 1]!
  if (
    stableSnapshotStringify(previousTerminal) !==
    stableSnapshotStringify(response.previousTerminalEvent)
  ) {
    throw new Error(
      'snapshot-delta previous terminal event does not match session history',
    )
  }

  let events = previous.events
  for (const event of response.appendedEvents) {
    events = appendSimulationEventHistory(events, event)
  }
  if (events.length !== response.currentEventCount) {
    throw new Error(
      'snapshot-delta reconstructed event count does not match currentEventCount',
    )
  }

  return {
    checkpoint: structuredClone(response.snapshotState.checkpoint),
    events,
    traceHash: response.snapshotState.traceHash,
    ...(response.snapshotState.ecologyObservation === undefined
      ? {}
      : {
          ecologyObservation: structuredClone(
            response.snapshotState.ecologyObservation,
          ),
        }),
  } as SimulationSnapshot
}

function deltaFailure(
  message: string,
): ProtocolParseResult<never> {
  return {
    ok: false,
    error: `Invalid worker response: snapshot-delta ${message}`,
    commandId: null,
  }
}
