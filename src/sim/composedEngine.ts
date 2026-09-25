import {
  cloneComposedState,
  createComposedState,
  stepComposedStateDetailed,
  validateComposedStateAgainstConfig,
  type ComposedMetrics,
  type ComposedSimulationConfig,
  type ComposedSimulationState,
} from './authoritative'
import {
  DEFAULT_ADVANCE_EXECUTION_POLICY,
  enforceAdvanceExecutionPolicy,
  validateAdvanceExecutionPolicy,
  type AdvanceExecutionPolicy,
} from './advanceExecutionPolicy'
import { assertComposedParameterSetBinding } from './parameterSetBinding'
import { createComposedStepObservationPosition } from './composedObservationTransaction'
import {
  createComposedEcologyObservationEnvelope,
} from './composedEcologyObservation'
import { applyCiprofloxacinIntervention } from './ciprofloxacinIntervention'
import { assertReplayCompatibility } from './replayCompatibility'
import {
  simulationSnapshotTraceHash,
  stableSnapshotStringify,
} from './snapshotTrace'
import type {
  ComposedSimulationCheckpoint,
  ComposedSimulationSnapshot,
  RunIdentity,
  SimulationCheckpoint,
  SimulationCommand,
  SimulationEvent,
} from './protocol'

function finiteNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be finite and non-negative`)
  }
}

function numbersAgree(a: number, b: number): boolean {
  if (Object.is(a, b)) return true
  return Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(a), Math.abs(b))
}

function cloneMetrics(metrics: ComposedMetrics): ComposedMetrics {
  return {
    ...metrics,
    lineageBiomass: { ...metrics.lineageBiomass },
  }
}

function aggregateState(
  state: ComposedSimulationState,
  flux: Pick<
    ComposedMetrics,
    'divisionBiomass' | 'deathBiomass' | 'resourceConsumed'
  > = {
    divisionBiomass: 0,
    deathBiomass: 0,
    resourceConsumed: 0,
  },
): ComposedMetrics {
  const lineageBiomass: Record<string, number> = Object.fromEntries(
    state.lineageIds.map((id) => [id, 0]),
  )
  let totalBiomass = 0
  let totalResource = 0
  let occupiedCells = 0

  for (let cell = 0; cell < state.mask.length; cell += 1) {
    if (state.mask[cell] !== 1) continue
    totalResource += state.resource[cell]!

    let localBiomass = 0
    for (
      let lineageIndex = 0;
      lineageIndex < state.lineageIds.length;
      lineageIndex += 1
    ) {
      const value = state.lineageBiomass[lineageIndex]![cell]!
      localBiomass += value
      const id = state.lineageIds[lineageIndex]!
      lineageBiomass[id] = lineageBiomass[id]! + value
    }

    totalBiomass += localBiomass
    if (localBiomass > 0) occupiedCells += 1
  }

  return {
    totalBiomass,
    totalResource,
    occupiedCells,
    lineageBiomass,
    ...flux,
  }
}

function validateMetrics(
  metrics: ComposedMetrics,
  state: ComposedSimulationState,
): ComposedMetrics {
  finiteNonNegative('checkpoint metrics totalBiomass', metrics.totalBiomass)
  finiteNonNegative('checkpoint metrics totalResource', metrics.totalResource)
  finiteNonNegative(
    'checkpoint metrics divisionBiomass',
    metrics.divisionBiomass,
  )
  finiteNonNegative('checkpoint metrics deathBiomass', metrics.deathBiomass)
  finiteNonNegative(
    'checkpoint metrics resourceConsumed',
    metrics.resourceConsumed,
  )
  if (
    !Number.isSafeInteger(metrics.occupiedCells) ||
    metrics.occupiedCells < 0
  ) {
    throw new Error(
      'checkpoint metrics occupiedCells must be a non-negative safe integer',
    )
  }

  const stateIds = [...state.lineageIds].sort()
  const metricIds = Object.keys(metrics.lineageBiomass).sort()
  if (stableSnapshotStringify(stateIds) !== stableSnapshotStringify(metricIds)) {
    throw new Error('checkpoint metrics lineage identity does not match composed state')
  }
  for (const id of stateIds) {
    finiteNonNegative(
      `checkpoint lineage metric ${id}`,
      metrics.lineageBiomass[id]!,
    )
  }

  const expected = aggregateState(state, {
    divisionBiomass: metrics.divisionBiomass,
    deathBiomass: metrics.deathBiomass,
    resourceConsumed: metrics.resourceConsumed,
  })
  if (
    !numbersAgree(expected.totalBiomass, metrics.totalBiomass) ||
    !numbersAgree(expected.totalResource, metrics.totalResource) ||
    expected.occupiedCells !== metrics.occupiedCells
  ) {
    throw new Error('checkpoint metrics do not match composed state aggregates')
  }
  for (const id of stateIds) {
    if (
      !numbersAgree(
        expected.lineageBiomass[id]!,
        metrics.lineageBiomass[id]!,
      )
    ) {
      throw new Error(
        `checkpoint lineage metric for ${id} does not match composed state`,
      )
    }
  }

  return expected
}

function isComposedCheckpoint(
  checkpoint: SimulationCheckpoint,
): checkpoint is ComposedSimulationCheckpoint {
  return checkpoint.authority === 'composed'
}

/**
 * Worker-facing deterministic game loop over Petra's real composed ecology
 * authority. Biological values remain entirely caller/scenario supplied.
 */
export class ComposedSimulationEngine {
  private readonly identity: RunIdentity
  private readonly config: ComposedSimulationConfig
  private state: ComposedSimulationState
  private metrics: ComposedMetrics
  private tick = 0
  private commandCount = 0
  private readonly events: SimulationEvent[] = []
  private readonly advanceExecutionPolicy: AdvanceExecutionPolicy

  constructor(
    identity: RunIdentity,
    config: ComposedSimulationConfig,
    advanceExecutionPolicy: AdvanceExecutionPolicy = DEFAULT_ADVANCE_EXECUTION_POLICY,
  ) {
    validateAdvanceExecutionPolicy(advanceExecutionPolicy)
    assertComposedParameterSetBinding(identity, config)

    if (
      identity.scenarioId !== config.evolutionScenario.scenarioId ||
      identity.scenarioVersion !== config.evolutionScenario.scenarioVersion
    ) {
      throw new Error(
        'run identity scenario must match composed evolution scenario',
      )
    }

    this.identity = structuredClone(identity)
    this.config = structuredClone(config)
    this.advanceExecutionPolicy = Object.freeze({ ...advanceExecutionPolicy })
    this.state = createComposedState(this.config)
    this.metrics = aggregateState(this.state)
    this.pushEvent({ type: 'initialized' })
  }

  execute(command: SimulationCommand): ComposedSimulationSnapshot {
    if (command.type === 'restore') {
      if (!isComposedCheckpoint(command.checkpoint)) {
        throw new Error(
          'Cannot restore a synthetic checkpoint into composed authority',
        )
      }
      this.restore(command.checkpoint)
      this.pushEvent({ type: 'restored', commandId: command.id })
      return this.snapshot()
    }

    if (command.type === 'snapshot') return this.snapshot()

    if (command.type === 'synthetic-pulse') {
      throw new Error(
        'synthetic-pulse is an infrastructure fixture and is not available in composed authority',
      )
    }

    if (command.type === 'apply-ciprofloxacin') {
      if (!Number.isSafeInteger(this.commandCount + 1)) {
        throw new Error(
          'ciprofloxacin intervention would exceed the safe integer command-count domain',
        )
      }

      const workingState = cloneComposedState(this.state)
      applyCiprofloxacinIntervention(
        workingState,
        this.config,
        command.intervention,
      )
      this.state = workingState
      this.commandCount += 1
      this.pushEvent({
        type: 'ciprofloxacin-applied',
        commandId: command.id,
        intervention: structuredClone(command.intervention),
      })
      return this.snapshot()
    }

    if (!Number.isSafeInteger(command.ticks) || command.ticks < 0) {
      throw new Error('advance.ticks must be a non-negative safe integer')
    }
    enforceAdvanceExecutionPolicy(command.ticks, this.advanceExecutionPolicy)
    if (!Number.isSafeInteger(this.tick + command.ticks)) {
      throw new Error('advance would exceed the safe integer tick domain')
    }
    if (!Number.isSafeInteger(this.commandCount + 1)) {
      throw new Error('advance would exceed the safe integer command-count domain')
    }

    // Execute the whole command against detached authority first. A biological
    // or numerical refusal on any later tick must not leave a partially advanced
    // live checkpoint behind: rejected commands are replay no-ops.
    const workingState = cloneComposedState(this.state)
    let workingMetrics = cloneMetrics(this.metrics)
    let finalEcologyObservation = null as ReturnType<
      typeof stepComposedStateDetailed
    >['ecologyObservation'] | null
    for (let index = 0; index < command.ticks; index += 1) {
      const step = stepComposedStateDetailed(workingState, this.config)
      workingMetrics = step.metrics
      finalEcologyObservation = step.ecologyObservation
    }

    this.state = workingState
    this.metrics = workingMetrics
    this.tick += command.ticks
    this.commandCount += 1
    this.pushEvent({
      type: 'advanced',
      commandId: command.id,
      value: command.ticks,
    })
    if (finalEcologyObservation === null) return this.snapshot()

    const accepted = this.snapshot()
    const ecologyObservation = createComposedEcologyObservationEnvelope(
      createComposedStepObservationPosition(accepted.checkpoint),
      finalEcologyObservation,
    )
    return { ...accepted, ecologyObservation }
  }

  snapshot(): ComposedSimulationSnapshot {
    const checkpoint: ComposedSimulationCheckpoint = {
      authority: 'composed',
      identity: structuredClone(this.identity),
      tick: this.tick,
      simulationTimeHours: this.currentSimulationTimeHours(),
      commandCount: this.commandCount,
      composedState: cloneComposedState(this.state),
      metrics: cloneMetrics(this.metrics),
    }
    const events = this.events.map((event) => structuredClone(event))
    return {
      checkpoint,
      events,
      traceHash: simulationSnapshotTraceHash({ checkpoint, events }),
    }
  }

  private currentSimulationTimeHours(): number {
    const value = this.tick * this.config.hoursPerTick
    if (!Number.isFinite(value) || value < 0) {
      throw new Error('composed simulation time became invalid')
    }
    return value
  }

  private pushEvent(
    event: Omit<SimulationEvent, 'sequence' | 'tick' | 'simulationTimeHours'>,
  ): void {
    this.events.push({
      sequence: this.events.length,
      tick: this.tick,
      simulationTimeHours: this.currentSimulationTimeHours(),
      ...event,
    })
  }

  private restore(checkpoint: ComposedSimulationCheckpoint): void {
    assertReplayCompatibility({
      artifactIdentity: checkpoint.identity,
      targetIdentity: this.identity,
      artifactAuthority: 'composed',
      targetAuthority: 'composed',
    })
    if (!Number.isSafeInteger(checkpoint.tick) || checkpoint.tick < 0) {
      throw new Error('checkpoint.tick must be a non-negative safe integer')
    }
    if (
      !Number.isSafeInteger(checkpoint.commandCount) ||
      checkpoint.commandCount < 0
    ) {
      throw new Error(
        'checkpoint.commandCount must be a non-negative safe integer',
      )
    }

    const expectedTime = checkpoint.tick * this.config.hoursPerTick
    if (
      !Number.isFinite(checkpoint.simulationTimeHours) ||
      checkpoint.simulationTimeHours < 0 ||
      !numbersAgree(checkpoint.simulationTimeHours, expectedTime)
    ) {
      throw new Error(
        'checkpoint simulation time does not match composed tick policy',
      )
    }

    validateComposedStateAgainstConfig(checkpoint.composedState, this.config)
    const restoredState = cloneComposedState(checkpoint.composedState)
    const restoredMetrics = validateMetrics(checkpoint.metrics, restoredState)

    this.tick = checkpoint.tick
    this.commandCount = checkpoint.commandCount
    this.state = restoredState
    this.metrics = restoredMetrics
    this.events.length = 0
  }
}
