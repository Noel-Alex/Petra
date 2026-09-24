import { describe, expect, it } from 'vitest'
import {
  cloneComposedState,
  composedConfigurationFingerprint,
  createComposedState,
  stepComposedState,
  type ComposedSimulationConfig,
} from '../../src/sim/authoritative'
import type { CuratedMutationGraph } from '../../src/sim/evolution/graph'

const evolutionGraph: CuratedMutationGraph = {
  scenarioId: 'test-scenario',
  scenarioVersion: '1',
  genotypes: [
    { id: 'WT', relativeFitness: 1, sourceOrder: 0 },
    { id: 'VAR', relativeFitness: 0.9, sourceOrder: 1 },
    { id: 'ISO', relativeFitness: 1, sourceOrder: 2 },
  ],
  transitions: [],
}

const config: ComposedSimulationConfig = {
  width: 2,
  height: 1,
  mask: [1, 1],
  initialResource: [8, 8],
  initialLineageBiomass: [[1, 0], [2, 0]],
  growth: {
    maxDivisionRate: 0.8,
    halfSaturation: 2,
    biomassYield: 0.5,
    localCapacity: 20,
    spreadRate: 0,
  },
  evolutionGraph,
  evolutionScenario: { scenarioId: 'test-scenario', scenarioVersion: '1' },
  lineages: [
    { id: 'ancestor', genotypeId: 'WT', deathHazardPerHour: 0 },
    { id: 'variant', genotypeId: 'VAR', deathHazardPerHour: 0.1 },
  ],
  hoursPerTick: 0.01,
}

