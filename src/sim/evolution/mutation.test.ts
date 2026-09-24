/** Sampler-validation fixture only: probabilities such as 0.02, 0.05, 0.1,
 * 0.3, and 0.4 below are synthetic stress-test values, not biological mutation rates. */
import { describe, expect, it } from 'vitest'
import { SimulationRng } from '../rng'
import {
  sampleDivisionMutations,
  sampleDivisionMutationsWithPolicy,
} from './mutation'
import {
  SAMPLING_EXECUTION_POLICY_SCHEMA_VERSION,
  SamplingPolicyRefusalError,
  type SamplingExecutionPolicy,
} from '../samplingPolicy'

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


function samplingPolicy(
  overrides: Partial<SamplingExecutionPolicy> = {},
): SamplingExecutionPolicy {
  return {
    schemaVersion: SAMPLING_EXECUTION_POLICY_SCHEMA_VERSION,
    id: 'synthetic-mutation-sampling-policy',
    exactTrialLimit: 100,
    acceleration: 'exact-sparse-binomial-v1',
    maximumExpectedAcceleratedDraws: 2_000,
    maximumAcceleratedDraws: 4_000,
    ...overrides,
  }
}

describe('policy-bounded division mutation sampling', () => {
  it('preserves the exact reference path and RNG stream below the exact budget', () => {
    const targets = [
      { genotypeId: 'A', probabilityPerDivision: 0.02 },
      { genotypeId: 'B', probabilityPerDivision: 0.03 },
    ] as const
    const directRng = new SimulationRng(77)
    const policyRng = new SimulationRng(77)

    const direct = sampleDivisionMutations(100, targets, directRng)
    const bounded = sampleDivisionMutationsWithPolicy(
      100,
      targets,
      policyRng,
      samplingPolicy(),
    )

    expect(bounded.counts).toEqual(direct)
    expect(bounded.diagnostics.mode).toBe('exact-reference')
    expect(policyRng.snapshot()).toEqual(directRng.snapshot())
  })

  it('samples billion-opportunity rare mutations without looping over every division', () => {
    const divisions = 1_000_000_000
    const result = sampleDivisionMutationsWithPolicy(
      divisions,
      [
        { genotypeId: 'A', probabilityPerDivision: 1e-8 },
        { genotypeId: 'B', probabilityPerDivision: 2e-8 },
      ],
      new SimulationRng(2026),
      samplingPolicy(),
    )

    expect(result.diagnostics.mode).toBe('exact-sparse-multinomial')
    expect(result.diagnostics.rngDraws).toBeLessThan(200)
    expect(
      result.counts.reduce((sum, target) => sum + target.count, 0),
    ).toBeLessThanOrEqual(divisions)
  })

  it('keeps zero/one mutation probability limits exact at large counts', () => {
    const divisions = 1_000_000_000
    const zero = sampleDivisionMutationsWithPolicy(
      divisions,
      [{ genotypeId: 'A', probabilityPerDivision: 0 }],
      new SimulationRng(1),
      samplingPolicy(),
    )
    expect(zero.counts).toEqual([{ genotypeId: 'A', count: 0 }])

    const one = sampleDivisionMutationsWithPolicy(
      divisions,
      [{ genotypeId: 'A', probabilityPerDivision: 1 }],
      new SimulationRng(1),
      samplingPolicy(),
    )
    expect(one.counts).toEqual([{ genotypeId: 'A', count: divisions }])
  })

  it('refuses oversized exact-only sampling without consuming RNG', () => {
    const rng = new SimulationRng(9)
    const before = rng.snapshot()

    expect(() =>
      sampleDivisionMutationsWithPolicy(
        1_000_000,
        [{ genotypeId: 'A', probabilityPerDivision: 1e-6 }],
        rng,
        samplingPolicy({ acceleration: 'disabled' }),
      ),
    ).toThrow(SamplingPolicyRefusalError)
    expect(rng.snapshot()).toEqual(before)
  })

  it('matches reference multinomial means over deterministic many-seed fixtures', () => {
    const divisions = 250
    const targets = [
      { genotypeId: 'A', probabilityPerDivision: 0.02 },
      { genotypeId: 'B', probabilityPerDivision: 0.03 },
    ] as const
    const seeds = 2_000
    const exactTotals = [0, 0]
    const acceleratedTotals = [0, 0]
    const acceleratedPolicy = samplingPolicy({ exactTrialLimit: 0 })

    for (let seed = 1; seed <= seeds; seed += 1) {
      const exact = sampleDivisionMutations(
        divisions,
        targets,
        new SimulationRng(seed),
      )
      const accelerated = sampleDivisionMutationsWithPolicy(
        divisions,
        targets,
        new SimulationRng(seed),
        acceleratedPolicy,
      ).counts
      for (let index = 0; index < targets.length; index += 1) {
        exactTotals[index] = exactTotals[index]! + exact[index]!.count
        acceleratedTotals[index] =
          acceleratedTotals[index]! + accelerated[index]!.count
      }
    }

    for (let index = 0; index < targets.length; index += 1) {
      const exactMean = exactTotals[index]! / seeds
      const acceleratedMean = acceleratedTotals[index]! / seeds
      expect(Math.abs(acceleratedMean - exactMean)).toBeLessThan(0.25)
    }
  })

  it('agrees with the reference rare-event tail frequency', () => {
    const divisions = 1_000
    const targets = [
      { genotypeId: 'rare', probabilityPerDivision: 0.001 },
    ] as const
    const seeds = 2_000
    let exactTail = 0
    let acceleratedTail = 0
    const acceleratedPolicy = samplingPolicy({ exactTrialLimit: 0 })

    for (let seed = 1; seed <= seeds; seed += 1) {
      if (
        sampleDivisionMutations(
          divisions,
          targets,
          new SimulationRng(seed),
        )[0]!.count >= 3
      ) {
        exactTail += 1
      }
      if (
        sampleDivisionMutationsWithPolicy(
          divisions,
          targets,
          new SimulationRng(seed),
          acceleratedPolicy,
        ).counts[0]!.count >= 3
      ) {
        acceleratedTail += 1
      }
    }

    expect(Math.abs(acceleratedTail / seeds - exactTail / seeds)).toBeLessThan(
      0.02,
    )
  })
})
