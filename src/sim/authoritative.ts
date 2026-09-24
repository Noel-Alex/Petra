import { assertEcologyLocalCapacity } from './ecology/capacity'
import { stepEcology } from './ecology/growth'
import type {
  EcologyState,
  GrowthParameters,
  LineageEcologyParameters,
} from './ecology/growth'
import type { CuratedMutationGraph } from './evolution/graph'
import {
  bindLineageFitness,
  type EvolutionScenarioIdentity,
} from './evolution/fitness'
import {
  samplingExecutionPolicyIdentity,
  type SamplingExecutionPolicy,
} from './samplingPolicy'
import {
  advanceDiscretePopulationAuthority,
  cloneDiscretePopulationAuthorityState,
  createDiscretePopulationAuthorityState,
  discretePopulationConfigurationIdentity,
  restoreDiscretePopulationAuthorityState,
  type CellEquivalentCalibration,
  type DiscretePopulationAuthorityConfig,
  type DiscretePopulationAuthorityState,
  type DiscretePopulationPolicy,
} from './populationAuthority'
import { requireFiniteNonNegativeFloat32 } from './spatial/field'
import {
  CIPROFLOXACIN_RESOURCE_COMPOSITION_POLICY,
  composeSpatialCiprofloxacinLoss,
} from './pharmacodynamics/composition'
import {
  validateRegoesParameters,
  type RegoesPharmacodynamics,
} from './pharmacodynamics/ciprofloxacin'

/** Versioned serializable composition boundary. Biological values are caller supplied. */
export const COMPOSED_STATE_VERSION = 4 as const

export interface ComposedLineageConfig {
  readonly id: string
  readonly genotypeId: string
  readonly deathHazardPerHour: number
}

export interface ComposedGenotypeCiprofloxacinMic {
  readonly genotypeId: string
  readonly micMgPerL: number
}

export interface ComposedCiprofloxacinConfig {
  readonly policyId: typeof CIPROFLOXACIN_RESOURCE_COMPOSITION_POLICY.id
  readonly concentrationUnit: 'mg/L'
  readonly referencePharmacodynamics: Readonly<RegoesPharmacodynamics>
  readonly referenceMicMgPerL: number
  readonly genotypeMicMgPerL: readonly ComposedGenotypeCiprofloxacinMic[]
}

export interface ComposedDiscretePopulationConfig {
  readonly calibration: Readonly<CellEquivalentCalibration>
  readonly policy: Readonly<DiscretePopulationPolicy>
}

export interface ComposedSimulationConfig {
  readonly width: number
  readonly height: number
  readonly mask: readonly number[]
  readonly initialResource: readonly number[]
  /**
   * Replay-critical initial ciprofloxacin landscape for this run, in mg/L.
   * The mutable current landscape is checkpoint state.
   */
  readonly ciprofloxacinConcentrationMgPerL: readonly number[]
  readonly initialLineageBiomass: readonly (readonly number[])[]
  readonly growth: Readonly<GrowthParameters>
  readonly lineages: readonly ComposedLineageConfig[]
  readonly evolutionGraph: CuratedMutationGraph
  readonly evolutionScenario: EvolutionScenarioIdentity
  /** Explicit null means this run has no ciprofloxacin PD authority. */
  readonly ciprofloxacin: ComposedCiprofloxacinConfig | null
  readonly samplingExecutionPolicy: SamplingExecutionPolicy | null
  /**
   * Explicit opt-in shared discrete host/division authority.
   * Null is the only no-calibration/default state; Petra never invents a
   * biomass↔cell-equivalent conversion.
   */
  readonly populationAuthority: ComposedDiscretePopulationConfig | null
  readonly hoursPerTick: number
}

