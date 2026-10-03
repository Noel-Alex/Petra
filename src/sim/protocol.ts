import type {
  ComposedMetrics,
  ComposedSimulationConfig,
  ComposedSimulationState,
} from './authoritative'
import type { RngState } from './rng'
import type { CiprofloxacinIntervention } from './ciprofloxacinIntervention'
import type { ComposedEcologyObservationEnvelope } from './composedEcologyObservation'
import {
  assertComposedParameterSetBindingIdentity,
  type ComposedParameterSetBinding,
} from './parameterSetBinding'
import { assertSimulationSeed } from './seed'

export { assertSimulationSeed, MAX_SIMULATION_SEED } from './seed'

export const ENGINE_VERSION = 'petra-ts-core/0.1.0' as const
export const PROTOCOL_VERSION = 8 as const

export interface RunIdentity {
  engineVersion: typeof ENGINE_VERSION
  protocolVersion: typeof PROTOCOL_VERSION
  scenarioId: string
  scenarioVersion: string
  parameterSetId: string
  parameterSetVersion: string
  /** Required for composed authority; omitted only by synthetic infrastructure fixtures. */
  parameterSetBinding?: ComposedParameterSetBinding
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
 * Serializable checkpoint for the real composed simulation authority.
 * Ordered lineage/genotype channels are replay-critical state.
 */
export interface ComposedSimulationCheckpoint extends SimulationCheckpointBase {
  readonly authority: 'composed'
  /** Exact biological stochastic-stream position for deterministic continuation. */
  readonly rngState: RngState
  readonly composedState: ComposedSimulationState
  readonly metrics: ComposedMetrics
}

export type SimulationCheckpoint =
  | SyntheticSimulationCheckpoint
  | ComposedSimulationCheckpoint

export type SimulationCommand =
  | { id: string; type: 'advance'; ticks: number }
  | {
      id: string
      type: 'apply-ciprofloxacin'
      intervention: CiprofloxacinIntervention
    }
  | { id: string; type: 'synthetic-pulse'; magnitude: number }
  | { id: string; type: 'restore'; checkpoint: SimulationCheckpoint }
  | { id: string; type: 'snapshot' }

export type WorkerRequest =
  | {
      protocolVersion: typeof PROTOCOL_VERSION
      type: 'initialize'
      identity: RunIdentity
      /**
       * Explicitly opts the worker into composed biological authority.
       * Omission preserves the synthetic infrastructure fixture only.
       */
      composedConfig?: ComposedSimulationConfig
    }
  | {
      protocolVersion: typeof PROTOCOL_VERSION
      type: 'command'
      command: SimulationCommand
    }

export interface SimulationEvent {
  sequence: number
  tick: number
  simulationTimeHours: number
  type:
    | 'initialized'
    | 'advanced'
    | 'ciprofloxacin-applied'
    | 'synthetic-pulse'
    | 'restored'
  commandId?: string
  value?: number
  intervention?: CiprofloxacinIntervention
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
  /**
   * Present only on an accepted advance that executed at least one ecology step.
   * Derived observation authority; excluded from checkpoint continuation and trace identity.
   */
  ecologyObservation?: ComposedEcologyObservationEnvelope
}

export type SimulationSnapshot =
  | SyntheticSimulationSnapshot
  | ComposedSimulationSnapshot

/**
 * Narrows a snapshot through the nested `checkpoint.authority` discriminant.
 *
 * `SimulationSnapshot` is a genuine union, but the discriminant lives one level
 * down inside `checkpoint`, so TypeScript cannot narrow it from an inline
 * `snapshot.checkpoint.authority === 'composed'` comparison. Every
 * composed-authority consumer must therefore go through this predicate instead
 * of comparing the field inline; that keeps the runtime invariant that already
 * exists in the engine expressible to the type system without widening any
 * type or casting through `unknown`.
 */
export function isComposedSimulationSnapshot(
  snapshot: SimulationSnapshot,
): snapshot is ComposedSimulationSnapshot {
  return snapshot.checkpoint.authority === 'composed'
}

/** Complement of {@link isComposedSimulationSnapshot}: infrastructure-fixture authority only. */
export function isSyntheticSimulationSnapshot(
  snapshot: SimulationSnapshot,
): snapshot is SyntheticSimulationSnapshot {
  return snapshot.checkpoint.authority !== 'composed'
}

export type WorkerErrorCode = 'advance-execution-policy-refusal'

export type WorkerResponse =
  | {
      protocolVersion: typeof PROTOCOL_VERSION
      type: 'ready'
      snapshot: SimulationSnapshot
    }
  | {
      protocolVersion: typeof PROTOCOL_VERSION
      type: 'snapshot'
      commandId: string
      snapshot: SimulationSnapshot
    }
  | {
      protocolVersion: typeof PROTOCOL_VERSION
      type: 'error'
      commandId?: string
      code?: WorkerErrorCode
      message: string
    }

export function createRunIdentity(
  input: Omit<RunIdentity, 'engineVersion' | 'protocolVersion'>,
): RunIdentity {
  assertSimulationSeed(input.seed)
  if (input.parameterSetBinding !== undefined) {
    assertComposedParameterSetBindingIdentity(input)
  }
  return {
    engineVersion: ENGINE_VERSION,
    protocolVersion: PROTOCOL_VERSION,
    ...input,
    ...(input.parameterSetBinding === undefined
      ? {}
      : { parameterSetBinding: structuredClone(input.parameterSetBinding) }),
  }
}
