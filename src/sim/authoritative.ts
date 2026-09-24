import { stepEcology } from './ecology/growth'
import type { EcologyState, GrowthParameters, LineageEcologyParameters } from './ecology/growth'

/** Versioned serializable authority boundary. Biological values are caller supplied. */
export const COMPOSED_STATE_VERSION = 1 as const

export interface ComposedLineageConfig { id: string; relativeFitness: number; deathHazardPerHour: number }
export interface ComposedSimulationConfig {
  width: number; height: number; mask: readonly number[]; initialResource: readonly number[]
  initialLineageBiomass: readonly (readonly number[])[]; growth: GrowthParameters
  lineages: readonly ComposedLineageConfig[]; hoursPerTick: number
}
export interface ComposedSimulationState {
  version: typeof COMPOSED_STATE_VERSION; width: number; height: number; mask: number[]
  resource: number[]; lineageBiomass: number[][]
}
export interface ComposedMetrics {
  totalBiomass: number; totalResource: number; occupiedCells: number
  lineageBiomass: Readonly<Record<string, number>>; divisionBiomass: number
  deathBiomass: number; resourceConsumed: number
}

function finiteNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be finite and non-negative`)
}
function validateConfig(config: ComposedSimulationConfig): void {
  if (!Number.isSafeInteger(config.width) || !Number.isSafeInteger(config.height) || config.width <= 0 || config.height <= 0) throw new Error('composed dimensions must be positive safe integers')
  const n = config.width * config.height
  if (config.mask.length !== n || config.initialResource.length !== n) throw new Error('composed field arrays must match grid dimensions')
  if (config.initialLineageBiomass.length !== config.lineages.length) throw new Error('one biomass channel is required per lineage')
  if (config.initialLineageBiomass.some((channel) => channel.length !== n)) throw new Error('lineage biomass arrays must match grid dimensions')
  if (new Set(config.lineages.map((lineage) => lineage.id)).size !== config.lineages.length) throw new Error('lineage ids must be unique')
  if (!Number.isFinite(config.hoursPerTick) || config.hoursPerTick <= 0) throw new Error('hoursPerTick must be positive and finite')
  config.initialResource.forEach((value) => finiteNonNegative('initialResource', value))
  config.initialLineageBiomass.forEach((channel) => channel.forEach((value) => finiteNonNegative('initialLineageBiomass', value)))
  config.lineages.forEach((lineage) => { finiteNonNegative(`relativeFitness(${lineage.id})`, lineage.relativeFitness); finiteNonNegative(`deathHazardPerHour(${lineage.id})`, lineage.deathHazardPerHour) })
}
export function createComposedState(config: ComposedSimulationConfig): ComposedSimulationState {
  validateConfig(config)
  return { version: COMPOSED_STATE_VERSION, width: config.width, height: config.height, mask: Array.from(config.mask), resource: Array.from(config.initialResource), lineageBiomass: config.initialLineageBiomass.map((channel) => Array.from(channel)) }
}
function asEcologyState(state: ComposedSimulationState): EcologyState {
  if (state.version !== COMPOSED_STATE_VERSION) throw new Error(`unsupported composed state version: ${state.version}`)
  return { width: state.width, height: state.height, mask: Uint8Array.from(state.mask), resource: Float32Array.from(state.resource), lineages: state.lineageBiomass.map((channel) => Float32Array.from(channel)) }
}
export function stepComposedState(state: ComposedSimulationState, config: ComposedSimulationConfig): ComposedMetrics {
  validateConfig(config)
  if (state.width !== config.width || state.height !== config.height || state.lineageBiomass.length !== config.lineages.length) throw new Error('composed state does not match its configuration')
  const ecology = asEcologyState(state)
  const lineageParameters: LineageEcologyParameters[] = config.lineages.map((lineage) => ({ relativeFitness: lineage.relativeFitness, deathHazardPerTime: lineage.deathHazardPerHour }))
  const result = stepEcology(ecology, config.growth, lineageParameters, config.hoursPerTick)
  state.resource = Array.from(ecology.resource); state.lineageBiomass = ecology.lineages.map((channel) => Array.from(channel))
  const lineageBiomass: Record<string, number> = {}
  config.lineages.forEach((lineage, index) => { lineageBiomass[lineage.id] = state.lineageBiomass[index]!.reduce((sum, value) => sum + value, 0) })
  return { totalBiomass: result.metrics.totalBiomass, totalResource: state.resource.reduce((sum, value) => sum + value, 0), occupiedCells: result.metrics.occupiedCells, lineageBiomass, divisionBiomass: result.metrics.divisionBiomass, deathBiomass: result.metrics.deathBiomass, resourceConsumed: result.metrics.resourceConsumed }
}
export function cloneComposedState(state: ComposedSimulationState): ComposedSimulationState {
  return { version: state.version, width: state.width, height: state.height, mask: [...state.mask], resource: [...state.resource], lineageBiomass: state.lineageBiomass.map((channel) => [...channel]) }
}
