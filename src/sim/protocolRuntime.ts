import {
  ENGINE_VERSION,
  PROTOCOL_VERSION,
  type RunIdentity,
  type SimulationCheckpoint,
  type SimulationCommand,
  type SimulationEvent,
  type SimulationSnapshot,
  type WorkerRequest,
  type WorkerResponse,
} from './protocol'
import { MAX_SIMULATION_SEED } from './seed'

const HOURS_PER_TICK = 1 / 60
const UINT32_MAX = 0xffff_ffff

type UnknownRecord = Record<string, unknown>

export type ProtocolParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false
      readonly error: string
      readonly commandId: string | null
    }

export function parseWorkerRequest(value: unknown): ProtocolParseResult<WorkerRequest> {
  const record = asRecord(value)
  if (record === null) return requestFailure('expected an object', null)

  if (record.protocolVersion !== PROTOCOL_VERSION) {
    return requestFailure(
      `Unsupported protocol version: ${describeValue(record.protocolVersion)}`,
      commandIdFromUnknownRequest(record),
      false,
    )
  }

  if (record.type === 'initialize') {
    const identity = parseRunIdentity(record.identity)
    return identity.ok
      ? {
          ok: true,
          value: {
            protocolVersion: PROTOCOL_VERSION,
            type: 'initialize',
            identity: identity.value,
          },
        }
      : requestFailure(`initialize.identity ${identity.error}`, null)
  }

  if (record.type === 'command') {
    const command = parseSimulationCommand(record.command)
    return command.ok
      ? {
          ok: true,
          value: {
            protocolVersion: PROTOCOL_VERSION,
            type: 'command',
            command: command.value,
          },
        }
      : requestFailure(
          `command ${command.error}`,
          commandIdFromUnknownCommand(record.command),
        )
  }

  return requestFailure(
    'type must be "initialize" or "command"',
    commandIdFromUnknownRequest(record),
  )
}

export function parseWorkerResponse(value: unknown): ProtocolParseResult<WorkerResponse> {
  const record = asRecord(value)
  if (record === null) return responseFailure('expected an object')

  if (record.protocolVersion !== PROTOCOL_VERSION) {
    return {
      ok: false,
      error: `Worker protocol mismatch: expected ${PROTOCOL_VERSION}, received ${describeValue(record.protocolVersion)}`,
      commandId: null,
    }
  }

  if (record.type === 'ready') {
    const snapshot = parseSimulationSnapshot(record.snapshot)
    return snapshot.ok
      ? {
          ok: true,
          value: {
            protocolVersion: PROTOCOL_VERSION,
            type: 'ready',
            snapshot: snapshot.value,
          },
        }
      : responseFailure(`ready.snapshot ${snapshot.error}`)
  }

  if (record.type === 'snapshot') {
    if (typeof record.commandId !== 'string') {
      return responseFailure('snapshot.commandId must be a string')
    }
    const snapshot = parseSimulationSnapshot(record.snapshot)
    return snapshot.ok
      ? {
          ok: true,
          value: {
            protocolVersion: PROTOCOL_VERSION,
            type: 'snapshot',
            commandId: record.commandId,
            snapshot: snapshot.value,
          },
        }
      : responseFailure(`snapshot.snapshot ${snapshot.error}`)
  }

  if (record.type === 'error') {
    if (
      record.commandId !== undefined &&
      typeof record.commandId !== 'string'
    ) {
      return responseFailure('error.commandId must be a string when present')
    }
    if (typeof record.message !== 'string') {
      return responseFailure('error.message must be a string')
    }
    return {
      ok: true,
      value: {
        protocolVersion: PROTOCOL_VERSION,
        type: 'error',
        ...(typeof record.commandId === 'string'
          ? { commandId: record.commandId }
          : {}),
        message: record.message,
      },
    }
  }

  return responseFailure('type must be "ready", "snapshot", or "error"')
}

