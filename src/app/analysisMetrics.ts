import { sameComposedParameterSetBinding } from '../sim/parameterSetBinding'
import {
  AUTHORITATIVE_METRIC_SCHEMA_VERSION,
  METRIC_SAMPLING_POLICY_VERSION,
  validateMetricSamplingPolicy,
  type AuthoritativeMetricSample,
} from '../sim/metrics'
import type { RunIdentity } from '../sim/protocol'
import type { ScientificSeriesInput } from '../ui/analysis/model'

export const AUTHORITATIVE_ANALYSIS_SERIES_SCHEMA_VERSION = 1 as const

export interface AnalysisSeriesStyle {
  readonly appearanceToken: string
  readonly patternToken: string
}

export interface GenotypeAnalysisSeriesDescriptor extends AnalysisSeriesStyle {
  readonly genotypeId: string
  readonly label: string
}

export interface AuthoritativeMetricSeriesConfig {
  readonly biomassUnit: string
  readonly resourceUnit: string
  readonly fractionUnit: string
  readonly diversityUnit: string
  readonly totalBiomassStyle: AnalysisSeriesStyle
  readonly totalResourceStyle: AnalysisSeriesStyle
  readonly resistantFractionStyle: AnalysisSeriesStyle
  readonly lineageDiversityStyle: AnalysisSeriesStyle
  readonly genotypes: readonly GenotypeAnalysisSeriesDescriptor[]
}

export interface AuthoritativeAnalysisSeriesBundle {
  readonly schemaVersion: typeof AUTHORITATIVE_ANALYSIS_SERIES_SCHEMA_VERSION
  readonly identity: RunIdentity
  readonly firstTick: number
  readonly lastTick: number
  readonly firstSimulationTimeHours: number
  readonly lastSimulationTimeHours: number
  readonly totalBiomass: ScientificSeriesInput
  readonly totalResource: ScientificSeriesInput
  readonly resistantFraction: ScientificSeriesInput
  readonly lineageDiversity: ScientificSeriesInput
  readonly genotypeFractions: readonly ScientificSeriesInput[]
}

function canonicalText(name: string, value: string): void {
  if (value.length === 0 || value !== value.trim()) {
    throw new Error(`${name} must be a canonical non-empty string`)
  }
}

function sameRunIdentity(left: RunIdentity, right: RunIdentity): boolean {
  return (
    left.engineVersion === right.engineVersion &&
    left.protocolVersion === right.protocolVersion &&
    left.scenarioId === right.scenarioId &&
    left.scenarioVersion === right.scenarioVersion &&
    left.parameterSetId === right.parameterSetId &&
    left.parameterSetVersion === right.parameterSetVersion &&
    sameComposedParameterSetBinding(
      left.parameterSetBinding,
      right.parameterSetBinding,
    ) &&
    left.seed === right.seed
  )
}

function metricTolerance(...values: readonly number[]): number {
  return 1e-12 * Math.max(1, ...values.map((value) => Math.abs(value)))
}

function approximatelyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= metricTolerance(left, right)
}

function finiteNonNegativeMetric(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be finite and non-negative`)
  }
}

function metricFraction(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${name} must be finite and in [0, 1]`)
  }
}

