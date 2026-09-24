import type { ComposedSimulationConfig } from '../sim/authoritative'
import { sameComposedParameterSetBinding } from '../sim/parameterSetBinding'
import {
  PROTOCOL_VERSION,
  assertSimulationSeed,
  type RunIdentity,
  type SimulationCommand,
  type SimulationSnapshot,
  type WorkerRequest,
} from '../sim/protocol'

export const PLAYBACK_SPEEDS = [1, 4, 16] as const
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number]

export interface ExperimentControlState {
  readonly identity: RunIdentity
  readonly playing: boolean
  readonly speed: PlaybackSpeed
  readonly acceptedCommands: readonly SimulationCommand[]
}

export type ExperimentControlAction =
  | { type: 'toggle-play' }
  | { type: 'pause' }
  | { type: 'play' }
  | { type: 'set-speed'; speed: PlaybackSpeed }
  | { type: 'step'; ticks?: number }
  | { type: 'snapshot' }
  | { type: 'reset' }
  | { type: 'set-seed'; seed: number }
  | { type: 'replay' }

export type ControlEffect =
  | { type: 'none' }
  | { type: 'worker-requests'; requests: readonly WorkerRequest[] }

export interface PlannedControlAction {
  readonly state: ExperimentControlState
  readonly effect: ControlEffect
}

export function createExperimentControlState(identity: RunIdentity): ExperimentControlState {
  return {
    identity: structuredClone(identity),
    playing: false,
    speed: 1,
    acceptedCommands: [],
  }
}

export function recordAcceptedCommand(
  state: ExperimentControlState,
  command: SimulationCommand,
): ExperimentControlState {
  if (command.type === 'snapshot' || command.type === 'restore') return state
  return { ...state, acceptedCommands: [...state.acceptedCommands, structuredClone(command)] }
}

export function planExperimentControlAction(
  state: ExperimentControlState,
  action: ExperimentControlAction,
  createCommandId: () => string,
  composedConfig?: ComposedSimulationConfig,
): PlannedControlAction {
  if (action.type === 'toggle-play') return noWorkerEffect({ ...state, playing: !state.playing })
  if (action.type === 'pause') return noWorkerEffect({ ...state, playing: false })
  if (action.type === 'play') return noWorkerEffect({ ...state, playing: true })
  if (action.type === 'set-speed') return noWorkerEffect({ ...state, speed: action.speed })

  if (action.type === 'step') {
    const ticks = action.ticks ?? 1
    if (!Number.isSafeInteger(ticks) || ticks <= 0) throw new Error('step.ticks must be a positive safe integer')
    return withCommands(state, [{ id: createCommandId(), type: 'advance', ticks }])
  }

  if (action.type === 'snapshot') {
    return withCommands(state, [{ id: createCommandId(), type: 'snapshot' }])
  }

  if (action.type === 'reset') {
    return {
      state: { ...state, playing: false, acceptedCommands: [] },
      effect: {
        type: 'worker-requests',
        requests: [initializeRequest(state.identity, composedConfig)],
      },
    }
  }

  if (action.type === 'set-seed') {
    assertSimulationSeed(action.seed)
    const identity = { ...state.identity, seed: action.seed }
    return {
      state: { identity, playing: false, speed: state.speed, acceptedCommands: [] },
      effect: {
        type: 'worker-requests',
        requests: [initializeRequest(identity, composedConfig)],
      },
    }
  }

  const replayRequests: WorkerRequest[] = [
    initializeRequest(state.identity, composedConfig),
    ...state.acceptedCommands.map((command) => ({
      protocolVersion: PROTOCOL_VERSION,
      type: 'command' as const,
      command: structuredClone(command),
    })),
  ]
  return {
    state: { ...state, playing: false },
    effect: { type: 'worker-requests', requests: replayRequests },
  }
}

export function schedulerAdvanceTicks(speed: PlaybackSpeed): number {
  return speed
}

export function snapshotMatchesControlIdentity(
  state: ExperimentControlState,
  snapshot: SimulationSnapshot,
): boolean {
  const checkpoint = snapshot.checkpoint
  return (
    checkpoint.identity.engineVersion === state.identity.engineVersion &&
    checkpoint.identity.protocolVersion === state.identity.protocolVersion &&
    checkpoint.identity.scenarioId === state.identity.scenarioId &&
    checkpoint.identity.scenarioVersion === state.identity.scenarioVersion &&
    checkpoint.identity.parameterSetId === state.identity.parameterSetId &&
    checkpoint.identity.parameterSetVersion === state.identity.parameterSetVersion &&
    sameComposedParameterSetBinding(
      checkpoint.identity.parameterSetBinding,
      state.identity.parameterSetBinding,
    ) &&
    checkpoint.identity.seed === state.identity.seed
  )
}

function initializeRequest(
  identity: RunIdentity,
  composedConfig?: ComposedSimulationConfig,
): WorkerRequest {
  return {
    protocolVersion: PROTOCOL_VERSION,
    type: 'initialize',
    identity: structuredClone(identity),
    ...(composedConfig === undefined
      ? {}
      : { composedConfig: structuredClone(composedConfig) }),
  }
}

function withCommands(
  state: ExperimentControlState,
  commands: readonly SimulationCommand[],
): PlannedControlAction {
  return {
    state,
    effect: {
      type: 'worker-requests',
      requests: commands.map((command) => ({
        protocolVersion: PROTOCOL_VERSION,
        type: 'command',
        command,
      })),
    },
  }
}

function noWorkerEffect(state: ExperimentControlState): PlannedControlAction {
  return { state, effect: { type: 'none' } }
}