function parseSimulationCommand(value: unknown): ParseResult<SimulationCommand> {
  const record = asRecord(value)
  if (record === null) return failure('must be an object')
  if (typeof record.id !== 'string') return failure('.id must be a string')

  if (record.type === 'advance') {
    if (!isNonNegativeSafeInteger(record.ticks)) {
      return failure('.ticks must be a non-negative safe integer')
    }
    return {
      ok: true,
      value: { id: record.id, type: 'advance', ticks: record.ticks },
    }
  }

  if (record.type === 'synthetic-pulse') {
    if (!isFiniteNumber(record.magnitude)) {
      return failure('.magnitude must be finite')
    }
    return {
      ok: true,
      value: {
        id: record.id,
        type: 'synthetic-pulse',
        magnitude: record.magnitude,
      },
    }
  }

  if (record.type === 'restore') {
    const checkpoint = parseCheckpoint(record.checkpoint)
    return checkpoint.ok
      ? {
          ok: true,
          value: {
            id: record.id,
            type: 'restore',
            checkpoint: checkpoint.value,
          },
        }
      : failure(`.checkpoint ${checkpoint.error}`)
  }

  if (record.type === 'snapshot') {
    return { ok: true, value: { id: record.id, type: 'snapshot' } }
  }

  return failure('.type is not a supported simulation command')
}

function parseSimulationSnapshot(value: unknown): ParseResult<SimulationSnapshot> {
  const record = asRecord(value)
  if (record === null) return failure('must be an object')

  const checkpoint = parseCheckpoint(record.checkpoint)
  if (!checkpoint.ok) return failure(`.checkpoint ${checkpoint.error}`)

  if (!Array.isArray(record.events)) return failure('.events must be an array')
  const events: SimulationEvent[] = []
  for (let index = 0; index < record.events.length; index += 1) {
    if (!(index in record.events)) return failure('.events must be dense')
    const event = parseSimulationEvent(record.events[index])
    if (!event.ok) {
      return failure(`.events[${index}] ${event.error}`)
    }
    events.push(event.value)
  }

  if (typeof record.traceHash !== 'string') {
    return failure('.traceHash must be a string')
  }

  return {
    ok: true,
    value: {
      checkpoint: checkpoint.value,
      events,
      traceHash: record.traceHash,
    },
  }
}

function parseCheckpoint(value: unknown): ParseResult<SimulationCheckpoint> {
  const record = asRecord(value)
  if (record === null) return failure('must be an object')

  const identity = parseRunIdentity(record.identity)
  if (!identity.ok) return failure(`.identity ${identity.error}`)
  if (!isNonNegativeSafeInteger(record.tick)) {
    return failure('.tick must be a non-negative safe integer')
  }
  if (
    !isFiniteNumber(record.simulationTimeHours) ||
    record.simulationTimeHours < 0 ||
    record.simulationTimeHours !== record.tick * HOURS_PER_TICK
  ) {
    return failure('.simulationTimeHours must exactly match tick')
  }
  if (
    !isFiniteNumber(record.syntheticPopulation) ||
    record.syntheticPopulation < 0
  ) {
    return failure('.syntheticPopulation must be finite and non-negative')
  }
  if (!isRngState(record.rngState)) {
    return failure(
      '.rngState must contain four uint32 values and cannot be all zero',
    )
  }
  if (!isNonNegativeSafeInteger(record.commandCount)) {
    return failure('.commandCount must be a non-negative safe integer')
  }

  return {
    ok: true,
    value: {
      identity: identity.value,
      tick: record.tick,
      simulationTimeHours: record.simulationTimeHours,
      syntheticPopulation: record.syntheticPopulation,
      rngState: record.rngState,
      commandCount: record.commandCount,
    },
  }
}