function validateMetricSampleContents(
  sample: AuthoritativeMetricSample,
  sampleIndex: number,
): void {
  const prefix = `metric sample ${sampleIndex}`
  finiteNonNegativeMetric(`${prefix} totalBiomass`, sample.totalBiomass)
  finiteNonNegativeMetric(`${prefix} totalResource`, sample.totalResource)
  finiteNonNegativeMetric(
    `${prefix} lineageShannonDiversity`,
    sample.lineageShannonDiversity,
  )
  finiteNonNegativeMetric(
    `${prefix} resistantBiomass`,
    sample.resistantBiomass,
  )
  metricFraction(`${prefix} resistantFraction`, sample.resistantFraction)

  if (!Number.isSafeInteger(sample.occupiedCells) || sample.occupiedCells < 0) {
    throw new Error(`${prefix} occupiedCells must be a non-negative safe integer`)
  }

  if (
    sample.resistantBiomass >
    sample.totalBiomass + metricTolerance(sample.totalBiomass, sample.resistantBiomass)
  ) {
    throw new Error(`${prefix} resistantBiomass cannot exceed totalBiomass`)
  }
  const expectedResistantFraction =
    sample.totalBiomass === 0
      ? 0
      : sample.resistantBiomass / sample.totalBiomass
  if (!approximatelyEqual(sample.resistantFraction, expectedResistantFraction)) {
    throw new Error(`${prefix} resistant fraction is inconsistent with biomass`)
  }

  if (!Array.isArray(sample.lineages)) {
    throw new Error(`${prefix} lineages must be an array`)
  }
  const lineageIds = new Set<string>()
  const lineageBiomassByGenotype = new Map<string, number>()
  let lineageTotal = 0
  for (let index = 0; index < sample.lineages.length; index += 1) {
    if (!(index in sample.lineages)) {
      throw new Error(`${prefix} lineage rows must be dense`)
    }
    const lineage = sample.lineages[index]!
    canonicalText(`${prefix} lineage ${index} id`, lineage.lineageId)
    canonicalText(
      `${prefix} lineage ${lineage.lineageId} genotype id`,
      lineage.genotypeId,
    )
    if (lineageIds.has(lineage.lineageId)) {
      throw new Error(`${prefix} has duplicate lineage id: ${lineage.lineageId}`)
    }
    lineageIds.add(lineage.lineageId)
    finiteNonNegativeMetric(
      `${prefix} lineage ${lineage.lineageId} biomass`,
      lineage.biomass,
    )
    metricFraction(
      `${prefix} lineage ${lineage.lineageId} fraction`,
      lineage.fraction,
    )
    const expectedFraction =
      sample.totalBiomass === 0 ? 0 : lineage.biomass / sample.totalBiomass
    if (!approximatelyEqual(lineage.fraction, expectedFraction)) {
      throw new Error(
        `${prefix} lineage ${lineage.lineageId} fraction is inconsistent with biomass`,
      )
    }
    lineageTotal += lineage.biomass
    lineageBiomassByGenotype.set(
      lineage.genotypeId,
      (lineageBiomassByGenotype.get(lineage.genotypeId) ?? 0) + lineage.biomass,
    )
  }
  if (!approximatelyEqual(lineageTotal, sample.totalBiomass)) {
    throw new Error(`${prefix} lineage biomass does not sum to totalBiomass`)
  }

  if (!Array.isArray(sample.genotypes)) {
    throw new Error(`${prefix} genotypes must be an array`)
  }
  const genotypeIds = new Set<string>()
  const genotypeBiomassById = new Map<string, number>()
  let genotypeTotal = 0
  for (let index = 0; index < sample.genotypes.length; index += 1) {
    if (!(index in sample.genotypes)) {
      throw new Error(`${prefix} genotype rows must be dense`)
    }
    const genotype = sample.genotypes[index]!
    canonicalText(`${prefix} genotype ${index} id`, genotype.genotypeId)
    if (genotypeIds.has(genotype.genotypeId)) {
      throw new Error(`${prefix} has duplicate genotype id: ${genotype.genotypeId}`)
    }
    genotypeIds.add(genotype.genotypeId)
    finiteNonNegativeMetric(
      `${prefix} genotype ${genotype.genotypeId} biomass`,
      genotype.biomass,
    )
    metricFraction(
      `${prefix} genotype ${genotype.genotypeId} fraction`,
      genotype.fraction,
    )
    const expectedFraction =
      sample.totalBiomass === 0 ? 0 : genotype.biomass / sample.totalBiomass
    if (!approximatelyEqual(genotype.fraction, expectedFraction)) {
      throw new Error(
        `${prefix} genotype ${genotype.genotypeId} fraction is inconsistent with biomass`,
      )
    }
    genotypeTotal += genotype.biomass
    genotypeBiomassById.set(genotype.genotypeId, genotype.biomass)
  }
  if (!approximatelyEqual(genotypeTotal, sample.totalBiomass)) {
    throw new Error(`${prefix} genotype biomass does not sum to totalBiomass`)
  }

  if (
    genotypeBiomassById.size !== lineageBiomassByGenotype.size ||
    [...genotypeBiomassById.entries()].some(([genotypeId, biomass]) => {
      const lineageBiomass = lineageBiomassByGenotype.get(genotypeId)
      return lineageBiomass === undefined || !approximatelyEqual(biomass, lineageBiomass)
    })
  ) {
    throw new Error(`${prefix} genotype biomass does not match lineage identity`)
  }
}

