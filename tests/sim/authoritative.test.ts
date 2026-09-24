import { describe, expect, it } from 'vitest'
import { cloneComposedState, createComposedState, stepComposedState, type ComposedSimulationConfig } from '../../src/sim/authoritative'

const config: ComposedSimulationConfig = {
  width: 2, height: 1, mask: [1, 1], initialResource: [8, 8], initialLineageBiomass: [[1, 0], [2, 0]],
  growth: { maxDivisionRate: 0.8, halfSaturation: 2, biomassYield: 0.5, localCapacity: 20, spreadRate: 0 },
  lineages: [{ id: 'ancestor', relativeFitness: 1, deathHazardPerHour: 0 }, { id: 'variant', relativeFitness: 0.9, deathHazardPerHour: 0.1 }],
  hoursPerTick: 0.01,
}

describe('authoritative composed state', () => {
  it('is deterministic for identical explicit configuration and starting state', () => {
    const first = createComposedState(config); const second = createComposedState(config)
    const firstMetrics = Array.from({ length: 50 }, () => stepComposedState(first, config)).at(-1)
    const secondMetrics = Array.from({ length: 50 }, () => stepComposedState(second, config)).at(-1)
    expect(first).toEqual(second); expect(firstMetrics).toEqual(secondMetrics)
    expect(firstMetrics!.totalBiomass).toBeGreaterThan(3); expect(firstMetrics!.totalResource).toBeLessThan(16)
  })
  it('clones checkpoint state without sharing mutable arrays', () => {
    const original = createComposedState(config); stepComposedState(original, config)
    const checkpoint = cloneComposedState(original); const branch = cloneComposedState(checkpoint); stepComposedState(branch, config)
    expect(branch).not.toEqual(checkpoint); expect(original).toEqual(checkpoint)
    expect(branch.resource).not.toBe(checkpoint.resource); expect(branch.lineageBiomass[0]).not.toBe(checkpoint.lineageBiomass[0])
  })
  it('rejects hidden or malformed scenario authority instead of inventing defaults', () => {
    expect(() => createComposedState({ ...config, hoursPerTick: 0 })).toThrow(/hoursPerTick/)
    expect(() => createComposedState({ ...config, initialResource: [8] })).toThrow(/grid dimensions/)
    expect(() => createComposedState({ ...config, lineages: [config.lineages[0]!, config.lineages[0]!] })).toThrow(/unique/)
  })
})
