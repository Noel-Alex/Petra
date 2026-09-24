import { SimulationRng, type RngState } from './rng'
import { assertSimulationSeed } from './seed'

export { assertSimulationSeed, MAX_SIMULATION_SEED } from './seed'

export const ENGINE_VERSION = 'petra-ts-core/0.1.0' as const
export const PROTOCOL_VERSION = 2 as const

export interface RunIdentity {
  engineVersion: typeof ENGINE_VERSION
  protocolVersion: typeof PROTOCOL_VERSION
  scenarioId: string
  scenarioVersion: string
  parameterSetId: string
  parameterSetVersion: string
  seed: number
}

export interface SimulationCheckpoint {
  identity: RunIdentity
  tick: number
  simulationTimeHours: number
  syntheticPopulation: number
  rngState: RngState
  commandCount: number
}

export type SimulationCommand =
  | { id: string; type: 'advance'; ticks: number }
  | { id: string; type: 'synthetic-pulse'; magnitude: number }
  | { id: string; type: 'restore'; checkpoint: SimulationCheckpoint }
  | { id: string; type: 'snapshot' }

export type WorkerRequest =
  | { protocolVersion: typeof PROTOCOL_VERSION; type: 'initialize'; identity: RunIdentity }
  | { protocolVersion: typeof PROTOCOL_VERSION; type: 'command'; command: SimulationCommand }

export interface SimulationEvent {
  sequence: number
  tick: number
  simulationTimeHours: number
  type: 'initialized' | 'advanced' | 'synthetic-pulse' | 'restored'
  commandId?: string
  value?: number
}

export interface SimulationSnapshot {
  checkpoint: SimulationCheckpoint
  events: readonly SimulationEvent[]
  traceHash: string
}

export type WorkerResponse =
  | { protocolVersion: typeof PROTOCOL_VERSION; type: 'ready'; snapshot: SimulationSnapshot }
  | { protocolVersion: typeof PROTOCOL_VERSION; type: 'snapshot'; commandId: string; snapshot: SimulationSnapshot }
  | { protocolVersion: typeof PROTOCOL_VERSION; type: 'error'; commandId?: string; message: string }

const EVENT_TYPES = new Set<SimulationEvent['type']>([
  'initialized',
  'advanced',
  'synthetic-pulse',
  'restored',
])

export function createRunIdentity(input: Omit<RunIdentity, 'engineVersion' | 'protocolVersion'>): RunIdentity {
  assertSimulationSeed(input.seed)
  return { engineVersion: ENGINE_VERSION, protocolVersion: PROTOCOL_VERSION, ...input }
}

/**
 * Worker payloads cross a structured-clone trust boundary. TypeScript annotations
 * do not survive that boundary, so callers must parse unknown runtime values
 * before treating them as versioned Petra protocol messages.
 */
export function parseWorkerRequest(value: unknown): WorkerRequest {
  const record = workerEnvelope(value, 'request')
  const type = record.type

  if (type === 'initialize') {
    if (!isRunIdentity(record.identity)) throw malformedWorkerRequest()
    return value as WorkerRequest
  }

  if (type === 'command') {
    if (!isSimulationCommand(record.command)) throw malformedWorkerRequest()
    return value as WorkerRequest
  }

  throw malformedWorkerRequest()
}

/** See parseWorkerRequest. Invalid snapshots are rejected before UI/session authority sees them. */
export function parseWorkerResponse(value: unknown): WorkerResponse {
  const record = workerEnvelope(value, 'response')
  const type = record.type

  if (type === 'ready') {
    if (!isSimulationSnapshot(record.snapshot)) throw malformedWorkerResponse()
    return value as WorkerResponse
  }

  if (type === 'snapshot') {
    if (typeof record.commandId !== 'string' || !isSimulationSnapshot(record.snapshot)) {
      throw malformedWorkerResponse()
    }
    return value as WorkerResponse
  }

  if (type === 'error') {
    if (
      typeof record.message !== 'string' ||
      (record.commandId !== undefined && typeof record.commandId !== 'string')
    ) {
      throw malformedWorkerResponse()
    }
    return value as WorkerResponse
  }

  throw malformedWorkerResponse()
}

