import { stepEcology } from './ecology/growth'
import type {
  EcologyState,
  GrowthParameters,
  LineageEcologyParameters,
} from './ecology/growth'

/** Versioned serializable composition boundary. Biological values are caller supplied. */
export const COMPOSED_STATE_VERSION = 1 as const

export interface ComposedLineageConfig {
  readonly id: string
  readonly relativeFitness: number
  readonly deathHazardPerHour: number
}

export interface ComposedSimulationConfig {
  readonly width: number
  readonly height: number
  readonly mask: readonly number[]
  readonly initialResource: readonly number[]
  readonly initialLineageBiomass: readonly (readonly number[])[]
  readonly growth: Readonly<GrowthParameters>
  readonly lineages: readonly ComposedLineageConfig[]
  readonly hoursPerTick: number
}

export interface ComposedSimulationState {
  readonly version: typeof COMPOSED_STATE_VERSION
  readonly configurationFingerprint: string
  readonly width: number
  readonly height: number
  readonly mask: number[]
  readonly lineageIds: string[]
  resource: number[]
  lineageBiomass: number[][]
}

export interface ComposedMetrics {
  readonly totalBiomass: number
  readonly totalResource: number
  readonly occupiedCells: number
  readonly lineageBiomass: Readonly<Record<string, number>>
  readonly divisionBiomass: number
  readonly deathBiomass: number
  readonly resourceConsumed: number
}

function finiteNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(name + ' must be finite and non-negative')
  }
}

function positiveFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(name + ' must be positive and finite')
  }
}

function validateConfig(config: ComposedSimulationConfig): void {
  if (
    !Number.isSafeInteger(config.width) ||
    !Number.isSafeInteger(config.height) ||
    config.width <= 0 ||
    config.height <= 0
  ) {
    throw new Error('composed dimensions must be positive safe integers')
  }

  const cellCount = config.width * config.height
  if (!Number.isSafeInteger(cellCount)) {
    throw new Error('composed grid cell count must be a safe integer')
  }
  if (
    config.mask.length !== cellCount ||
    config.initialResource.length !== cellCount
  ) {
    throw new Error('composed field arrays must match grid dimensions')
  }
  if (config.mask.some((value) => value !== 0 && value !== 1)) {
    throw new Error('composed mask values must be exactly 0 or 1')
  }
  if (config.initialLineageBiomass.length !== config.lineages.length) {
    throw new Error('one biomass channel is required per lineage')
  }
  if (
    config.initialLineageBiomass.some(
      (channel) => channel.length !== cellCount,
    )
  ) {
    throw new Error('lineage biomass arrays must match grid dimensions')
  }

  const lineageIds = config.lineages.map((lineage) => lineage.id)
  if (lineageIds.some((id) => id.trim().length === 0)) {
    throw new Error('lineage ids must be non-empty')
  }
  if (new Set(lineageIds).size !== lineageIds.length) {
    throw new Error('lineage ids must be unique')
  }

  positiveFinite('hoursPerTick', config.hoursPerTick)
  finiteNonNegative('maxDivisionRate', config.growth.maxDivisionRate)
  positiveFinite('halfSaturation', config.growth.halfSaturation)
  positiveFinite('biomassYield', config.growth.biomassYield)
  positiveFinite('localCapacity', config.growth.localCapacity)
  finiteNonNegative('spreadRate', config.growth.spreadRate)
  if (!Number.isFinite(config.growth.spreadRate * config.hoursPerTick)) {
    throw new Error('spreadRate * hoursPerTick must be finite')
  }
  if (config.growth.spreadRate * config.hoursPerTick > 0.25) {
    throw new Error(
      'spreadRate * hoursPerTick must be <= 0.25 for the ecology spread step',
    )
  }

  config.initialResource.forEach((value) =>
    finiteNonNegative('initialResource', value),
  )
  config.initialLineageBiomass.forEach((channel) =>
    channel.forEach((value) =>
      finiteNonNegative('initialLineageBiomass', value),
    ),
  )
  config.lineages.forEach((lineage) => {
    finiteNonNegative(
      'relativeFitness(' + lineage.id + ')',
      lineage.relativeFitness,
    )
    finiteNonNegative(
      'deathHazardPerHour(' + lineage.id + ')',
      lineage.deathHazardPerHour,
    )
    if (!Number.isFinite(lineage.deathHazardPerHour * config.hoursPerTick)) {
      throw new Error(
        'deathHazardPerHour(' +
          lineage.id +
          ') * hoursPerTick must be finite',
      )
    }
  })
}

/**
 * Canonical, non-cryptographic identity for configuration that must not drift
 * while continuing one composed state. Initial fields are state, not mechanism
 * configuration, so they are deliberately excluded.
 */
