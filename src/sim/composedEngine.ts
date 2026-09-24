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
import { assertEcologyLocalCapacity } from './ecology/capacity'
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

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const object = value as Record<string, unknown>
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`)
    .join(',')}}`
}

/** FNV-1a regression identity. It is deterministic, not cryptographic. */
function traceHash(value: unknown): string {
  const text = stableStringify(value)
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
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

function validateState(
  state: ComposedSimulationState,
  config: ComposedSimulationConfig,
): void {
  if (state.version !== COMPOSED_STATE_VERSION) {
    throw new Error(`unsupported composed state version: ${state.version}`)
  }
  if (
    state.configurationFingerprint !== composedConfigurationFingerprint(config)
  ) {
    throw new Error('composed checkpoint configuration fingerprint mismatch')
  }
  if (state.width !== config.width || state.height !== config.height) {
    throw new Error('composed checkpoint dimensions do not match configuration')
  }

  const cells = state.width * state.height
  if (
    state.mask.length !== cells ||
    state.resource.length !== cells ||
    state.lineageIds.length !== config.lineages.length ||
    state.genotypeIds.length !== config.lineages.length ||
    state.lineageBiomass.length !== config.lineages.length ||
    state.lineageBiomass.some((channel) => channel.length !== cells)
  ) {
    throw new Error('composed checkpoint arrays do not match configuration')
  }

  for (let cell = 0; cell < cells; cell += 1) {
    const mask = state.mask[cell]
    if (mask !== 0 && mask !== 1) {
      throw new Error('composed checkpoint mask values must be exactly 0 or 1')
    }
    if (mask !== config.mask[cell]) {
      throw new Error('composed checkpoint mask does not match configuration')
    }

    const resource = state.resource[cell]!
    finiteNonNegative('composed checkpoint resource', resource)
    if (mask === 0 && resource !== 0) {
      throw new Error('composed checkpoint resource must be zero outside the mask')
    }
  }

  state.lineageIds.forEach((id, lineageIndex) => {
    if (id !== config.lineages[lineageIndex]?.id) {
      throw new Error('composed checkpoint lineage order does not match configuration')
    }
    if (
      state.genotypeIds[lineageIndex] !==
      config.lineages[lineageIndex]?.genotypeId
    ) {
      throw new Error('composed checkpoint genotype order does not match configuration')
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

  for (let cell = 0; cell < cells; cell += 1) {
    if (state.mask[cell] !== 1) continue
    let totalBiomass = 0
    for (const channel of state.lineageBiomass) {
      totalBiomass += channel[cell]!
    }
    assertEcologyLocalCapacity(
      totalBiomass,
      config.growth.localCapacity,
      state.lineageBiomass.length,
      cell,
    )
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
  if (stableStringify(stateIds) !== stableStringify(metricIds)) {
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

  constructor(identity: RunIdentity, config: ComposedSimulationConfig) {
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

    if (!Number.isSafeInteger(command.ticks) || command.ticks < 0) {
      throw new Error('advance.ticks must be a non-negative safe integer')
    }
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
    for (let index = 0; index < command.ticks; index += 1) {
      workingMetrics = stepComposedState(workingState, this.config)
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
      traceHash: traceHash({ checkpoint, events }),
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
    if (
      stableStringify(checkpoint.identity) !== stableStringify(this.identity)
    ) {
      throw new Error(
        'Cannot restore a checkpoint from a different run identity',
      )
    }
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

    validateState(checkpoint.composedState, this.config)
    const restoredState = cloneComposedState(checkpoint.composedState)
    const restoredMetrics = validateMetrics(checkpoint.metrics, restoredState)

    this.tick = checkpoint.tick
    this.commandCount = checkpoint.commandCount
    this.state = restoredState
    this.metrics = restoredMetrics
    this.events.length = 0
  }
}
