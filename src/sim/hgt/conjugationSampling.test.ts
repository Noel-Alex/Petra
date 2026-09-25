/**
 * Sampler-validation fixture only: probabilities below are synthetic stress-test
 * values, not biological conjugation rates or R388 source parameters.
 */
import { describe, expect, it } from 'vitest'
import { SimulationRng } from '../rng'
import {
  SAMPLING_EXECUTION_POLICY_SCHEMA_VERSION,
  SamplingPolicyRefusalError,
  type SamplingExecutionPolicy,
} from '../samplingPolicy'
import {
  sampleConjugationTransfers,
  sampleConjugationTransfersWithPolicy,
} from './conjugationSampling'

function samplingPolicy(
  overrides: Partial<SamplingExecutionPolicy> = {},
): SamplingExecutionPolicy {
  return {
    schemaVersion: SAMPLING_EXECUTION_POLICY_SCHEMA_VERSION,
    id: 'synthetic-conjugation-sampling-policy',
    exactTrialLimit: 100,
    acceleration: 'exact-sparse-binomial-v1',
    maximumExpectedAcceleratedDraws: 2_000,
    maximumAcceleratedDraws: 4_000,
    ...overrides,
  }
}

describe('conjugation transfer sampling', () => {
  it('keeps zero and one probability limits exact', () => {
    expect(
      sampleConjugationTransfers(50, 0, new SimulationRng(1)),
    ).toBe(0)
    expect(
      sampleConjugationTransfers(50, 1, new SimulationRng(1)),
    ).toBe(50)
  })

  it('never transfers more recipients than the supplied eligible set', () => {
    const eligible = 500
    const transfers = sampleConjugationTransfers(
      eligible,
      0.8,
      new SimulationRng(17),
    )
    expect(transfers).toBeGreaterThanOrEqual(0)
    expect(transfers).toBeLessThanOrEqual(eligible)
  })

  it('replays exactly from the same Petra RNG state', () => {
    const first = sampleConjugationTransfers(
      1_000,
      0.15,
      new SimulationRng(42),
    )
    const second = sampleConjugationTransfers(
      1_000,
      0.15,
      new SimulationRng(42),
    )
    expect(second).toBe(first)
  })

  it('rejects invalid opportunity counts and probabilities', () => {
    const rng = new SimulationRng(1)
    expect(() => sampleConjugationTransfers(-1, 0.1, rng)).toThrow(
      /non-negative safe integer/,
    )
    expect(() => sampleConjugationTransfers(1.5, 0.1, rng)).toThrow(
      /non-negative safe integer/,
    )
    expect(() => sampleConjugationTransfers(1, -0.1, rng)).toThrow(
      /finite in \[0, 1\]/,
    )
    expect(() => sampleConjugationTransfers(1, 1.1, rng)).toThrow(
      /finite in \[0, 1\]/,
    )
  })
})

describe('policy-bounded conjugation transfer sampling', () => {
  it('preserves the exact reference path and RNG stream below the exact budget', () => {
    const directRng = new SimulationRng(77)
    const policyRng = new SimulationRng(77)

    const direct = sampleConjugationTransfers(100, 0.07, directRng)
    const bounded = sampleConjugationTransfersWithPolicy(
      100,
      0.07,
      policyRng,
      samplingPolicy(),
    )

    expect(bounded.transferCount).toBe(direct)
    expect(bounded.diagnostics.mode).toBe('exact-reference')
    expect(bounded.diagnostics.rngDraws).toBe(100)
    expect(policyRng.snapshot()).toEqual(directRng.snapshot())
  })

  it('handles a billion rare eligible opportunities without trial-by-trial work', () => {
    const eligible = 1_000_000_000
    const result = sampleConjugationTransfersWithPolicy(
      eligible,
      1e-8,
      new SimulationRng(2026),
      samplingPolicy(),
    )

    expect(result.diagnostics.mode).toBe('exact-sparse-binomial')
    expect(result.diagnostics.rngDraws).toBeLessThan(200)
    expect(result.transferCount).toBeGreaterThanOrEqual(0)
    expect(result.transferCount).toBeLessThanOrEqual(eligible)
  })

  it('keeps large-count zero and one limits exact under accelerated policy', () => {
    const eligible = 1_000_000_000

    const zero = sampleConjugationTransfersWithPolicy(
      eligible,
      0,
      new SimulationRng(3),
      samplingPolicy(),
    )
    const one = sampleConjugationTransfersWithPolicy(
      eligible,
      1,
      new SimulationRng(3),
      samplingPolicy(),
    )

    expect(zero.transferCount).toBe(0)
    expect(one.transferCount).toBe(eligible)
    expect(zero.diagnostics.rngDraws).toBe(0)
    expect(one.diagnostics.rngDraws).toBe(0)
  })

  it('refuses oversized exact-only work without consuming caller RNG', () => {
    const rng = new SimulationRng(9)
    const before = rng.snapshot()

    expect(() =>
      sampleConjugationTransfersWithPolicy(
        1_000_000,
        1e-6,
        rng,
        samplingPolicy({ acceleration: 'disabled' }),
      ),
    ).toThrow(SamplingPolicyRefusalError)

    expect(rng.snapshot()).toEqual(before)
  })

  it('matches reference binomial means over deterministic many-seed fixtures', () => {
    const eligible = 250
    const probability = 0.03
    const seeds = 2_000
    const acceleratedPolicy = samplingPolicy({ exactTrialLimit: 0 })
    let exactTotal = 0
    let acceleratedTotal = 0

    for (let seed = 1; seed <= seeds; seed += 1) {
      exactTotal += sampleConjugationTransfers(
        eligible,
        probability,
        new SimulationRng(seed),
      )
      acceleratedTotal += sampleConjugationTransfersWithPolicy(
        eligible,
        probability,
        new SimulationRng(seed),
        acceleratedPolicy,
      ).transferCount
    }

    const exactMean = exactTotal / seeds
    const acceleratedMean = acceleratedTotal / seeds
    expect(Math.abs(acceleratedMean - exactMean)).toBeLessThan(0.25)
  })
})