function parseRunIdentity(value: unknown): ParseResult<RunIdentity> {
  const record = asRecord(value)
  if (record === null) return failure('must be an object')
  if (record.engineVersion !== ENGINE_VERSION) {
    return failure(`.engineVersion must equal ${ENGINE_VERSION}`)
  }
  if (record.protocolVersion !== PROTOCOL_VERSION) {
    return failure(`.protocolVersion must equal ${PROTOCOL_VERSION}`)
  }
  if (typeof record.scenarioId !== 'string') {
    return failure('.scenarioId must be a string')
  }
  if (typeof record.scenarioVersion !== 'string') {
    return failure('.scenarioVersion must be a string')
  }
  if (typeof record.parameterSetId !== 'string') {
    return failure('.parameterSetId must be a string')
  }
  if (typeof record.parameterSetVersion !== 'string') {
    return failure('.parameterSetVersion must be a string')
  }
  if (!isUint32(record.seed)) {
    return failure('.seed must be an unsigned 32-bit integer')
  }

  return {
    ok: true,
    value: {
      engineVersion: ENGINE_VERSION,
      protocolVersion: PROTOCOL_VERSION,
      scenarioId: record.scenarioId,
      scenarioVersion: record.scenarioVersion,
      parameterSetId: record.parameterSetId,
      parameterSetVersion: record.parameterSetVersion,
      seed: record.seed,
    },
  }
}

function parseSimulationEvent(value: unknown): ParseResult<SimulationEvent> {
  const record = asRecord(value)
  if (record === null) return failure('must be an object')
  if (!isNonNegativeSafeInteger(record.sequence)) {
    return failure('.sequence must be a non-negative safe integer')
  }
  if (!isNonNegativeSafeInteger(record.tick)) {
    return failure('.tick must be a non-negative safe integer')
  }
  if (
    !isFiniteNumber(record.simulationTimeHours) ||
    record.simulationTimeHours < 0
  ) {
    return failure('.simulationTimeHours must be finite and non-negative')
  }
  if (!isSimulationEventType(record.type)) {
    return failure('.type is not a supported simulation event')
  }
  if (
    record.commandId !== undefined &&
    typeof record.commandId !== 'string'
  ) {
    return failure('.commandId must be a string when present')
  }
  if (record.value !== undefined && !isFiniteNumber(record.value)) {
    return failure('.value must be finite when present')
  }

  return {
    ok: true,
    value: {
      sequence: record.sequence,
      tick: record.tick,
      simulationTimeHours: record.simulationTimeHours,
      type: record.type,
      ...(typeof record.commandId === 'string'
        ? { commandId: record.commandId }
        : {}),
      ...(typeof record.value === 'number' ? { value: record.value } : {}),
    },
  }
}

type ParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string }

function failure(error: string): ParseResult<never> {
  return { ok: false, error }
}

function requestFailure(
  message: string,
  commandId: string | null,
  prefix = true,
): ProtocolParseResult<never> {
  return {
    ok: false,
    error: prefix ? `Invalid worker request: ${message}` : message,
    commandId,
  }
}

function responseFailure(message: string): ProtocolParseResult<never> {
  return {
    ok: false,
    error: `Invalid worker response: ${message}`,
    commandId: null,
  }
}

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null
}

function commandIdFromUnknownRequest(record: UnknownRecord): string | null {
  return record.type === 'command'
    ? commandIdFromUnknownCommand(record.command)
    : null
}

function commandIdFromUnknownCommand(value: unknown): string | null {
  const command = asRecord(value)
  return command !== null && typeof command.id === 'string'
    ? command.id
    : null
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0
  )
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isUint32(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_SIMULATION_SEED
  )
}

function isRngState(
  value: unknown,
): value is readonly [number, number, number, number] {
  if (!Array.isArray(value) || value.length !== 4) return false

  let nonZero = false
  for (let index = 0; index < 4; index += 1) {
    if (!(index in value)) return false
    const word = value[index]
    if (
      typeof word !== 'number' ||
      !Number.isInteger(word) ||
      word < 0 ||
      word > UINT32_MAX
    ) {
      return false
    }
    if (word !== 0) nonZero = true
  }
  return nonZero
}

function isSimulationEventType(
  value: unknown,
): value is SimulationEvent['type'] {
  return (
    value === 'initialized' ||
    value === 'advanced' ||
    value === 'synthetic-pulse' ||
    value === 'restored'
  )
}

function describeValue(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value)
  if (value === undefined) return 'missing'
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null
  ) {
    return String(value)
  }
  return typeof value
}