export interface ComposedSimulationState {
  readonly version: typeof COMPOSED_STATE_VERSION
  readonly configurationFingerprint: string
  readonly width: number
  readonly height: number
  readonly mask: number[]
  readonly lineageIds: string[]
  readonly genotypeIds: string[]
  resource: number[]
  ciprofloxacinConcentrationMgPerL: number[]
  lineageBiomass: number[][]
  discretePopulation: DiscretePopulationAuthorityState | null
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

export interface ComposedStepResult {
  readonly metrics: ComposedMetrics
  /**
   * Per-lineage/per-cell safe-integer division opportunities for this exact
   * ecology step, or null when no population calibration is enabled.
   */
  readonly divisionOpportunities: readonly (readonly number[])[] | null
  readonly totalDivisionOpportunities: number | null
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

function canonicalIdentity(name: string, value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(name + ' must be a non-empty string')
  }
  if (value !== value.trim()) {
    throw new Error(name + ' must be canonical with no surrounding whitespace')
  }
}

function validateMaskedDomain(
  name: string,
  mask: readonly number[],
  resource: readonly number[],
  lineageBiomass: readonly (readonly number[])[],
): void {
  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index] !== 0) continue

    if (resource[index] !== 0) {
      throw new Error(
        name + ' resource must be zero outside composed mask at cell ' + index,
      )
    }

    for (
      let lineageIndex = 0;
      lineageIndex < lineageBiomass.length;
      lineageIndex += 1
    ) {
      if (lineageBiomass[lineageIndex]![index] !== 0) {
        throw new Error(
          name +
            ' lineage biomass must be zero outside composed mask at cell ' +
            index,
        )
      }
    }
  }
}

function validateLocalCapacityDomain(
  name: string,
  mask: readonly number[],
  lineageBiomass: readonly (readonly number[])[],
  localCapacity: number,
): void {
  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index] !== 1) continue

    let totalBiomass = 0
    for (const channel of lineageBiomass) {
      totalBiomass += channel[index]!
    }

    try {
      assertEcologyLocalCapacity(
        totalBiomass,
        localCapacity,
        lineageBiomass.length,
        index,
      )
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`${name}: ${error.message}`)
      }
      throw error
    }
  }
}

function sumInMask(
  values: readonly number[],
  mask: readonly number[],
): number {
  let total = 0
  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index] === 1) total += values[index]!
  }
  return total
}

function lineageFitness(config: ComposedSimulationConfig) {
  return bindLineageFitness(
    config.evolutionGraph,
    config.evolutionScenario,
    config.lineages.map((lineage) => ({
      lineageId: lineage.id,
      genotypeId: lineage.genotypeId,
    })),
  )
}

function composedSamplingPolicyIdentity(
  policy: SamplingExecutionPolicy | null | undefined,
): string | null {
  if (policy === undefined) {
    throw new Error(
      'sampling execution policy must be explicit null or a valid policy',
    )
  }
  return policy === null ? null : samplingExecutionPolicyIdentity(policy)
}

function composedCiprofloxacinIdentity(
  authority: ComposedCiprofloxacinConfig | null | undefined,
): ComposedCiprofloxacinConfig | null {
  if (authority === undefined) {
    throw new Error(
      'ciprofloxacin authority must be explicit null or a valid authority',
    )
  }
  if (authority === null) return null
  if (
    authority.policyId !== CIPROFLOXACIN_RESOURCE_COMPOSITION_POLICY.id
  ) {
    throw new Error('unsupported composed ciprofloxacin composition policy')
  }
  if (authority.concentrationUnit !== 'mg/L') {
    throw new Error('composed ciprofloxacin concentration unit must be mg/L')
  }

  validateRegoesParameters(authority.referencePharmacodynamics)
  positiveFinite(
    'ciprofloxacin.referenceMicMgPerL',
    authority.referenceMicMgPerL,
  )
  if (
    !Array.isArray(authority.genotypeMicMgPerL) ||
    authority.genotypeMicMgPerL.length === 0
  ) {
    throw new Error('ciprofloxacin genotype MIC table must be a non-empty array')
  }

  const genotypeIds = new Set<string>()
  const genotypeMicMgPerL = authority.genotypeMicMgPerL.map((entry, index) => {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(
        'ciprofloxacin genotype MIC entry at index ' + index + ' must be an object',
      )
    }
    canonicalIdentity(
      'ciprofloxacin genotype id at index ' + index,
      entry.genotypeId,
    )
    if (genotypeIds.has(entry.genotypeId)) {
      throw new Error('ciprofloxacin genotype MIC ids must be unique')
    }
    genotypeIds.add(entry.genotypeId)
    positiveFinite(
      'ciprofloxacin MIC for ' + entry.genotypeId,
      entry.micMgPerL,
    )
    return {
      genotypeId: entry.genotypeId,
      micMgPerL: entry.micMgPerL,
    }
  })

  return {
    policyId: authority.policyId,
    concentrationUnit: 'mg/L',
    referencePharmacodynamics: {
      psiMaxLog10PerHour:
        authority.referencePharmacodynamics.psiMaxLog10PerHour,
      psiMinLog10PerHour:
        authority.referencePharmacodynamics.psiMinLog10PerHour,
      zMic: authority.referencePharmacodynamics.zMic,
      kappa: authority.referencePharmacodynamics.kappa,
    },
    referenceMicMgPerL: authority.referenceMicMgPerL,
    genotypeMicMgPerL,
  }
}

