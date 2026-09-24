import type { ComposedMetrics, ComposedSimulationConfig, ComposedSimulationState } from './authoritative'
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

interface SimulationCheckpointBase {
  identity: RunIdentity
  tick: number
  simulationTimeHours: number
  commandCount: number
}

/**
 * Infrastructure-only checkpoint retained for deterministic substrate tests.
 * Product-facing science must not treat this shape as biological authority.
 */
export interface SyntheticSimulationCheckpoint extends SimulationCheckpointBase {
  readonly authority?: 'synthetic'
  syntheticPopulation: number
  rngState: RngState
}

/**
 * Serializable authoritative ecology/composition checkpoint.
 * Mutable arrays are deep-copied at the engine boundary before transport.
 */
export interface ComposedSimulationCheckpoint extends SimulationCheckpointBase {
  readonly authority: 'composed'
  readonly composedState: ComposedSimulationState
  readonly metrics: ComposedMetrics
}

export type SimulationCheckpoint =
  | SyntheticSimulationCheckpoint
  | ComposedSimulationCheckpoint

export type SimulationCommand =
  | { id: string; type: 'advance'; ticks: number }
  | { id: string; type: 'synthetic-pulse'; magnitude: number }
  | { id: string; type: 'restore'; checkpoint: SimulationCheckpoint }
  | { id: string; type: 'snapshot' }

export type WorkerRequest =
  | {
      protocolVersion: typeof PROTOCOL_VERSION
      type: 'initialize'
      identity: RunIdentity
      /**
       * Explicit authoritative composition capability. Omission preserves the
       * synthetic infrastructure fixture; callers must never invent a config.
       */
      composedConfig?: ComposedSimulationConfig
    }
  | { protocolVersion: typeof PROTOCOL_VERSION; type: 'command'; command: SimulationCommand }

export interface SimulationEvent {
  sequence: number
  tick: number
  simulationTimeHours: number
  type: 'initialized' | 'advanced' | 'synthetic-pulse' | 'restored'
  commandId?: string
  value?: number
}

interface SimulationSnapshotBase {
  events: readonly SimulationEvent[]
  traceHash: string
}

export interface SyntheticSimulationSnapshot extends SimulationSnapshotBase {
  checkpoint: SyntheticSimulationCheckpoint
}

export interface ComposedSimulationSnapshot extends SimulationSnapshotBase {
  checkpoint: ComposedSimulationCheckpoint
}

export type SimulationSnapshot =
  | SyntheticSimulationSnapshot
  | ComposedSimulationSnapshot

export type WorkerResponse =
  | { protocolVersion: typeof PROTOCOL_VERSION; type: 'ready'; snapshot: SimulationSnapshot }
  | { protocolVersion: typeof PROTOCOL_VERSION; type: 'snapshot'; commandId: string; snapshot: SimulationSnapshot }
  | { protocolVersion: typeof PROTOCOL_VERSION; type: 'error'; commandId?: string; message: string }

export function createRunIdentity(input: Omit<RunIdentity, 'engineVersion' | 'protocolVersion'>): RunIdentity {
  assertSimulationSeed(input.seed)
  return { engineVersion: ENGINE_VERSION, protocolVersion: PROTOCOL_VERSION, ...input }
}
