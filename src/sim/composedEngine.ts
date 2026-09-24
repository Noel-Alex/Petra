import {
  COMPOSED_STATE_VERSION,
  cloneComposedState,
  composedConfigurationFingerprint,
  createComposedState,
  stepComposedState,
  type ComposedMetrics,
  type ComposedSimulationConfig,
  type ComposedSimulationState,
} from './authoritative'
import type {
  ComposedSimulationCheckpoint,
  ComposedSimulationSnapshot,
  RunIdentity,
  SimulationCheckpoint,
  SimulationCommand,
  SimulationEvent,
} from './protocol'
import { simulationTraceHash, stableStringify } from './trace'

function finiteNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be finite and non-negative`)
  }
}

function cloneMetrics(metrics: ComposedMetrics): ComposedMetrics {
  return {
    ...metrics,
    lineageBiomass: { ...metrics.lineageBiomass },
  }
}

function aggregateStateMetrics(
  state: ComposedSimulationState,
  fluxes: Pick<ComposedMetrics, 'divisionBiomass' | 'deathBiomass' | 'resourceConsumed'> = {
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
    for (let lineageIndex = 0; lineageIndex < state.lineageIds.length; lineageIndex += 1) {
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
    divisionBiomass: fluxes.divisionBiomass,
    deathBiomass: fluxes.deathBiomass,
    resourceConsumed: fluxes.resourceConsumed,
  }
}

function numbersAgree(first: number, second: number): boolean {
  if (Object.is(first, second)) return true
  const scale = Math.max(1, Math.abs(first), Math.abs(second))
  return Math.abs(first - second) <= Number.EPSILON * scale * 16
}

function validateStateShape(
  state: ComposedSimulationState,
  config: ComposedSimulationConfig,
): void {
  if (state.version !== COMPOSED_STATE_VERSION) {
    throw new Error(`unsupported composed state version: ${state.version}`)
  }

  const expectedFingerprint = composedConfigurationFingerprint(config)
  if (state.configurationFingerprint !== expectedFingerprint) {
    throw new Error('composed checkpoint configuration fingerprint mismatch')
  }
  if (state.width !== config.width || state.height !== config.height) {
    throw new Error('composed checkpoint dimensions do not match configuration')
  }

  const cellCount = state.width * state.height
  if (
    state.mask.length !== cellCount ||
    state.resource.length !== cellCount ||
    state.lineageIds.length !== config.lineages.length ||
    state.lineageBiomass.length !== config.lineages.length ||
    state.lineageBiomass.some((channel) => channel.length !== cellCount)
  ) {
    throw new Error('composed checkpoint arrays do not match configuration')
  }

  for (let index = 0; index < cellCount; index += 1) {
    const mask = state.mask[index]
    if (mask !== 0 && mask !== 1) {
      throw new Error('composed checkpoint mask values must be exactly 0 or 1')
    }
    if (mask !== config.mask[index]) {
      throw new Error('composed checkpoint mask does not match configuration')
    }

    const resource = state.resource[index]!
    finiteNonNegative('composed checkpoint resource', resource)
    if (mask === 0 && resource !== 0) {
      throw new Error('composed checkpoint resource must be zero outside the mask')
    }
  }

  state.lineageIds.forEach((id, lineageIndex) => {
    if (id !== config.lineages[lineageIndex]?.id) {
      throw new Error('composed checkpoint lineage order does not match configuration')
    }

    state.lineageBiomass[lineageIndex]!.forEach((value, cell) => {
      finiteNonNegative('composed checkpoint lineage biomass', value)
      if (state.mask[cell] === 0 && value !== 0) {
        throw new Error(
          'composed checkpoint lineage biomass must be zero outside the mask',
        )
      }
    })
  })
}

function validateCheckpointMetrics(
  checkpointMetrics: ComposedMetrics,
  state: ComposedSimulationState,
): ComposedMetrics {
  finiteNonNegative('checkpoint metrics totalBiomass', checkpointMetrics.totalBiomass)
  finiteNonNegative('checkpoint metrics totalResource', checkpointMetrics.totalResource)
  finiteNonNegative('checkpoint metrics divisionBiomass', checkpointMetrics.divisionBiomass)
  finiteNonNegative('checkpoint metrics deathBiomass', checkpointMetrics.deathBiomass)
  finiteNonNegative('checkpoint metrics resourceConsumed', checkpointMetrics.resourceConsumed)
  if (
    !Number.isSafeInteger(checkpointMetrics.occupiedCells) ||
    checkpointMetrics.occupiedCells < 0
  ) {
    throw new Error('checkpoint metrics occupiedCells must be a non-negative safe integer')
  }

  const expectedLineageIds = [...state.lineageIds].sort()
  const metricLineageIds = Object.keys(checkpointMetrics.lineageBiomass).sort()
  if (stableStringify(expectedLineageIds) !== stableStringify(metricLineageIds)) {
    throw new Error('checkpoint metrics lineage identity does not match composed state')
  }
  for (const id of expectedLineageIds) {
    finiteNonNegative(
      `checkpoint metrics lineageBiomass(${id})`,
      checkpointMetrics.lineageBiomass[id]!,
    )
  }

  const aggregate = aggregateStateMetrics(state, {
    divisionBiomass: checkpointMetrics.divisionBiomass,
    deathBiomass: checkpointMetrics.deathBiomass,
    resourceConsumed: checkpointMetrics.resourceConsumed,
  })

  if (
    !numbersAgree(aggregate.totalBiomass, checkpointMetrics.totalBiomass) ||
    !numbersAgree(aggregate.totalResource, checkpointMetrics.totalResource) ||
    aggregate.occupiedCells !== checkpointMetrics.occupiedCells
  ) {
    throw new Error('checkpoint metrics do not match composed state aggregates')
  }

  for (const id of expectedLineageIds) {
    if (
      !numbersAgree(
        aggregate.lineageBiomass[id]!,
        checkpointMetrics.lineageBiomass[id]!,
      )
    ) {
      throw new Error(
        `checkpoint lineage metric for ${id} does not match composed state`,
      )
    }
  }

  return aggregate
}

function isComposedCheckpoint(
  checkpoint: SimulationCheckpoint,
): checkpoint is ComposedSimulationCheckpoint {
  return checkpoint.authority === 'composed'
}

/**
 * Worker-facing deterministic adapter over the existing authoritative composed
 * ecology state. It adds run/tick/event/checkpoint transport semantics without
 * owning or retuning any biological parameter.
 */
export class ComposedSimulationEngine {
  private readonly identity: RunIdentity
  private readonly config: ComposedSimulationConfig
  private state: ComposedSimulationState
  private metrics: ComposedMetrics
  private tick = 0
  private commandCount = 0
  private readonly events: SimulationEvent[] = []

  constructor(identity: RunIdentity, config: ComposedSimulationConfig) {
    this.identity = structuredClone(identity)
    this.config = structuredClone(config)
    this.state = createComposedState(this.config)
    this.metrics = aggregateStateMetrics(this.state)
    this.pushEvent({ type: 'initialized' })
  }

  execute(command: SimulationCommand): ComposedSimulationSnapshot {
    if (command.type === 'restore') {
      if (!isComposedCheckpoint(command.checkpoint)) {
        throw new Error('Cannot restore a synthetic checkpoint into composed authority')
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

    if (!Number.isSafeInteger(command.ticks) || command.ticks < 0) {
      throw new Error('advance.ticks must be a non-negative safe integer')
    }
    if (!Number.isSafeInteger(this.tick + command.ticks)) {
      throw new Error('advance would exceed the safe integer tick domain')
    }

    for (let index = 0; index < command.ticks; index += 1) {
      this.metrics = stepComposedState(this.state, this.config)
      this.tick += 1
    }
    this.commandCount += 1
    this.pushEvent({
      type: 'advanced',
      commandId: command.id,
      value: command.ticks,
    })
    return this.snapshot()
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
    const events = this.events.map((event) => ({ ...event }))
    return {
      checkpoint,
      events,
      traceHash: simulationTraceHash({ checkpoint, events }),
    }
  }

  private currentSimulationTimeHours(): number {
    const time = this.tick * this.config.hoursPerTick
    if (!Number.isFinite(time) || time < 0) {
      throw new Error('composed simulation time became invalid')
    }
    return time
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
    if (stableStringify(checkpoint.identity) !== stableStringify(this.identity)) {
      throw new Error('Cannot restore a checkpoint from a different run identity')
    }
    if (!Number.isSafeInteger(checkpoint.tick) || checkpoint.tick < 0) {
      throw new Error('checkpoint tick must be a non-negative safe integer')
    }
    if (
      !Number.isSafeInteger(checkpoint.commandCount) ||
      checkpoint.commandCount < 0
    ) {
      throw new Error('checkpoint commandCount must be a non-negative safe integer')
    }

    const expectedTime = checkpoint.tick * this.config.hoursPerTick
    if (
      !Number.isFinite(checkpoint.simulationTimeHours) ||
      checkpoint.simulationTimeHours < 0 ||
      !numbersAgree(checkpoint.simulationTimeHours, expectedTime)
    ) {
      throw new Error('checkpoint simulation time does not match composed tick policy')
    }

    validateStateShape(checkpoint.composedState, this.config)
    const restoredState = cloneComposedState(checkpoint.composedState)
    const restoredMetrics = validateCheckpointMetrics(
      checkpoint.metrics,
      restoredState,
    )

    this.tick = checkpoint.tick
    this.commandCount = checkpoint.commandCount
    this.state = restoredState
    this.metrics = restoredMetrics
    this.events.length = 0
  }
}