export function composedConfigurationFingerprint(
  config: ComposedSimulationConfig,
): string {
  validateConfig(config)
  return JSON.stringify({
    width: config.width,
    height: config.height,
    mask: Array.from(config.mask),
    growth: {
      maxDivisionRate: config.growth.maxDivisionRate,
      halfSaturation: config.growth.halfSaturation,
      biomassYield: config.growth.biomassYield,
      localCapacity: config.growth.localCapacity,
      spreadRate: config.growth.spreadRate,
    },
    lineages: config.lineages.map((lineage) => ({
      id: lineage.id,
      relativeFitness: lineage.relativeFitness,
      deathHazardPerHour: lineage.deathHazardPerHour,
    })),
    hoursPerTick: config.hoursPerTick,
  })
}

export function createComposedState(
  config: ComposedSimulationConfig,
): ComposedSimulationState {
  const configurationFingerprint = composedConfigurationFingerprint(config)
  return {
    version: COMPOSED_STATE_VERSION,
    configurationFingerprint,
    width: config.width,
    height: config.height,
    mask: Array.from(config.mask),
    lineageIds: config.lineages.map((lineage) => lineage.id),
    resource: Array.from(config.initialResource),
    lineageBiomass: config.initialLineageBiomass.map((channel) =>
      Array.from(channel),
    ),
  }
}

function validateStateAgainstConfig(
  state: ComposedSimulationState,
  config: ComposedSimulationConfig,
): void {
  if (state.version !== COMPOSED_STATE_VERSION) {
    throw new Error('unsupported composed state version: ' + state.version)
  }
  if (
    state.configurationFingerprint !== composedConfigurationFingerprint(config)
  ) {
    throw new Error('composed state configuration fingerprint mismatch')
  }
  if (state.width !== config.width || state.height !== config.height) {
    throw new Error('composed state dimensions do not match configuration')
  }

  const cellCount = state.width * state.height
  if (state.mask.length !== cellCount || state.resource.length !== cellCount) {
    throw new Error('composed state fields do not match grid dimensions')
  }
  if (state.mask.some((value) => value !== 0 && value !== 1)) {
    throw new Error('composed state mask values must be exactly 0 or 1')
  }
  if (state.mask.some((value, index) => value !== config.mask[index])) {
    throw new Error('composed state mask does not match configuration')
  }

  if (
    state.lineageIds.length !== config.lineages.length ||
    state.lineageBiomass.length !== config.lineages.length
  ) {
    throw new Error('composed state lineage channels do not match configuration')
  }
  state.lineageIds.forEach((id, index) => {
    if (id !== config.lineages[index]?.id) {
      throw new Error('composed state lineage order does not match configuration')
    }
  })
  if (state.lineageBiomass.some((channel) => channel.length !== cellCount)) {
    throw new Error('composed state lineage arrays must match grid dimensions')
  }

  state.resource.forEach((value) =>
    finiteNonNegative('state.resource', value),
  )
  state.lineageBiomass.forEach((channel) =>
    channel.forEach((value) =>
      finiteNonNegative('state.lineageBiomass', value),
    ),
  )
}

function asEcologyState(state: ComposedSimulationState): EcologyState {
  return {
    width: state.width,
    height: state.height,
    mask: Uint8Array.from(state.mask),
    resource: Float32Array.from(state.resource),
    lineages: state.lineageBiomass.map((channel) => Float32Array.from(channel)),
  }
}

export function stepComposedState(
  state: ComposedSimulationState,
  config: ComposedSimulationConfig,
): ComposedMetrics {
  validateConfig(config)
  validateStateAgainstConfig(state, config)

  const ecology = asEcologyState(state)
  const lineageParameters: LineageEcologyParameters[] = config.lineages.map(
    (lineage) => ({
      relativeFitness: lineage.relativeFitness,
      deathHazardPerTime: lineage.deathHazardPerHour,
    }),
  )
  const result = stepEcology(
    ecology,
    config.growth,
    lineageParameters,
    config.hoursPerTick,
  )

  state.resource = Array.from(ecology.resource)
  state.lineageBiomass = ecology.lineages.map((channel) => Array.from(channel))

  const lineageBiomass: Record<string, number> = {}
  config.lineages.forEach((lineage, index) => {
    lineageBiomass[lineage.id] = state.lineageBiomass[index]!.reduce(
      (sum, value) => sum + value,
      0,
    )
  })

  return {
    totalBiomass: result.metrics.totalBiomass,
    totalResource: state.resource.reduce((sum, value) => sum + value, 0),
    occupiedCells: result.metrics.occupiedCells,
    lineageBiomass,
    divisionBiomass: result.metrics.divisionBiomass,
    deathBiomass: result.metrics.deathBiomass,
    resourceConsumed: result.metrics.resourceConsumed,
  }
}

export function cloneComposedState(
  state: ComposedSimulationState,
): ComposedSimulationState {
  return {
    version: state.version,
    configurationFingerprint: state.configurationFingerprint,
    width: state.width,
    height: state.height,
    mask: [...state.mask],
    lineageIds: [...state.lineageIds],
    resource: [...state.resource],
    lineageBiomass: state.lineageBiomass.map((channel) => [...channel]),
  }
}