function workerEnvelope(
  value: unknown,
  direction: 'request' | 'response',
): Record<string, unknown> {
  if (!isRecord(value)) {
    throw direction === 'request' ? malformedWorkerRequest() : malformedWorkerResponse()
  }

  const version = value.protocolVersion
  if (version !== PROTOCOL_VERSION) {
    if (typeof version === 'number' && Number.isFinite(version)) {
      if (direction === 'request') {
        throw new Error(`Unsupported protocol version: ${version}`)
      }
      throw new Error(`Worker protocol mismatch: expected ${PROTOCOL_VERSION}, received ${version}`)
    }
    throw direction === 'request' ? malformedWorkerRequest() : malformedWorkerResponse()
  }

  return value
}

function isSimulationCommand(value: unknown): value is SimulationCommand {
  if (!isRecord(value) || typeof value.id !== 'string') return false

  if (value.type === 'advance') {
    return Number.isSafeInteger(value.ticks) && (value.ticks as number) >= 0
  }
  if (value.type === 'synthetic-pulse') {
    return typeof value.magnitude === 'number' && Number.isFinite(value.magnitude)
  }
  if (value.type === 'restore') return isSimulationCheckpoint(value.checkpoint)
  return value.type === 'snapshot'
}

function isRunIdentity(value: unknown): value is RunIdentity {
  if (!isRecord(value)) return false
  if (
    value.engineVersion !== ENGINE_VERSION ||
    value.protocolVersion !== PROTOCOL_VERSION ||
    typeof value.scenarioId !== 'string' ||
    typeof value.scenarioVersion !== 'string' ||
    typeof value.parameterSetId !== 'string' ||
    typeof value.parameterSetVersion !== 'string' ||
    typeof value.seed !== 'number'
  ) {
    return false
  }

  try {
    assertSimulationSeed(value.seed)
    return true
  } catch {
    return false
  }
}

function isSimulationCheckpoint(value: unknown): value is SimulationCheckpoint {
  if (!isRecord(value) || !isRunIdentity(value.identity)) return false
  if (
    !Number.isSafeInteger(value.tick) ||
    (value.tick as number) < 0 ||
    typeof value.simulationTimeHours !== 'number' ||
    !Number.isFinite(value.simulationTimeHours) ||
    value.simulationTimeHours < 0 ||
    typeof value.syntheticPopulation !== 'number' ||
    !Number.isFinite(value.syntheticPopulation) ||
    value.syntheticPopulation < 0 ||
    !Number.isSafeInteger(value.commandCount) ||
    (value.commandCount as number) < 0 ||
    !isRngState(value.rngState)
  ) {
    return false
  }
  return true
}

function isRngState(value: unknown): value is RngState {
  if (!Array.isArray(value) || value.length !== 4) return false
  for (let index = 0; index < 4; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) return false
  }
  try {
    new SimulationRng(value as unknown as RngState)
    return true
  } catch {
    return false
  }
}

function isSimulationEvent(value: unknown): value is SimulationEvent {
  if (!isRecord(value)) return false
  return (
    Number.isSafeInteger(value.sequence) &&
    (value.sequence as number) >= 0 &&
    Number.isSafeInteger(value.tick) &&
    (value.tick as number) >= 0 &&
    typeof value.simulationTimeHours === 'number' &&
    Number.isFinite(value.simulationTimeHours) &&
    value.simulationTimeHours >= 0 &&
    typeof value.type === 'string' &&
    EVENT_TYPES.has(value.type as SimulationEvent['type']) &&
    (value.commandId === undefined || typeof value.commandId === 'string') &&
    (value.value === undefined || (typeof value.value === 'number' && Number.isFinite(value.value)))
  )
}

function isSimulationSnapshot(value: unknown): value is SimulationSnapshot {
  return (
    isRecord(value) &&
    isSimulationCheckpoint(value.checkpoint) &&
    isDenseArray(value.events) &&
    value.events.every(isSimulationEvent) &&
    typeof value.traceHash === 'string'
  )
}

function isDenseArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value)) return false
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) return false
  }
  return true
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function malformedWorkerRequest(): Error {
  return new Error('Malformed worker request')
}

function malformedWorkerResponse(): Error {
  return new Error('Malformed worker response')
}