function composedDiscretePopulationAuthorityConfig(
  config: ComposedSimulationConfig,
): DiscretePopulationAuthorityConfig | null {
  if (config.populationAuthority === undefined) {
    throw new Error(
      'composed populationAuthority must be explicit config or explicit null',
    )
  }
  if (config.populationAuthority === null) return null
  return {
    width: config.width,
    height: config.height,
    mask: config.mask,
    lineageIds: config.lineages.map((lineage) => lineage.id),
    calibration: config.populationAuthority.calibration,
    policy: config.populationAuthority.policy,
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
    config.initialResource.length !== cellCount ||
    config.ciprofloxacinConcentrationMgPerL.length !== cellCount
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

  config.lineages.forEach((lineage, index) => {
    canonicalIdentity('lineage id at index ' + index, lineage.id)
    canonicalIdentity('genotype id at index ' + index, lineage.genotypeId)
  })
  canonicalIdentity('evolution scenario id', config.evolutionScenario.scenarioId)
  canonicalIdentity(
    'evolution scenario version',
    config.evolutionScenario.scenarioVersion,
  )

  const lineageIds = config.lineages.map((lineage) => lineage.id)
  if (new Set(lineageIds).size !== lineageIds.length) {
    throw new Error('lineage ids must be unique')
  }

  // Strict scenario/genotype validation boundary. Relative fitness is owned by
  // the curated evolution graph and cannot be re-entered by composition callers.
  lineageFitness(config)
  const ciprofloxacin = composedCiprofloxacinIdentity(config.ciprofloxacin)
  composedSamplingPolicyIdentity(config.samplingExecutionPolicy)
  const populationAuthority = composedDiscretePopulationAuthorityConfig(config)
  if (populationAuthority !== null) {
    discretePopulationConfigurationIdentity(populationAuthority)
  }

  const knownGenotypes = new Set(
    config.evolutionGraph.genotypes.map((genotype) => genotype.id),
  )
  if (ciprofloxacin !== null) {
    const micByGenotype = new Map(
      ciprofloxacin.genotypeMicMgPerL.map((entry) => [
        entry.genotypeId,
        entry.micMgPerL,
      ] as const),
    )
    for (const entry of ciprofloxacin.genotypeMicMgPerL) {
      if (!knownGenotypes.has(entry.genotypeId)) {
        throw new Error(
          'ciprofloxacin MIC table references unknown genotype ' +
            entry.genotypeId,
        )
      }
    }
    for (const lineage of config.lineages) {
      if (!micByGenotype.has(lineage.genotypeId)) {
        throw new Error(
          'ciprofloxacin MIC table is missing active genotype ' +
            lineage.genotypeId,
        )
      }
    }
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
  config.ciprofloxacinConcentrationMgPerL.forEach((value, index) => {
    finiteNonNegative('ciprofloxacinConcentrationMgPerL', value)
    if (config.mask[index] === 0 && value !== 0) {
      throw new Error(
        'ciprofloxacin concentration must be zero outside composed mask at cell ' +
          index,
      )
    }
    if (ciprofloxacin === null && value !== 0) {
      throw new Error(
        'non-zero ciprofloxacin concentration requires explicit PD authority',
      )
    }
  })
  config.initialLineageBiomass.forEach((channel) =>
    channel.forEach((value) =>
      finiteNonNegative('initialLineageBiomass', value),
    ),
  )
  validateMaskedDomain(
    'initial composed state',
    config.mask,
    config.initialResource,
    config.initialLineageBiomass,
  )
  validateLocalCapacityDomain(
    'initial composed state',
    config.mask,
    config.initialLineageBiomass,
    config.growth.localCapacity,
  )
  config.lineages.forEach((lineage) => {
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
 * while continuing one composed state. Mutable resource/biomass/drug fields are
 * checkpoint state after initialization. The initial ciprofloxacin landscape
 * remains fingerprinted so genesis exposure cannot drift silently.
 */
export function composedConfigurationFingerprint(
  config: ComposedSimulationConfig,
): string {
  validateConfig(config)
  const fitness = lineageFitness(config)
  return JSON.stringify({
    width: config.width,
    height: config.height,
    mask: Array.from(config.mask),
    ciprofloxacinConcentrationMgPerL:
      config.ciprofloxacinConcentrationMgPerL.map((value) =>
        requireFiniteNonNegativeFloat32(
          'initial ciprofloxacin concentration',
          value,
        ),
      ),
    ciprofloxacin: composedCiprofloxacinIdentity(config.ciprofloxacin),
    growth: {
      maxDivisionRate: config.growth.maxDivisionRate,
      halfSaturation: config.growth.halfSaturation,
      biomassYield: config.growth.biomassYield,
      localCapacity: config.growth.localCapacity,
      spreadRate: config.growth.spreadRate,
    },
    evolutionScenario: {
      scenarioId: config.evolutionScenario.scenarioId,
      scenarioVersion: config.evolutionScenario.scenarioVersion,
    },
    samplingExecutionPolicy: composedSamplingPolicyIdentity(
      config.samplingExecutionPolicy,
    ),
    populationAuthority:
      config.populationAuthority === null
        ? null
        : discretePopulationConfigurationIdentity(
            composedDiscretePopulationAuthorityConfig(config)!,
          ),
    lineages: config.lineages.map((lineage, index) => ({
      id: lineage.id,
      genotypeId: lineage.genotypeId,
      relativeFitness: fitness[index]!.relativeFitness,
      deathHazardPerHour: lineage.deathHazardPerHour,
    })),
    hoursPerTick: config.hoursPerTick,
  })
}

export function createComposedState(
  config: ComposedSimulationConfig,
): ComposedSimulationState {
  const configurationFingerprint = composedConfigurationFingerprint(config)
  const lineageBiomass = config.initialLineageBiomass.map((channel) =>
    Array.from(channel),
  )
  const populationConfig = composedDiscretePopulationAuthorityConfig(config)
  return {
    version: COMPOSED_STATE_VERSION,
    configurationFingerprint,
    width: config.width,
    height: config.height,
    mask: Array.from(config.mask),
    lineageIds: config.lineages.map((lineage) => lineage.id),
    genotypeIds: config.lineages.map((lineage) => lineage.genotypeId),
    resource: Array.from(config.initialResource),
    ciprofloxacinConcentrationMgPerL:
      config.ciprofloxacinConcentrationMgPerL.map((value) =>
        requireFiniteNonNegativeFloat32(
          'initial ciprofloxacin concentration',
          value,
        ),
      ),
    lineageBiomass,
    discretePopulation:
      populationConfig === null
        ? null
        : createDiscretePopulationAuthorityState(
            populationConfig,
            lineageBiomass,
          ),
  }
}

/**
 * Single scientific-state validation authority for a composed state/config pair.
 *
 * This owns replay-critical scientific invariants shared by direct continuation
 * and checkpoint restore. Run identity, tick/time, command counters, events and
 * aggregate checkpoint metrics remain transport/runtime concerns.
 */
export function validateComposedStateAgainstConfig(
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
  if (
    state.mask.length !== cellCount ||
    state.resource.length !== cellCount ||
    state.ciprofloxacinConcentrationMgPerL.length !== cellCount
  ) {
    throw new Error('composed state fields do not match grid dimensions')
  }
  if (state.mask.some((value) => value !== 0 && value !== 1)) {
    throw new Error('composed state mask values must be exactly 0 or 1')
  }
  if (state.mask.some((value, index) => value !== config.mask[index])) {
    throw new Error('composed state mask does not match configuration')
  }

  if (!Array.isArray(state.lineageIds) || !Array.isArray(state.genotypeIds)) {
    throw new Error('composed state identity channels must be arrays')
  }
  if (
    state.lineageIds.length !== config.lineages.length ||
    state.genotypeIds.length !== config.lineages.length ||
    state.lineageBiomass.length !== config.lineages.length
  ) {
    throw new Error('composed state lineage channels do not match configuration')
  }
  state.lineageIds.forEach((id, index) => {
    canonicalIdentity('composed state lineage id at index ' + index, id)
    canonicalIdentity(
      'composed state genotype id at index ' + index,
      state.genotypeIds[index],
    )
    if (id !== config.lineages[index]?.id) {
      throw new Error('composed state lineage order does not match configuration')
    }
    if (state.genotypeIds[index] !== config.lineages[index]?.genotypeId) {
      throw new Error('composed state genotype order does not match configuration')
    }
  })
  if (state.lineageBiomass.some((channel) => channel.length !== cellCount)) {
    throw new Error('composed state lineage arrays must match grid dimensions')
  }

  state.resource.forEach((value) =>
    finiteNonNegative('state.resource', value),
  )
  state.ciprofloxacinConcentrationMgPerL.forEach((value, index) => {
    finiteNonNegative('state.ciprofloxacinConcentrationMgPerL', value)
    const stored = requireFiniteNonNegativeFloat32(
      'state.ciprofloxacinConcentrationMgPerL',
      value,
    )
    if (!Object.is(value, stored)) {
      throw new Error(
        'state ciprofloxacin concentration must be canonical Float32 at cell ' +
          index,
      )
    }
    if (state.mask[index] === 0 && value !== 0) {
      throw new Error(
        'state ciprofloxacin concentration must be zero outside composed mask at cell ' +
          index,
      )
    }
    if (config.ciprofloxacin === null && value !== 0) {
      throw new Error(
        'non-zero state ciprofloxacin concentration requires explicit PD authority',
      )
    }
  })
  state.lineageBiomass.forEach((channel) =>
    channel.forEach((value) =>
      finiteNonNegative('state.lineageBiomass', value),
    ),
  )
  validateMaskedDomain(
    'composed state',
    state.mask,
    state.resource,
    state.lineageBiomass,
  )
  validateLocalCapacityDomain(
    'composed state',
    state.mask,
    state.lineageBiomass,
    config.growth.localCapacity,
  )

  const populationConfig = composedDiscretePopulationAuthorityConfig(config)
  if (populationConfig === null) {
    if (state.discretePopulation !== null) {
      throw new Error(
        'composed discrete population state requires explicit population authority configuration',
      )
    }
  } else {
    if (state.discretePopulation === null) {
      throw new Error(
        'composed population authority configuration requires checkpoint state',
      )
    }
    // This validates both the population config identity/container domain and
    // standing host/residual consistency against the exact committed biomass.
    restoreDiscretePopulationAuthorityState(
      state.discretePopulation,
      populationConfig,
      state.lineageBiomass,
    )
  }
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

interface PreparedComposedLineageParameters {
  readonly configurationFingerprint: string
  readonly lineageParameters: readonly LineageEcologyParameters[]
}

const preparedLineageParameterCache =
  new WeakMap<readonly number[], PreparedComposedLineageParameters>()

function preparedLineageParameters(
  state: ComposedSimulationState,
  config: ComposedSimulationConfig,
): readonly LineageEcologyParameters[] {
  const concentration = state.ciprofloxacinConcentrationMgPerL
  const cached = preparedLineageParameterCache.get(concentration)
  if (
    cached?.configurationFingerprint === state.configurationFingerprint
  ) {
    return cached.lineageParameters
  }

  const fitness = lineageFitness(config)
  const ciprofloxacin = composedCiprofloxacinIdentity(config.ciprofloxacin)
  const hasDrugExposure =
    ciprofloxacin !== null &&
    concentration.some((value) => value !== 0)

  let drugHazardByGenotype: ReadonlyMap<string, Float64Array> | null = null
  if (ciprofloxacin !== null && hasDrugExposure) {
    const micByGenotype = new Map(
      ciprofloxacin.genotypeMicMgPerL.map((entry) => [
        entry.genotypeId,
        entry.micMgPerL,
      ] as const),
    )
    const activeGenotypes = [...new Set(
      config.lineages.map((lineage) => lineage.genotypeId),
    )].map((genotypeId) => ({
      genotypeId,
      genotypeMic: micByGenotype.get(genotypeId)!,
    }))
    const composed = composeSpatialCiprofloxacinLoss(
      Float32Array.from(concentration),
      Uint8Array.from(state.mask),
      ciprofloxacin.referencePharmacodynamics,
      ciprofloxacin.referenceMicMgPerL,
      activeGenotypes,
    )
    drugHazardByGenotype = new Map(
      composed.fields.map((field) => [
        field.genotypeId,
        field.deathHazardPerHour,
      ] as const),
    )
  }

  const lineageParameters: LineageEcologyParameters[] = config.lineages.map(
    (lineage, index) => {
      if (drugHazardByGenotype === null) {
        return {
          relativeFitness: fitness[index]!.relativeFitness,
          deathHazardPerTime: lineage.deathHazardPerHour,
        }
      }

      const drugHazard = drugHazardByGenotype.get(lineage.genotypeId)
      if (drugHazard === undefined) {
        throw new Error(
          'missing composed ciprofloxacin hazard for genotype ' +
            lineage.genotypeId,
        )
      }
      const combinedHazard = new Float64Array(drugHazard.length)
      for (let cell = 0; cell < drugHazard.length; cell += 1) {
        if (state.mask[cell] !== 1) continue
        const value = lineage.deathHazardPerHour + drugHazard[cell]!
        if (!Number.isFinite(value) || value < 0) {
          throw new Error('composed lineage death hazard became invalid')
        }
        combinedHazard[cell] = value
      }
      return {
        relativeFitness: fitness[index]!.relativeFitness,
        deathHazardPerTime: combinedHazard,
      }
    },
  )

  preparedLineageParameterCache.set(concentration, {
    configurationFingerprint: state.configurationFingerprint,
    lineageParameters,
  })
  return lineageParameters
}

export function stepComposedStateDetailed(
  state: ComposedSimulationState,
  config: ComposedSimulationConfig,
): ComposedStepResult {
  validateComposedStateAgainstConfig(state, config)

  const ecology = asEcologyState(state)
  const lineageParameters = preparedLineageParameters(state, config)
  const result = stepEcology(
    ecology,
    config.growth,
    lineageParameters,
    config.hoursPerTick,
  )

  const nextResource = Array.from(ecology.resource)
  const nextLineageBiomass = ecology.lineages.map((channel) =>
    Array.from(channel),
  )

  const populationConfig = composedDiscretePopulationAuthorityConfig(config)
  let nextDiscretePopulation: DiscretePopulationAuthorityState | null = null
  let divisionOpportunities: readonly (readonly number[])[] | null = null
  let totalDivisionOpportunities: number | null = null

  if (populationConfig !== null) {
    if (state.discretePopulation === null) {
      throw new Error(
        'composed population authority configuration requires checkpoint state',
      )
    }
    const populationAdvance = advanceDiscretePopulationAuthority(
      state.discretePopulation,
      populationConfig,
      {
        currentLineageBiomass: nextLineageBiomass,
        divisionBiomass: result.fluxes.divisionBiomass,
      },
    )
    nextDiscretePopulation = populationAdvance.state
    divisionOpportunities = populationAdvance.divisionOpportunities.map(
      (channel) => Array.from(channel),
    )
    totalDivisionOpportunities =
      populationAdvance.totalDivisionOpportunities
  }

  // Publish the continuous ecology and discrete authority together only after
  // every downstream validation/advance has succeeded. A refusal is therefore
  // an exact composed-state no-op for direct callers as well as engine commands.
  state.resource = nextResource
  state.lineageBiomass = nextLineageBiomass
  state.discretePopulation = nextDiscretePopulation

  const lineageBiomass: Record<string, number> = {}
  config.lineages.forEach((lineage, index) => {
    lineageBiomass[lineage.id] = sumInMask(
      state.lineageBiomass[index]!,
      state.mask,
    )
  })

  return {
    metrics: {
      totalBiomass: result.metrics.totalBiomass,
      totalResource: sumInMask(state.resource, state.mask),
      occupiedCells: result.metrics.occupiedCells,
      lineageBiomass,
      divisionBiomass: result.metrics.divisionBiomass,
      deathBiomass: result.metrics.deathBiomass,
      resourceConsumed: result.metrics.resourceConsumed,
    },
    divisionOpportunities,
    totalDivisionOpportunities,
  }
}

export function stepComposedState(
  state: ComposedSimulationState,
  config: ComposedSimulationConfig,
): ComposedMetrics {
  return stepComposedStateDetailed(state, config).metrics
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
    genotypeIds: [...state.genotypeIds],
    resource: [...state.resource],
    ciprofloxacinConcentrationMgPerL: [
      ...state.ciprofloxacinConcentrationMgPerL,
    ],
    lineageBiomass: state.lineageBiomass.map((channel) => [...channel]),
    discretePopulation:
      state.discretePopulation === null
        ? null
        : cloneDiscretePopulationAuthorityState(state.discretePopulation),
  }
}
