import assert from 'node:assert/strict'
import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  sampleDivisionMutations,
  sampleDivisionMutationsWithPolicy,
  type MutationTarget,
} from '../src/sim/evolution/mutation'
import { SimulationRng } from '../src/sim/rng'
import {
  SAMPLING_EXECUTION_POLICY_SCHEMA_VERSION,
  samplingExecutionPolicyIdentity,
  type SamplingExecutionPolicy,
} from '../src/sim/samplingPolicy'

const EXPERIMENT_ID = 'evolution-replicate-statistics'
const DEFAULT_REPLICATES = 10_000
const MIN_REPLICATES = 1_000
const MAX_REPLICATES = 100_000
const DIVISION_OPPORTUNITIES = 1_000
const RARE_TAIL_THRESHOLD = 3

/**
 * Numerical sampler-validation fixture only.
 *
 * These probabilities are deliberately synthetic stress-test values. They are
 * not Petra biological mutation rates and must never be copied into a scenario.
 */
const TARGETS = Object.freeze([
  Object.freeze({ genotypeId: 'fixture-rare', probabilityPerDivision: 0.001 }),
  Object.freeze({ genotypeId: 'fixture-mid', probabilityPerDivision: 0.004 }),
  Object.freeze({ genotypeId: 'fixture-common', probabilityPerDivision: 0.01 }),
] satisfies readonly MutationTarget[])

const ACCELERATED_POLICY: SamplingExecutionPolicy = Object.freeze({
  schemaVersion: SAMPLING_EXECUTION_POLICY_SCHEMA_VERSION,
  id: 'experiment:evolution-replicate-statistics-v1',
  exactTrialLimit: 0,
  acceleration: 'exact-sparse-binomial-v1',
  maximumExpectedAcceleratedDraws: 128,
  maximumAcceleratedDraws: 512,
})

interface Moments {
  readonly count: number
  readonly mean: number
  readonly variance: number
}

class OnlineMoments {
  private countValue = 0
  private meanValue = 0
  private m2 = 0

  push(value: number): void {
    if (!Number.isFinite(value)) {
      throw new Error('replicate statistic must be finite')
    }
    this.countValue += 1
    const delta = value - this.meanValue
    this.meanValue += delta / this.countValue
    const delta2 = value - this.meanValue
    this.m2 += delta * delta2
  }

  snapshot(): Moments {
    return Object.freeze({
      count: this.countValue,
      mean: this.meanValue,
      variance:
        this.countValue > 1 ? this.m2 / (this.countValue - 1) : 0,
    })
  }
}

function parseReplicates(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_REPLICATES
  const value = Number(raw)
  if (
    !Number.isSafeInteger(value) ||
    value < MIN_REPLICATES ||
    value > MAX_REPLICATES
  ) {
    throw new Error(
      `PETRA_EVOLUTION_REPLICATES must be an integer in [${MIN_REPLICATES}, ${MAX_REPLICATES}]`,
    )
  }
  return value
}

function binomialUpperTail(
  trials: number,
  probability: number,
  threshold: number,
): number {
  if (
    !Number.isSafeInteger(trials) ||
    trials < 0 ||
    !Number.isFinite(probability) ||
    probability <= 0 ||
    probability >= 1 ||
    !Number.isSafeInteger(threshold) ||
    threshold < 1
  ) {
    throw new Error('invalid binomial-tail arguments')
  }

  let probabilityMass = Math.pow(1 - probability, trials)
  let lowerCdf = probabilityMass

  for (let count = 1; count < threshold; count += 1) {
    probabilityMass *=
      ((trials - count + 1) / count) *
      (probability / (1 - probability))
    lowerCdf += probabilityMass
  }

  return Math.max(0, Math.min(1, 1 - lowerCdf))
}

function writeCompactResult(result: unknown): void {
  const output = process.env.PETRA_LOCAL_RESULT_JSON
  if (output === undefined || output.trim() === '') return

  mkdirSync(dirname(output), { recursive: true })
  const temporary = `${output}.tmp`
  writeFileSync(
    temporary,
    JSON.stringify(result, null, 2) + '\n',
    'utf8',
  )
  renameSync(temporary, output)
}

function within(value: number, expected: number, tolerance: number): boolean {
  return Math.abs(value - expected) <= tolerance
}

