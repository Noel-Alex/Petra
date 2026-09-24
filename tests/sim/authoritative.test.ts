import { describe, expect, it } from 'vitest'
import {
  cloneComposedState,
  composedConfigurationFingerprint,
  createComposedState,
  stepComposedState,
  type ComposedSimulationConfig,
} from '../../src/sim/authoritative'

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
  lineages: [
    { id: 'ancestor', relativeFitness: 1, deathHazardPerHour: 0 },
    { id: 'variant', relativeFitness: 0.9, deathHazardPerHour: 0.1 },
  ],
  hoursPerTick: 0.01,
}

describe('authoritative composed state', () => {
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
    expect(branch.lineageBiomass[0]).not.toBe(checkpoint.lineageBiomass[0])
  })

  it('binds positional lineage channels and mechanism config to one fingerprint', () => {
    const state = createComposedState(config)
    expect(state.configurationFingerprint).toBe(
      composedConfigurationFingerprint(config),
    )

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
    ).toThrow(/unique/)
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
    ).toThrow(/non-empty/)
  })

  it('rejects corrupted serialized state before typed-array conversion can hide it', () => {
    const state = createComposedState(config)
    state.mask[0] = 256
    expect(() => stepComposedState(state, config)).toThrow(/mask values/)
  })
})
