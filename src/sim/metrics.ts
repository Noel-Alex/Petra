import type { ComposedSimulationCheckpoint, RunIdentity } from './protocol'

export const AUTHORITATIVE_METRIC_SCHEMA_VERSION = 1 as const
export const METRIC_SAMPLING_POLICY_VERSION = 1 as const

export interface MetricSamplingPolicy {
  readonly version: typeof METRIC_SAMPLING_POLICY_VERSION
  readonly everyTicks: number
  readonly offsetTicks: number
}

export interface LineageMetricSample {
  readonly lineageId: string
  readonly genotypeId: string
  readonly biomass: number
  readonly fraction: number
}

export interface GenotypeMetricSample {
  readonly genotypeId: string
  readonly biomass: number
  readonly fraction: number
}

export interface AuthoritativeMetricSample {
  readonly schemaVersion: typeof AUTHORITATIVE_METRIC_SCHEMA_VERSION
  readonly samplingPolicy: MetricSamplingPolicy
  readonly identity: RunIdentity
  readonly tick: number
  readonly simulationTimeHours: number
  readonly totalBiomass: number
  readonly totalResource: number
  readonly occupiedCells: number
  readonly lineageShannonDiversity: number
  readonly resistantBiomass: number
  readonly resistantFraction: number
  readonly lineages: readonly LineageMetricSample[]
  readonly genotypes: readonly GenotypeMetricSample[]
}

function finiteNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be finite and non-negative`)
  }
}

function canonicalText(name: string, value: string): void {
  if (value.length === 0 || value !== value.trim()) {
    throw new Error(`${name} must be a canonical non-empty string`)
  }
}

export function validateMetricSamplingPolicy(
  policy: MetricSamplingPolicy,
): void {
  if (policy.version !== METRIC_SAMPLING_POLICY_VERSION) {
    throw new Error(`unsupported metric sampling policy version: ${policy.version}`)
  }
  if (!Number.isSafeInteger(policy.everyTicks) || policy.everyTicks <= 0) {
    throw new Error('metric everyTicks must be a positive safe integer')
  }
  if (
    !Number.isSafeInteger(policy.offsetTicks) ||
    policy.offsetTicks < 0 ||
    policy.offsetTicks >= policy.everyTicks
  ) {
    throw new Error('metric offsetTicks must be a safe integer in [0, everyTicks)')
  }
}

export function shouldSampleAuthoritativeMetrics(
  tick: number,
  policy: MetricSamplingPolicy,
): boolean {
  validateMetricSamplingPolicy(policy)
  if (!Number.isSafeInteger(tick) || tick < 0) {
    throw new Error('metric tick must be a non-negative safe integer')
  }
  return tick >= policy.offsetTicks && (tick - policy.offsetTicks) % policy.everyTicks === 0
}

export function extractAuthoritativeMetricSample(args: {
  readonly checkpoint: ComposedSimulationCheckpoint
  readonly samplingPolicy: MetricSamplingPolicy
  readonly resistantGenotypeIds: readonly string[]
}): AuthoritativeMetricSample {
  validateMetricSamplingPolicy(args.samplingPolicy)
  const { checkpoint } = args
  if (!Number.isSafeInteger(checkpoint.tick) || checkpoint.tick < 0) {
    throw new Error('checkpoint tick must be a non-negative safe integer')
  }
  finiteNonNegative('checkpoint simulationTimeHours', checkpoint.simulationTimeHours)
  finiteNonNegative('checkpoint totalBiomass', checkpoint.metrics.totalBiomass)
  finiteNonNegative('checkpoint totalResource', checkpoint.metrics.totalResource)
  if (!Number.isSafeInteger(checkpoint.metrics.occupiedCells) || checkpoint.metrics.occupiedCells < 0) {
    throw new Error('checkpoint occupiedCells must be a non-negative safe integer')
  }

  const state = checkpoint.composedState
  if (
    state.lineageIds.length !== state.genotypeIds.length ||
    state.lineageIds.length !== state.lineageBiomass.length
  ) {
    throw new Error('composed metric identity channels must stay aligned')
  }

  const resistantIds = new Set<string>()
  for (let index = 0; index < args.resistantGenotypeIds.length; index += 1) {
    if (!(index in args.resistantGenotypeIds)) {
      throw new Error('resistant genotype ids must be a dense array')
    }
    const id = args.resistantGenotypeIds[index]!
    canonicalText(`resistant genotype id at index ${index}`, id)
    if (resistantIds.has(id)) {
      throw new Error(`duplicate resistant genotype id: ${id}`)
    }
    resistantIds.add(id)
  }

  const knownGenotypes = new Set(state.genotypeIds)
  for (const id of resistantIds) {
    if (!knownGenotypes.has(id)) {
      throw new Error(`resistant genotype id is not present in composed state: ${id}`)
    }
  }

  const metricKeys = Object.keys(checkpoint.metrics.lineageBiomass)
  const expectedKeys = [...state.lineageIds]
  if (
    metricKeys.length !== expectedKeys.length ||
    expectedKeys.some((id) => !Object.prototype.hasOwnProperty.call(checkpoint.metrics.lineageBiomass, id))
  ) {
    throw new Error('checkpoint lineage metrics do not match composed lineage identity')
  }

  const total = checkpoint.metrics.totalBiomass
  const genotypeTotals = new Map<string, number>()
  const lineages: LineageMetricSample[] = []
  let resistantBiomass = 0
  let shannon = 0

  for (let index = 0; index < state.lineageIds.length; index += 1) {
    const lineageId = state.lineageIds[index]!
    const genotypeId = state.genotypeIds[index]!
    canonicalText(`lineage id at index ${index}`, lineageId)
    canonicalText(`genotype id at index ${index}`, genotypeId)

    const biomass = checkpoint.metrics.lineageBiomass[lineageId]!
    finiteNonNegative(`lineage biomass for ${lineageId}`, biomass)
    const fraction = total === 0 ? 0 : biomass / total
    if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1 + 1e-12) {
      throw new Error(`lineage fraction for ${lineageId} became invalid`)
    }
    const boundedFraction = Math.min(1, fraction)
    if (boundedFraction > 0) shannon -= boundedFraction * Math.log(boundedFraction)

    genotypeTotals.set(genotypeId, (genotypeTotals.get(genotypeId) ?? 0) + biomass)
    if (resistantIds.has(genotypeId)) resistantBiomass += biomass
    lineages.push({ lineageId, genotypeId, biomass, fraction: boundedFraction })
  }

  const lineageTotal = lineages.reduce((sum, item) => sum + item.biomass, 0)
  const tolerance = 1e-12 * Math.max(1, Math.abs(total), Math.abs(lineageTotal))
  if (Math.abs(lineageTotal - total) > tolerance) {
    throw new Error('lineage biomass metrics do not sum to totalBiomass')
  }

  const genotypes = [...genotypeTotals.entries()].map(([genotypeId, biomass]) => ({
    genotypeId,
    biomass,
    fraction: total === 0 ? 0 : Math.min(1, biomass / total),
  }))

  const resistantFraction = total === 0 ? 0 : resistantBiomass / total
  if (!Number.isFinite(resistantFraction) || resistantFraction < 0 || resistantFraction > 1 + 1e-12) {
    throw new Error('resistant fraction became invalid')
  }

  return {
    schemaVersion: AUTHORITATIVE_METRIC_SCHEMA_VERSION,
    samplingPolicy: { ...args.samplingPolicy },
    identity: structuredClone(checkpoint.identity),
    tick: checkpoint.tick,
    simulationTimeHours: checkpoint.simulationTimeHours,
    totalBiomass: total,
    totalResource: checkpoint.metrics.totalResource,
    occupiedCells: checkpoint.metrics.occupiedCells,
    lineageShannonDiversity: shannon,
    resistantBiomass,
    resistantFraction: Math.min(1, resistantFraction),
    lineages,
    genotypes,
  }
}