describe.sequential('evolution replicate statistics local experiment', () => {
  it('compares accelerated mutation counts with the exact multinomial reference law', () => {
    const startedAt = new Date().toISOString()
    const replicates = parseReplicates(process.env.PETRA_EVOLUTION_REPLICATES)
    const policyIdentity = samplingExecutionPolicyIdentity(ACCELERATED_POLICY)

    const exactMoments = TARGETS.map(() => new OnlineMoments())
    const acceleratedMoments = TARGETS.map(() => new OnlineMoments())
    const exactTail = { count: 0 }
    const acceleratedTail = { count: 0 }
    const acceleratedDraws = new OnlineMoments()
    let minimumAcceleratedDraws = Number.POSITIVE_INFINITY
    let maximumAcceleratedDraws = 0

    try {
      for (let replicate = 0; replicate < replicates; replicate += 1) {
        const seed = replicate + 1
        const exact = sampleDivisionMutations(
          DIVISION_OPPORTUNITIES,
          TARGETS,
          new SimulationRng(seed),
        )
        const accelerated = sampleDivisionMutationsWithPolicy(
          DIVISION_OPPORTUNITIES,
          TARGETS,
          new SimulationRng(seed),
          ACCELERATED_POLICY,
        )

        assert.equal(
          accelerated.diagnostics.mode,
          'exact-sparse-multinomial',
          'configured accelerated policy must exercise the accelerated exact path',
        )
        assert.equal(
          accelerated.diagnostics.policyIdentity,
          policyIdentity,
          'sampler policy identity must remain stable across replicates',
        )

        const exactTotal = exact.reduce((sum, item) => sum + item.count, 0)
        const acceleratedTotal = accelerated.counts.reduce(
          (sum, item) => sum + item.count,
          0,
        )
        assert.ok(exactTotal <= DIVISION_OPPORTUNITIES)
        assert.ok(acceleratedTotal <= DIVISION_OPPORTUNITIES)

        for (let index = 0; index < TARGETS.length; index += 1) {
          exactMoments[index]!.push(exact[index]!.count)
          acceleratedMoments[index]!.push(accelerated.counts[index]!.count)
        }

        if (exact[0]!.count >= RARE_TAIL_THRESHOLD) exactTail.count += 1
        if (accelerated.counts[0]!.count >= RARE_TAIL_THRESHOLD) {
          acceleratedTail.count += 1
        }

        acceleratedDraws.push(accelerated.diagnostics.rngDraws)
        minimumAcceleratedDraws = Math.min(
          minimumAcceleratedDraws,
          accelerated.diagnostics.rngDraws,
        )
        maximumAcceleratedDraws = Math.max(
          maximumAcceleratedDraws,
          accelerated.diagnostics.rngDraws,
        )
      }

      const targetEvidence = TARGETS.map((target, index) => {
        const expectedMean =
          DIVISION_OPPORTUNITIES * target.probabilityPerDivision
        const expectedVariance =
          DIVISION_OPPORTUNITIES *
          target.probabilityPerDivision *
          (1 - target.probabilityPerDivision)
        const exact = exactMoments[index]!.snapshot()
        const accelerated = acceleratedMoments[index]!.snapshot()

        // Ten standard errors on the mean plus a tiny numerical floor makes
        // this a robust deterministic evidence gate rather than a lucky-seed
        // contest. Variance is checked with a deliberately broad 20% envelope.
        const meanTolerance =
          10 * Math.sqrt(expectedVariance / replicates) + 1 / replicates
        const varianceTolerance =
          Math.max(0.2 * expectedVariance, 0.02)

        return Object.freeze({
          genotype_id: target.genotypeId,
          probability_per_division: target.probabilityPerDivision,
          expected_mean: expectedMean,
          expected_variance: expectedVariance,
          mean_tolerance: meanTolerance,
          variance_tolerance: varianceTolerance,
          exact: {
            mean: exact.mean,
            variance: exact.variance,
            mean_within_gate: within(
              exact.mean,
              expectedMean,
              meanTolerance,
            ),
            variance_within_gate: within(
              exact.variance,
              expectedVariance,
              varianceTolerance,
            ),
          },
          accelerated: {
            mean: accelerated.mean,
            variance: accelerated.variance,
            mean_within_gate: within(
              accelerated.mean,
              expectedMean,
              meanTolerance,
            ),
            variance_within_gate: within(
              accelerated.variance,
              expectedVariance,
              varianceTolerance,
            ),
          },
          exact_vs_accelerated_mean_delta: Math.abs(
            exact.mean - accelerated.mean,
          ),
        })
      })

      const theoreticalRareTail = binomialUpperTail(
        DIVISION_OPPORTUNITIES,
        TARGETS[0]!.probabilityPerDivision,
        RARE_TAIL_THRESHOLD,
      )
      const exactRareTail = exactTail.count / replicates
      const acceleratedRareTail = acceleratedTail.count / replicates
      const rareTailTolerance =
        10 *
          Math.sqrt(
            (theoreticalRareTail * (1 - theoreticalRareTail)) / replicates,
          ) +
        1 / replicates

      const exactReplaySeed = 0x5eed1234
      const exactReplayA = sampleDivisionMutations(
        DIVISION_OPPORTUNITIES,
        TARGETS,
        new SimulationRng(exactReplaySeed),
      )
      const exactReplayB = sampleDivisionMutations(
        DIVISION_OPPORTUNITIES,
        TARGETS,
        new SimulationRng(exactReplaySeed),
      )
      assert.deepStrictEqual(exactReplayA, exactReplayB)

      const acceleratedReplayA = sampleDivisionMutationsWithPolicy(
        DIVISION_OPPORTUNITIES,
        TARGETS,
        new SimulationRng(exactReplaySeed),
        ACCELERATED_POLICY,
      )
      const acceleratedReplayB = sampleDivisionMutationsWithPolicy(
        DIVISION_OPPORTUNITIES,
        TARGETS,
        new SimulationRng(exactReplaySeed),
        ACCELERATED_POLICY,
      )
      assert.deepStrictEqual(acceleratedReplayA, acceleratedReplayB)

      const allMarginalsWithinGate = targetEvidence.every(
        (target) =>
          target.exact.mean_within_gate &&
          target.exact.variance_within_gate &&
          target.accelerated.mean_within_gate &&
          target.accelerated.variance_within_gate,
      )
      const exactRareTailWithinGate = within(
        exactRareTail,
        theoreticalRareTail,
        rareTailTolerance,
      )
      const acceleratedRareTailWithinGate = within(
        acceleratedRareTail,
        theoreticalRareTail,
        rareTailTolerance,
      )
      const acceleratedWorkBounded =
        Number.isFinite(minimumAcceleratedDraws) &&
        maximumAcceleratedDraws < DIVISION_OPPORTUNITIES

      assert.ok(
        allMarginalsWithinGate,
        'exact and accelerated marginal means/variances must agree with the exact multinomial law',
      )
      assert.ok(
        exactRareTailWithinGate && acceleratedRareTailWithinGate,
        'exact and accelerated rare-event tails must agree with the exact binomial marginal law',
      )
      assert.ok(
        acceleratedWorkBounded,
        'accelerated exact sampling must use fewer RNG draws than the trial-by-trial reference fixture',
      )

      const compactResult = {
        schema_version: 1,
        experiment_id: EXPERIMENT_ID,
        status: 'passed',
        started_at_utc: startedAt,
        completed_at_utc: new Date().toISOString(),
        local_run_id: process.env.PETRA_LOCAL_RUN_ID ?? null,
        classification:
          'numerical sampler validation; synthetic probabilities, not biological mutation-rate evidence',
        profile: {
          replicates,
          deterministic_seed_family: 'uint32 seeds 1..replicates',
          division_opportunities_per_replicate: DIVISION_OPPORTUNITIES,
          targets: TARGETS,
          accelerated_policy: ACCELERATED_POLICY,
          accelerated_policy_identity: policyIdentity,
        },
        marginal_distribution_evidence: targetEvidence,
        rare_event_tail: {
          genotype_id: TARGETS[0]!.genotypeId,
          threshold_count_at_least: RARE_TAIL_THRESHOLD,
          theoretical_probability: theoreticalRareTail,
          exact_probability: exactRareTail,
          accelerated_probability: acceleratedRareTail,
          tolerance: rareTailTolerance,
          exact_within_gate: exactRareTailWithinGate,
          accelerated_within_gate: acceleratedRareTailWithinGate,
        },
        accelerated_rng_draws: {
          ...acceleratedDraws.snapshot(),
          minimum: minimumAcceleratedDraws,
          maximum: maximumAcceleratedDraws,
          exact_reference_draws_per_replicate: DIVISION_OPPORTUNITIES,
        },
        acceptance: {
          all_marginal_means_and_variances_within_gate:
            allMarginalsWithinGate,
          exact_rare_tail_within_gate: exactRareTailWithinGate,
          accelerated_rare_tail_within_gate:
            acceleratedRareTailWithinGate,
          exact_fixed_seed_replay: true,
          accelerated_fixed_seed_replay: true,
          accelerated_rng_work_below_reference_fixture:
            acceleratedWorkBounded,
        },
        limitations: [
          'The probabilities in this experiment are synthetic numerical fixtures and are not biological mutation-rate claims.',
          'This validates the exact-sparse accelerated sampler against the exact multinomial reference law; it does not establish end-to-end composed lineage emergence.',
          'Authoritative child-lineage biomass/state integration remains owned by #5/#37 and must be validated separately after that composition lands.',
          'The experiment does not infer mutation probability from ciprofloxacin or any other selective pressure.',
        ],
      }

      writeCompactResult(compactResult)

      expect(allMarginalsWithinGate).toBe(true)
      expect(exactRareTailWithinGate).toBe(true)
      expect(acceleratedRareTailWithinGate).toBe(true)
      expect(acceleratedWorkBounded).toBe(true)
    } catch (error) {
      writeCompactResult({
        schema_version: 1,
        experiment_id: EXPERIMENT_ID,
        status: 'failed',
        started_at_utc: startedAt,
        completed_at_utc: new Date().toISOString(),
        local_run_id: process.env.PETRA_LOCAL_RUN_ID ?? null,
        profile: {
          replicates,
          division_opportunities_per_replicate: DIVISION_OPPORTUNITIES,
          targets: TARGETS,
          accelerated_policy: ACCELERATED_POLICY,
          accelerated_policy_identity: policyIdentity,
        },
        failure: {
          name: error instanceof Error ? error.name : 'UnknownError',
          message: error instanceof Error ? error.message : String(error),
        },
        limitations: [
          'Failure is numerical sampler-validation evidence only; no biological mutation-rate conclusion follows from this fixture.',
        ],
      })
      throw error
    }
  })
})
