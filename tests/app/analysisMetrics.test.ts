import { describe, expect, it } from 'vitest'
import {
  buildAuthoritativeMetricSeries,
  type AuthoritativeMetricSeriesConfig,
} from '../../src/app/analysisMetrics'
import {
  AUTHORITATIVE_METRIC_SCHEMA_VERSION,
  METRIC_SAMPLING_POLICY_VERSION,
  type AuthoritativeMetricSample,
} from '../../src/sim/metrics'
import { createRunIdentity } from '../../src/sim/protocol'

const identity = createRunIdentity({
  scenarioId: 'analysis-series-fixture',
  scenarioVersion: '1',
  parameterSetId: 'fixture:analysis-series',
  parameterSetVersion: '1',
  seed: 17,
})

const policy = {
  version: METRIC_SAMPLING_POLICY_VERSION,
  everyTicks: 5,
  offsetTicks: 0,
} as const

function sample(args: {
  tick: number
  time: number
  biomass: number
  resource: number
  resistantFraction: number
  diversity: number
  genotypes: readonly { genotypeId: string; fraction: number }[]
}): AuthoritativeMetricSample {
  return {
    schemaVersion: AUTHORITATIVE_METRIC_SCHEMA_VERSION,
    samplingPolicy: policy,
    identity,
    tick: args.tick,
    simulationTimeHours: args.time,
    totalBiomass: args.biomass,
    totalResource: args.resource,
    occupiedCells: args.biomass > 0 ? 1 : 0,
    lineageShannonDiversity: args.diversity,
    resistantBiomass: args.biomass * args.resistantFraction,
    resistantFraction: args.resistantFraction,
    lineages: args.genotypes.map((genotype, index) => ({
      lineageId: `fixture-lineage-${index}:${genotype.genotypeId}`,
      genotypeId: genotype.genotypeId,
      biomass: args.biomass * genotype.fraction,
      fraction: genotype.fraction,
    })),
    genotypes: args.genotypes.map((genotype) => ({
      genotypeId: genotype.genotypeId,
      biomass: args.biomass * genotype.fraction,
      fraction: genotype.fraction,
    })),
  }
}

const config: AuthoritativeMetricSeriesConfig = {
  biomassUnit: 'model-biomass',
  resourceUnit: 'model-resource',
  fractionUnit: 'fraction',
  diversityUnit: 'nats',
  totalBiomassStyle: {
    appearanceToken: 'metric-biomass',
    patternToken: 'solid',
  },
  totalResourceStyle: {
    appearanceToken: 'metric-resource',
    patternToken: 'dash',
  },
  resistantFractionStyle: {
    appearanceToken: 'metric-resistant',
    patternToken: 'dot',
  },
  lineageDiversityStyle: {
    appearanceToken: 'metric-diversity',
    patternToken: 'long-dash',
  },
  genotypes: [
    {
      genotypeId: 'WT',
      label: 'Wild type',
      appearanceToken: 'genotype-wt',
      patternToken: 'solid',
    },
    {
      genotypeId: 'R',
      label: 'Variant R',
      appearanceToken: 'genotype-r',
      patternToken: 'dash',
    },
  ],
}

