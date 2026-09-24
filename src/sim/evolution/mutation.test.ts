import { describe, expect, it } from 'vitest'
import { SimulationRng } from '../rng'
import { sampleDivisionMutations } from './mutation'

describe('division-linked mutation sampling', () => {
  it('produces no mutants when all edge probabilities are zero', () => {
    const result = sampleDivisionMutations(10_000, [{ genotypeId: 'gyrA', probabilityPerDivision: 0 }], new SimulationRng(7))
    expect(result).toEqual([{ genotypeId: 'gyrA', count: 0 }])
  })

  it('never creates more mutant births than divisions', () => {
    const divisions = 500
    const result = sampleDivisionMutations(divisions, [
      { genotypeId: 'A', probabilityPerDivision: 0.3 },
      { genotypeId: 'B', probabilityPerDivision: 0.4 },
    ], new SimulationRng(11))
    expect(result.reduce((sum, target) => sum + target.count, 0)).toBeLessThanOrEqual(divisions)
  })

  it('replays the same mutation counts from the same RNG state', () => {
    const targets = [
      { genotypeId: 'A', probabilityPerDivision: 0.05 },
      { genotypeId: 'B', probabilityPerDivision: 0.1 },
    ] as const
    expect(sampleDivisionMutations(1000, targets, new SimulationRng(42))).toEqual(
      sampleDivisionMutations(1000, targets, new SimulationRng(42)),
    )
  })

  it('rejects mutation classes whose probabilities exceed one division', () => {
    expect(() => sampleDivisionMutations(1, [
      { genotypeId: 'A', probabilityPerDivision: 0.6 },
      { genotypeId: 'B', probabilityPerDivision: 0.5 },
    ], new SimulationRng(1))).toThrow(/sum above 1/)
  })

  it('matches the expected categorical frequency over a deterministic large fixture', () => {
    const divisions = 100_000
    const probability = 0.02
    const [result] = sampleDivisionMutations(divisions, [{ genotypeId: 'A', probabilityPerDivision: probability }], new SimulationRng(1234))
    const expected = divisions * probability
    const sigma = Math.sqrt(divisions * probability * (1 - probability))
    expect(Math.abs(result!.count - expected)).toBeLessThan(5 * sigma)
  })
})