function style(
  id: string,
  label: string,
  unit: string,
  styleValue: AnalysisSeriesStyle,
  points: readonly { readonly timeHours: number; readonly value: number }[],
): ScientificSeriesInput {
  canonicalText(`${id} label`, label)
  canonicalText(`${id} unit`, unit)
  canonicalText(`${id} appearanceToken`, styleValue.appearanceToken)
  canonicalText(`${id} patternToken`, styleValue.patternToken)
  return {
    id,
    label,
    unit,
    appearanceToken: styleValue.appearanceToken,
    patternToken: styleValue.patternToken,
    points,
  }
}

/**
 * Convert one deterministic authoritative metric history into chart-ready
 * scientific source series without changing or smoothing any sampled values.
 *
 * Visual identity tokens and display units remain caller/scenario owned.
 * Missing genotype channels at a recorded sample become exact zero fraction;
 * they are not interpolated between samples.
 */
export function buildAuthoritativeMetricSeries(
  samples: readonly AuthoritativeMetricSample[],
  config: AuthoritativeMetricSeriesConfig,
): AuthoritativeAnalysisSeriesBundle {
  if (!Array.isArray(samples) || samples.length === 0) {
    throw new Error('authoritative analysis series require at least one metric sample')
  }

  canonicalText('biomassUnit', config.biomassUnit)
  canonicalText('resourceUnit', config.resourceUnit)
  canonicalText('fractionUnit', config.fractionUnit)
  canonicalText('diversityUnit', config.diversityUnit)

  const descriptors = new Map<string, GenotypeAnalysisSeriesDescriptor>()
  for (let index = 0; index < config.genotypes.length; index += 1) {
    if (!(index in config.genotypes)) {
      throw new Error('genotype analysis series descriptors must be dense')
    }
    const descriptor = config.genotypes[index]!
    canonicalText(`genotype descriptor ${index} id`, descriptor.genotypeId)
    canonicalText(
      `genotype descriptor ${descriptor.genotypeId} label`,
      descriptor.label,
    )
    canonicalText(
      `genotype descriptor ${descriptor.genotypeId} appearanceToken`,
      descriptor.appearanceToken,
    )
    canonicalText(
      `genotype descriptor ${descriptor.genotypeId} patternToken`,
      descriptor.patternToken,
    )
    if (descriptors.has(descriptor.genotypeId)) {
      throw new Error(
        `duplicate genotype analysis series descriptor: ${descriptor.genotypeId}`,
      )
    }
    descriptors.set(descriptor.genotypeId, descriptor)
  }

  const first = samples[0]!
  if (first.schemaVersion !== AUTHORITATIVE_METRIC_SCHEMA_VERSION) {
    throw new Error('unsupported authoritative metric sample schema version')
  }
  if (first.samplingPolicy.version !== METRIC_SAMPLING_POLICY_VERSION) {
    throw new Error('unsupported authoritative metric sampling policy version')
  }
  validateMetricSamplingPolicy(first.samplingPolicy)

  const identity = first.identity
  let previousTick = -1
  let previousTime = -Infinity
  const genotypeOrder: string[] = []
  const seenGenotypes = new Set<string>()

  for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex += 1) {
    if (!(sampleIndex in samples)) {
      throw new Error('authoritative metric history must be a dense array')
    }
    const sample = samples[sampleIndex]!
    if (sample.schemaVersion !== AUTHORITATIVE_METRIC_SCHEMA_VERSION) {
      throw new Error('metric history mixes schema versions')
    }
    if (
      sample.samplingPolicy.version !== first.samplingPolicy.version ||
      sample.samplingPolicy.everyTicks !== first.samplingPolicy.everyTicks ||
      sample.samplingPolicy.offsetTicks !== first.samplingPolicy.offsetTicks
    ) {
      throw new Error('metric history mixes sampling policies')
    }
    if (!sameRunIdentity(sample.identity, identity)) {
      throw new Error('metric history mixes run identities')
    }
    if (!Number.isSafeInteger(sample.tick) || sample.tick < 0) {
      throw new Error('metric sample tick must be a non-negative safe integer')
    }
    if (!Number.isFinite(sample.simulationTimeHours) || sample.simulationTimeHours < 0) {
      throw new Error('metric sample biological time must be finite and non-negative')
    }
    if (sample.tick <= previousTick) {
      throw new Error('metric history ticks must be strictly increasing')
    }
    if (sample.simulationTimeHours <= previousTime) {
      throw new Error('metric history biological times must be strictly increasing')
    }
    previousTick = sample.tick
    previousTime = sample.simulationTimeHours

    validateMetricSampleContents(sample, sampleIndex)

    for (const genotype of sample.genotypes) {
      canonicalText('metric genotype id', genotype.genotypeId)
      if (!Number.isFinite(genotype.fraction) || genotype.fraction < 0 || genotype.fraction > 1) {
        throw new Error(
          `metric genotype fraction for ${genotype.genotypeId} must be in [0, 1]`,
        )
      }
      if (!seenGenotypes.has(genotype.genotypeId)) {
        seenGenotypes.add(genotype.genotypeId)
        genotypeOrder.push(genotype.genotypeId)
      }
    }
  }

  for (const genotypeId of genotypeOrder) {
    if (!descriptors.has(genotypeId)) {
      throw new Error(
        `missing genotype analysis series descriptor: ${genotypeId}`,
      )
    }
  }

  const scalarPoints = (
    read: (sample: AuthoritativeMetricSample) => number,
  ) =>
    samples.map((sample) => ({
      timeHours: sample.simulationTimeHours,
      value: read(sample),
    }))

  const genotypeFractions = genotypeOrder.map((genotypeId) => {
    const descriptor = descriptors.get(genotypeId)!
    return style(
      `genotype-fraction:${genotypeId}`,
      descriptor.label,
      config.fractionUnit,
      descriptor,
      samples.map((sample) => ({
        timeHours: sample.simulationTimeHours,
        value:
          sample.genotypes.find((item) => item.genotypeId === genotypeId)
            ?.fraction ?? 0,
      })),
    )
  })

  return Object.freeze({
    schemaVersion: AUTHORITATIVE_ANALYSIS_SERIES_SCHEMA_VERSION,
    identity: structuredClone(identity),
    firstTick: first.tick,
    lastTick: samples[samples.length - 1]!.tick,
    firstSimulationTimeHours: first.simulationTimeHours,
    lastSimulationTimeHours: samples[samples.length - 1]!.simulationTimeHours,
    totalBiomass: style(
      'total-biomass',
      'Total biomass',
      config.biomassUnit,
      config.totalBiomassStyle,
      scalarPoints((sample) => sample.totalBiomass),
    ),
    totalResource: style(
      'total-resource',
      'Remaining resource',
      config.resourceUnit,
      config.totalResourceStyle,
      scalarPoints((sample) => sample.totalResource),
    ),
    resistantFraction: style(
      'resistant-fraction',
      'Resistant fraction',
      config.fractionUnit,
      config.resistantFractionStyle,
      scalarPoints((sample) => sample.resistantFraction),
    ),
    lineageDiversity: style(
      'lineage-shannon-diversity',
      'Lineage Shannon diversity',
      config.diversityUnit,
      config.lineageDiversityStyle,
      scalarPoints((sample) => sample.lineageShannonDiversity),
    ),
    genotypeFractions: Object.freeze(genotypeFractions),
  })
}