describe('authoritative composed state', () => {
  const maskedConfig: ComposedSimulationConfig = {
    ...config,
    mask: [1, 0],
    initialResource: [8, 0],
    initialLineageBiomass: [[1, 0], [2, 0]],
  }

  it('is deterministic for identical explicit configuration and starting state', () => {
    const first = createComposedState(config)
    const second = createComposedState(config)
    const firstMetrics = Array.from({ length: 50 }, () =>
      stepComposedState(first, config),
    ).at(-1)
    const secondMetrics = Array.from({ length: 50 }, () =>
      stepComposedState(second, config),
    ).at(-1)

    expect(first).toEqual(second)
    expect(firstMetrics).toEqual(secondMetrics)
    expect(firstMetrics!.totalBiomass).toBeGreaterThan(3)
    expect(firstMetrics!.totalResource).toBeLessThan(16)
  })

  it('clones checkpoint state without sharing mutable arrays', () => {
    const original = createComposedState(config)
    stepComposedState(original, config)
    const checkpoint = cloneComposedState(original)
    const branch = cloneComposedState(checkpoint)
    stepComposedState(branch, config)

    expect(branch).not.toEqual(checkpoint)
    expect(original).toEqual(checkpoint)
    expect(branch.resource).not.toBe(checkpoint.resource)
    expect(branch.lineageIds).not.toBe(checkpoint.lineageIds)
    expect(branch.genotypeIds).not.toBe(checkpoint.genotypeIds)
    expect(branch.lineageBiomass[0]).not.toBe(checkpoint.lineageBiomass[0])
  })

  it('binds positional lineage/genotype channels and mechanism config to one fingerprint', () => {
    const state = createComposedState(config)
    expect(state.configurationFingerprint).toBe(
      composedConfigurationFingerprint(config),
    )
    expect(state.genotypeIds).toEqual(['WT', 'VAR'])

    expect(() =>
      stepComposedState(state, {
        ...config,
        lineages: [config.lineages[1]!, config.lineages[0]!],
      }),
    ).toThrow(/fingerprint mismatch/)

    expect(() =>
      stepComposedState(state, {
        ...config,
        growth: { ...config.growth, maxDivisionRate: 0.81 },
      }),
    ).toThrow(/fingerprint mismatch/)
  })

  it('rejects genotype reassignment even when numerical fitness is identical', () => {
    const state = createComposedState(config)
    const reassigned: ComposedSimulationConfig = {
      ...config,
      lineages: [
        { ...config.lineages[0]!, genotypeId: 'ISO' },
        config.lineages[1]!,
      ],
    }

    expect(evolutionGraph.genotypes[0]!.relativeFitness).toBe(
      evolutionGraph.genotypes[2]!.relativeFitness,
    )
    expect(composedConfigurationFingerprint(reassigned)).not.toBe(
      state.configurationFingerprint,
    )
    expect(() => stepComposedState(state, reassigned)).toThrow(
      /fingerprint mismatch/,
    )
  })

  it('rejects serialized genotype channel drift independently of biomass order', () => {
    const state = createComposedState(config)
    state.genotypeIds[0] = 'ISO'

    expect(() => stepComposedState(state, config)).toThrow(/genotype order/)
  })

  it('sources relative fitness from the curated genotype graph', () => {
    const baseline = createComposedState(config)
    const alteredGraph: CuratedMutationGraph = {
      ...evolutionGraph,
      genotypes: evolutionGraph.genotypes.map((genotype) =>
        genotype.id === 'VAR' ? { ...genotype, relativeFitness: 0.5 } : genotype,
      ),
    }
    const alteredConfig = { ...config, evolutionGraph: alteredGraph }

    expect(composedConfigurationFingerprint(alteredConfig)).not.toBe(
      baseline.configurationFingerprint,
    )
    expect(() => stepComposedState(baseline, alteredConfig)).toThrow(
      /fingerprint mismatch/,
    )
  })

  it('rejects hidden or malformed scenario authority instead of inventing defaults', () => {
    expect(() => createComposedState({ ...config, hoursPerTick: 0 })).toThrow(
      /hoursPerTick/,
    )
    expect(() =>
      createComposedState({ ...config, initialResource: [8] }),
    ).toThrow(/grid dimensions/)
    expect(() =>
      createComposedState({
        ...config,
        lineages: [config.lineages[0]!, config.lineages[0]!],
      }),
    ).toThrow(/duplicate active lineage|unique/)
    expect(() =>
      createComposedState({ ...config, mask: [1, 2] }),
    ).toThrow(/exactly 0 or 1/)
    expect(() =>
      createComposedState({
        ...config,
        lineages: [
          { ...config.lineages[0]!, id: ' ' },
          config.lineages[1]!,
        ],
      }),
    ).toThrow(/non-empty|canonical/)
    expect(() =>
      createComposedState({
        ...config,
        lineages: [
          { ...config.lineages[0]!, genotypeId: 'unknown' },
          config.lineages[1]!,
        ],
      }),
    ).toThrow(/unknown genotype/)
    expect(() =>
      createComposedState({
        ...config,
        evolutionScenario: { scenarioId: 'other', scenarioVersion: '1' },
      }),
    ).toThrow(/scenario mismatch/)
  })

  it('rejects non-canonical replay identities before fitness binding or fingerprinting', () => {
    expect(() =>
      createComposedState({
        ...config,
        lineages: [
          { ...config.lineages[0]!, id: ' ancestor ' },
          config.lineages[1]!,
        ],
      }),
    ).toThrow(/lineage id.*canonical/)
    expect(() =>
      createComposedState({
        ...config,
        lineages: [
          { ...config.lineages[0]!, genotypeId: ' WT ' },
          config.lineages[1]!,
        ],
      }),
    ).toThrow(/genotype id.*canonical/)
    expect(() =>
      createComposedState({
        ...config,
        evolutionScenario: {
          scenarioId: ' test-scenario ',
          scenarioVersion: '1',
        },
      }),
    ).toThrow(/scenario id.*canonical/)
    expect(() =>
      createComposedState({
        ...config,
        evolutionScenario: {
          scenarioId: 'test-scenario',
          scenarioVersion: ' 1 ',
        },
      }),
    ).toThrow(/scenario version.*canonical/)
  })

  it('rejects malformed serialized identity with explicit validation errors', () => {
    const malformedValue = createComposedState(config)
    ;(malformedValue.genotypeIds as unknown[])[0] = 7
    expect(() => stepComposedState(malformedValue, config)).toThrow(
      /composed state genotype id.*non-empty string/,
    )

    const malformedContainer = createComposedState(config)
    ;(
      malformedContainer as unknown as {
        genotypeIds: unknown
      }
    ).genotypeIds = 'WT'
    expect(() => stepComposedState(malformedContainer, config)).toThrow(
      /identity channels must be arrays/,
    )
  })

  it('rejects non-zero initial ecology state outside the dish mask', () => {
    expect(() =>
      createComposedState({
        ...maskedConfig,
        initialResource: [8, 9],
      }),
    ).toThrow(/resource must be zero outside composed mask/)

    expect(() =>
      createComposedState({
        ...maskedConfig,
        initialLineageBiomass: [[1, 4], [2, 0]],
      }),
    ).toThrow(/lineage biomass must be zero outside composed mask/)
  })

  it('rejects corrupted serialized ecology state outside the dish mask', () => {
    const resourceState = createComposedState(maskedConfig)
    resourceState.resource[1] = 9
    expect(() => stepComposedState(resourceState, maskedConfig)).toThrow(
      /resource must be zero outside composed mask/,
    )

    const lineageState = createComposedState(maskedConfig)
    lineageState.lineageBiomass[1]![1] = 4
    expect(() => stepComposedState(lineageState, maskedConfig)).toThrow(
      /lineage biomass must be zero outside composed mask/,
    )
  })

  it('rejects materially over-capacity initial composed state', () => {
    expect(() =>
      createComposedState({
        ...config,
        growth: { ...config.growth, localCapacity: 2.5 },
      }),
    ).toThrow(/initial composed state: ecology biomass exceeds localCapacity/)
  })

  it('rejects materially over-capacity continued state before mutation', () => {
    const state = createComposedState(config)
    state.lineageBiomass[0]![0] = 15
    state.lineageBiomass[1]![0] = 10
    const before = cloneComposedState(state)

    expect(() => stepComposedState(state, config)).toThrow(
      /composed state: ecology biomass exceeds localCapacity/,
    )
    expect(state).toEqual(before)
  })

  it('accepts a Float32-representable boundary across composed create and continue', () => {
    const roundedConfig: ComposedSimulationConfig = {
      ...config,
      width: 1,
      height: 1,
      mask: [1],
      initialResource: [0],
      initialLineageBiomass: [
        [Math.fround(0.1)],
        [Math.fround(0.2)],
      ],
      growth: {
        ...config.growth,
        localCapacity: 0.3,
        spreadRate: 0,
      },
    }
    const representedTotal =
      roundedConfig.initialLineageBiomass[0]![0]! +
      roundedConfig.initialLineageBiomass[1]![0]!
    expect(representedTotal).toBeGreaterThan(
      roundedConfig.growth.localCapacity,
    )

    const state = createComposedState(roundedConfig)
    expect(() => stepComposedState(state, roundedConfig)).not.toThrow()
  })

  it('reports resource and lineage aggregates over the same in-mask domain', () => {
    const state = createComposedState(maskedConfig)
    const metrics = stepComposedState(state, maskedConfig)
    const lineageTotal = Object.values(metrics.lineageBiomass).reduce(
      (sum, value) => sum + value,
      0,
    )

    expect(metrics.totalResource).toBeCloseTo(state.resource[0]!)
    expect(lineageTotal).toBeCloseTo(metrics.totalBiomass)
    expect(state.resource[1]).toBe(0)
    expect(state.lineageBiomass[0]![1]).toBe(0)
    expect(state.lineageBiomass[1]![1]).toBe(0)
  })

  it('rejects corrupted serialized state before typed-array conversion can hide it', () => {
    const state = createComposedState(config)
    state.mask[0] = 256
    expect(() => stepComposedState(state, config)).toThrow(/mask values/)
  })
})