describe('authoritative analysis metric series', () => {
  it('preserves exact authoritative samples and biological timestamps', () => {
    const bundle = buildAuthoritativeMetricSeries(
      [
        sample({
          tick: 0,
          time: 0,
          biomass: 1,
          resource: 10,
          resistantFraction: 0,
          diversity: 0,
          genotypes: [{ genotypeId: 'WT', fraction: 1 }],
        }),
        sample({
          tick: 5,
          time: 0.5,
          biomass: 2,
          resource: 9,
          resistantFraction: 0.25,
          diversity: 0.4,
          genotypes: [
            { genotypeId: 'WT', fraction: 0.75 },
            { genotypeId: 'R', fraction: 0.25 },
          ],
        }),
      ],
      config,
    )

    expect(bundle.totalBiomass.points).toEqual([
      { timeHours: 0, value: 1 },
      { timeHours: 0.5, value: 2 },
    ])
    expect(bundle.totalResource.points).toEqual([
      { timeHours: 0, value: 10 },
      { timeHours: 0.5, value: 9 },
    ])
    expect(bundle.resistantFraction.points[1]).toEqual({
      timeHours: 0.5,
      value: 0.25,
    })
    expect(bundle.lineageDiversity.points[1]).toEqual({
      timeHours: 0.5,
      value: 0.4,
    })
    expect(bundle.firstTick).toBe(0)
    expect(bundle.lastTick).toBe(5)
    expect(bundle.identity).toEqual(identity)
    expect(bundle.identity).not.toBe(identity)
  })

  it('represents a not-yet-present genotype as zero rather than interpolating it', () => {
    const bundle = buildAuthoritativeMetricSeries(
      [
        sample({
          tick: 0,
          time: 0,
          biomass: 1,
          resource: 10,
          resistantFraction: 0,
          diversity: 0,
          genotypes: [{ genotypeId: 'WT', fraction: 1 }],
        }),
        sample({
          tick: 5,
          time: 0.5,
          biomass: 2,
          resource: 9,
          resistantFraction: 0.5,
          diversity: 0.69,
          genotypes: [
            { genotypeId: 'WT', fraction: 0.5 },
            { genotypeId: 'R', fraction: 0.5 },
          ],
        }),
      ],
      config,
    )

    const resistant = bundle.genotypeFractions.find(
      (series) => series.id === 'genotype-fraction:R',
    )
    expect(resistant?.points).toEqual([
      { timeHours: 0, value: 0 },
      { timeHours: 0.5, value: 0.5 },
    ])
  })

  it('fails closed when the history mixes run identity or cadence', () => {
    const first = sample({
      tick: 0,
      time: 0,
      biomass: 1,
      resource: 10,
      resistantFraction: 0,
      diversity: 0,
      genotypes: [{ genotypeId: 'WT', fraction: 1 }],
    })
    const mixedIdentity = structuredClone(first)
    ;(mixedIdentity.identity as { seed: number }).seed = 18

    expect(() =>
      buildAuthoritativeMetricSeries([first, mixedIdentity], config),
    ).toThrow(/mixes run identities/)

    const mixedCadence = structuredClone(first)
    ;(mixedCadence.samplingPolicy as { everyTicks: number }).everyTicks = 10
    ;(mixedCadence as { tick: number }).tick = 10
    ;(mixedCadence as { simulationTimeHours: number }).simulationTimeHours = 1

    expect(() =>
      buildAuthoritativeMetricSeries([first, mixedCadence], config),
    ).toThrow(/mixes sampling policies/)
  })

  it('fails closed on corrupted authoritative scalar and resistance values', () => {
    const base = sample({
      tick: 0,
      time: 0,
      biomass: 2,
      resource: 10,
      resistantFraction: 0.5,
      diversity: 0.5,
      genotypes: [
        { genotypeId: 'WT', fraction: 0.5 },
        { genotypeId: 'R', fraction: 0.5 },
      ],
    })

    const invalidResource = structuredClone(base)
    ;(invalidResource as { totalResource: number }).totalResource = Number.NaN
    expect(() => buildAuthoritativeMetricSeries([invalidResource], config)).toThrow(
      /totalResource must be finite and non-negative/,
    )

    const invalidOccupied = structuredClone(base)
    ;(invalidOccupied as { occupiedCells: number }).occupiedCells = 1.5
    expect(() => buildAuthoritativeMetricSeries([invalidOccupied], config)).toThrow(
      /occupiedCells must be a non-negative safe integer/,
    )

    const inconsistentResistance = structuredClone(base)
    ;(inconsistentResistance as { resistantBiomass: number }).resistantBiomass = 0.5
    expect(() =>
      buildAuthoritativeMetricSeries([inconsistentResistance], config),
    ).toThrow(/resistant fraction is inconsistent with biomass/)
  })

  it('rejects duplicate or cross-channel-inconsistent genotype authority', () => {
    const base = sample({
      tick: 0,
      time: 0,
      biomass: 2,
      resource: 10,
      resistantFraction: 0,
      diversity: 0.5,
      genotypes: [
        { genotypeId: 'WT', fraction: 0.5 },
        { genotypeId: 'R', fraction: 0.5 },
      ],
    })

    const duplicateGenotype = structuredClone(base)
    ;(duplicateGenotype.genotypes as {
      genotypeId: string
      biomass: number
      fraction: number
    }[]).push({ ...duplicateGenotype.genotypes[0]! })
    expect(() => buildAuthoritativeMetricSeries([duplicateGenotype], config)).toThrow(
      /duplicate genotype id: WT/,
    )

    const foreignLineageIdentity = structuredClone(base)
    ;(foreignLineageIdentity.lineages[0] as { genotypeId: string }).genotypeId = 'R'
    expect(() =>
      buildAuthoritativeMetricSeries([foreignLineageIdentity], config),
    ).toThrow(/genotype biomass does not match lineage identity/)
  })

  it('rejects lineage fractions or totals that disagree with aggregate biomass', () => {
    const base = sample({
      tick: 0,
      time: 0,
      biomass: 2,
      resource: 10,
      resistantFraction: 0,
      diversity: 0.5,
      genotypes: [
        { genotypeId: 'WT', fraction: 0.5 },
        { genotypeId: 'R', fraction: 0.5 },
      ],
    })

    const invalidFraction = structuredClone(base)
    ;(invalidFraction.lineages[0] as { fraction: number }).fraction = 0.25
    expect(() => buildAuthoritativeMetricSeries([invalidFraction], config)).toThrow(
      /lineage .* fraction is inconsistent with biomass/,
    )

    const invalidTotal = structuredClone(base)
    ;(invalidTotal.lineages[0] as { biomass: number; fraction: number }).biomass = 0.5
    ;(invalidTotal.lineages[0] as { biomass: number; fraction: number }).fraction = 0.25
    expect(() => buildAuthoritativeMetricSeries([invalidTotal], config)).toThrow(
      /lineage biomass does not sum to totalBiomass/,
    )
  })

  it('requires explicit display identity for every genotype observed', () => {
    const unknown = sample({
      tick: 0,
      time: 0,
      biomass: 1,
      resource: 10,
      resistantFraction: 0,
      diversity: 0,
      genotypes: [{ genotypeId: 'UNMAPPED', fraction: 1 }],
    })

    expect(() => buildAuthoritativeMetricSeries([unknown], config)).toThrow(
      /missing genotype analysis series descriptor: UNMAPPED/,
    )
  })
})
