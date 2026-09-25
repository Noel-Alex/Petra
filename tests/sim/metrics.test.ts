import { describe, expect, it } from 'vitest'
import {
  extractAuthoritativeLocalMetricSample,
  extractAuthoritativeMetricSample,
  METRIC_SAMPLING_POLICY_VERSION,
  shouldSampleAuthoritativeMetrics,
} from '../../src/sim/metrics'
import { ComposedSimulationEngine } from '../../src/sim/composedEngine'
import type { ComposedSimulationConfig } from '../../src/sim/authoritative'
import type { CuratedMutationGraph } from '../../src/sim/evolution/graph'
import { createFixtureComposedParameterSetBinding } from '../../src/sim/parameterSetBinding'
import { createRunIdentity } from '../../src/sim/protocol'
import { inspectAuthoritativeRegion } from '../../src/sim/regionInspector'

const graph: CuratedMutationGraph = {
  scenarioId: 'metric-fixture',
  scenarioVersion: '1',
  genotypes: [
    { id: 'WT', relativeFitness: 1, sourceOrder: 0 },
    { id: 'R', relativeFitness: 0.9, sourceOrder: 1 },
  ],
  transitions: [],
}

const config: ComposedSimulationConfig = {
  width: 2,
  height: 1,
  mask: [1, 1],
  initialResource: [4, 4],
  ciprofloxacinConcentrationMgPerL: [0, 0],
  initialLineageBiomass: [[1, 0], [3, 0]],
  growth: {
    maxDivisionRate: 0,
    halfSaturation: 1,
    biomassYield: 1,
    localCapacity: 10,
    spreadRate: 0,
  },
  lineages: [
    { id: 'wt-lineage', genotypeId: 'WT', deathHazardPerHour: 0 },
    { id: 'r-lineage', genotypeId: 'R', deathHazardPerHour: 0 },
  ],
  evolutionGraph: graph,
  evolutionScenario: { scenarioId: 'metric-fixture', scenarioVersion: '1' },
  ciprofloxacin: null,
  samplingExecutionPolicy: null,
  dynamicLineageLossPolicy: null,
  hoursPerTick: 0.1,
}

const binding = createFixtureComposedParameterSetBinding(
  'fixture:metric-fixture',
  '1',
  config,
)

const identity = createRunIdentity({
  scenarioId: 'metric-fixture',
  scenarioVersion: '1',
  parameterSetId: binding.parameterSetId,
  parameterSetVersion: binding.parameterSetVersion,
  parameterSetBinding: binding,
  seed: 7,
})

const policy = {
  version: METRIC_SAMPLING_POLICY_VERSION,
  everyTicks: 5,
  offsetTicks: 0,
} as const

