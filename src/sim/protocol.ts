import type { RngState } from './rng'
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

export function createRunIdentity(input: Omit<RunIdentity, 'engineVersion' | 'protocolVersion'>): RunIdentity {
  assertSimulationSeed(input.seed)
  return { engineVersion: ENGINE_VERSION, protocolVersion: PROTOCOL_VERSION, ...input }
}