describe('authoritative metrics', () => {
  it('samples by biological tick rather than render cadence', () => {
    expect(shouldSampleAuthoritativeMetrics(0, policy)).toBe(true)
    expect(shouldSampleAuthoritativeMetrics(4, policy)).toBe(false)
    expect(shouldSampleAuthoritativeMetrics(5, policy)).toBe(true)
    expect(shouldSampleAuthoritativeMetrics(10, policy)).toBe(true)
  })

  it('projects deterministic lineage, genotype, resistance, and diversity metrics', () => {
    const checkpoint = new ComposedSimulationEngine(identity, config).snapshot().checkpoint
    const sample = extractAuthoritativeMetricSample({
      checkpoint,
      samplingPolicy: policy,
      resistantGenotypeIds: ['R'],
    })

    expect(sample.tick).toBe(0)
    expect(sample.simulationTimeHours).toBe(0)
    expect(sample.totalBiomass).toBe(4)
    expect(sample.totalResource).toBe(8)
    expect(sample.resistantBiomass).toBe(3)
    expect(sample.resistantFraction).toBeCloseTo(0.75)
    expect(sample.lineages.map((item) => [item.lineageId, item.fraction])).toEqual([
      ['L1', 0.25],
      ['L2', 0.75],
    ])
    expect(sample.genotypes.map((item) => [item.genotypeId, item.fraction])).toEqual([
      ['WT', 0.25],
      ['R', 0.75],
    ])
    expect(sample.lineageShannonDiversity).toBeCloseTo(
      -(0.25 * Math.log(0.25) + 0.75 * Math.log(0.75)),
    )
    expect(sample.identity).toEqual(identity)
    expect(sample.identity).not.toBe(checkpoint.identity)
  })

  it('does not infer resistance from genotype names', () => {
    const checkpoint = new ComposedSimulationEngine(identity, config).snapshot().checkpoint
    const sample = extractAuthoritativeMetricSample({
      checkpoint,
      samplingPolicy: policy,
      resistantGenotypeIds: [],
    })
    expect(sample.resistantBiomass).toBe(0)
    expect(sample.resistantFraction).toBe(0)
  })

  it('fails closed on unknown resistant genotype identity and invalid cadence', () => {
    const checkpoint = new ComposedSimulationEngine(identity, config).snapshot().checkpoint
    expect(() =>
      extractAuthoritativeMetricSample({
        checkpoint,
        samplingPolicy: policy,
        resistantGenotypeIds: ['UNKNOWN'],
      }),
    ).toThrow(/not present/)

    expect(() =>
      shouldSampleAuthoritativeMetrics(1, {
        version: METRIC_SAMPLING_POLICY_VERSION,
        everyTicks: 0,
        offsetTicks: 0,
      }),
    ).toThrow(/positive safe integer/)
  })

  it('projects selected authoritative regions on the same biological sampling cadence', () => {
    const checkpoint = new ComposedSimulationEngine(identity, config).snapshot().checkpoint
    const inspection = inspectAuthoritativeRegion(checkpoint, {
      id: 'local-focus',
      centerX: 0.25,
      centerY: 0.5,
      radius: 0.1,
    })
    const sample = extractAuthoritativeLocalMetricSample({
      inspection,
      samplingPolicy: policy,
    })

    if (sample.kind !== 'measured') {
      throw new Error('expected measured local metric sample')
    }
    expect(sample.selectionId).toBe('local-focus')
    expect(sample.tick).toBe(0)
    expect(sample.simulationTimeHours).toBe(0)
    expect(sample.commandCount).toBe(0)
    expect(sample.selectedCellCount).toBe(1)
    expect(sample.totalBiomass).toBe(4)
    expect(sample.totalResource).toBe(4)
    expect(sample.biomassUnit).toBe('model-biomass')
    expect(sample.resourceUnit).toBe('model-resource')
    expect(sample.lineages.map((item) => [item.lineageId, item.fraction])).toEqual([
      ['L1', 0.25],
      ['L2', 0.75],
    ])
    expect(sample.genotypes.map((item) => [item.genotypeId, item.fraction])).toEqual([
      ['WT', 0.25],
      ['R', 0.75],
    ])
    expect(sample.identity).toEqual(checkpoint.identity)
    expect(sample.identity).not.toBe(checkpoint.identity)
  })

  it('preserves no-grid-coverage instead of manufacturing a measured zero', () => {
    const checkpoint = new ComposedSimulationEngine(identity, config).snapshot().checkpoint
    const inspection = inspectAuthoritativeRegion(checkpoint, {
      id: 'between-cells',
      centerX: 0.5,
      centerY: 0.5,
      radius: 0.1,
    })
    const sample = extractAuthoritativeLocalMetricSample({
      inspection,
      samplingPolicy: policy,
    })

    expect(sample.kind).toBe('no-grid-coverage')
    expect(sample.selectionId).toBe('between-cells')
    expect('totalBiomass' in sample).toBe(false)
    expect('totalResource' in sample).toBe(false)
    expect('lineages' in sample).toBe(false)
  })

  it('refuses an authoritative local inspection that is off the declared cadence', () => {
    const engine = new ComposedSimulationEngine(identity, config)
    engine.execute({ id: 'advance-local-metric', type: 'advance', ticks: 1 })
    const inspection = inspectAuthoritativeRegion(engine.snapshot().checkpoint, {
      id: 'off-cadence',
      centerX: 0.25,
      centerY: 0.5,
      radius: 0.1,
    })

    expect(() =>
      extractAuthoritativeLocalMetricSample({
        inspection,
        samplingPolicy: policy,
      }),
    ).toThrow(/off the declared sampling cadence/)
  })

  it('fails closed when local lineage fractions are inconsistent with authoritative biomass', () => {
    const checkpoint = new ComposedSimulationEngine(identity, config).snapshot().checkpoint
    const inspection = inspectAuthoritativeRegion(checkpoint, {
      id: 'tampered-local',
      centerX: 0.25,
      centerY: 0.5,
      radius: 0.1,
    })
    if (inspection.kind !== 'measured') {
      throw new Error('expected measured region')
    }
    const tampered = {
      ...inspection,
      lineageBiomass: inspection.lineageBiomass.map((row, index) =>
        index === 0 ? { ...row, fractionOfRegionBiomass: 0.5 } : row,
      ),
    }

    expect(() =>
      extractAuthoritativeLocalMetricSample({
        inspection: tampered,
        samplingPolicy: policy,
      }),
    ).toThrow(/fraction.*inconsistent/)
  })

})
