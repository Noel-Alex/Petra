import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  resolveProductiveInfections,
} from '../src/sim/phage/infectionPolicy'
import {
  DETERMINISTIC_RESIDUAL_BURST_POLICY,
} from '../src/sim/phage/burstPolicy'
import {
  createPhageLysisTransactionState,
  applyPhageLysisTransaction,
  type PhageLysisTransactionState,
} from '../src/sim/phage/lysisTransaction'
import {
  createPhageLifeHistoryIdentity,
  resolvePhageLifeHistory,
  T4_MG1655_LIFE_HISTORY,
  type InDomainPhageLifeHistoryResolution,
} from '../src/sim/phage/lifeHistory'
import {
  scheduleLatentInfections,
} from '../src/sim/phage/latentQueue'
import {
  sampleAdsorbedPfuWithPolicy,
  sampleExactAdsorbedPfu,
} from '../src/sim/phage/unitBridge'
import { SimulationRng } from '../src/sim/rng'
import {
  SAMPLING_EXECUTION_POLICY_SCHEMA_VERSION,
  samplingExecutionPolicyIdentity,
  type SamplingExecutionPolicy,
} from '../src/sim/samplingPolicy'

const EXPERIMENT_ID = 'phage-mechanism-statistics'
const DEFAULT_REPLICATES = 4096
const MIN_REPLICATES = 1024
const MAX_REPLICATES = 100_000
const SEED_BASE = 0x5048_4147
const SIGMA_MULTIPLIER = 6

const NUMERICAL_ADSORPTION_FIXTURE = Object.freeze({
  classification: 'numerical-binomial-fixture' as const,
  freePfu: 32,
  adsorptionProbability: 1 / 16,
  tailAtLeastAdsorbedPfu: 5,
  limitation:
    'The probability is a numerical sampler fixture, not a calibrated Petra phage adsorption probability or biological parameter.',
})

const SAMPLING_POLICY = Object.freeze({
  schemaVersion: SAMPLING_EXECUTION_POLICY_SCHEMA_VERSION,
  id: 'phage-mechanism-statistics/exact-sparse-binomial-v1',
  exactTrialLimit: 8,
  acceleration: 'exact-sparse-binomial-v1',
  maximumExpectedAcceleratedDraws: 32,
  maximumAcceleratedDraws: 128,
} satisfies SamplingExecutionPolicy)

interface AcceptanceWindow {
  readonly observed: number
  readonly expected: number
  readonly variance: number
  readonly sigma: number
  readonly allowedAbsoluteError: number
  readonly absoluteError: number
  readonly passed: boolean
}

interface SamplerSummary {
  readonly totalAdsorbedPfu: number
  readonly zeroAdsorptionReplicates: number
  readonly tailReplicates: number
  readonly minimumAdsorbedPfu: number
  readonly maximumAdsorbedPfu: number
  readonly acceptance: Readonly<{
    readonly totalCount: AcceptanceWindow
    readonly zeroEventCount: AcceptanceWindow
    readonly tailEventCount: AcceptanceWindow
  }>
}

function parseReplicates(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_REPLICATES

  const value = Number(raw)
  if (
    !Number.isSafeInteger(value) ||
    value < MIN_REPLICATES ||
    value > MAX_REPLICATES
  ) {
    throw new RangeError(
      `PETRA_PHAGE_STAT_REPLICATES must be an integer in [${MIN_REPLICATES}, ${MAX_REPLICATES}]`,
    )
  }
  return value
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

function acceptanceWindow(
  observed: number,
  expected: number,
  variance: number,
): AcceptanceWindow {
  if (!Number.isFinite(expected) || expected < 0) {
    throw new RangeError('acceptance expected value must be finite and non-negative')
  }
  if (!Number.isFinite(variance) || variance < 0) {
    throw new RangeError('acceptance variance must be finite and non-negative')
  }

  const sigma = Math.sqrt(variance)
  const allowedAbsoluteError =
    sigma === 0 ? 0 : Math.max(1, SIGMA_MULTIPLIER * sigma)
  const absoluteError = Math.abs(observed - expected)
  return {
    observed,
    expected,
    variance,
    sigma,
    allowedAbsoluteError,
    absoluteError,
    passed: absoluteError <= allowedAbsoluteError,
  }
}

function binomialCoefficient(n: number, k: number): number {
  if (
    !Number.isSafeInteger(n) ||
    !Number.isSafeInteger(k) ||
    n < 0 ||
    k < 0 ||
    k > n
  ) {
    throw new RangeError('binomial coefficient requires 0 <= k <= n')
  }

  const reducedK = Math.min(k, n - k)
  let result = 1
  for (let index = 1; index <= reducedK; index += 1) {
    result *= (n - reducedK + index) / index
  }
  return result
}

function binomialProbability(n: number, p: number, k: number): number {
  if (!Number.isFinite(p) || p < 0 || p > 1) {
    throw new RangeError('binomial probability requires p in [0, 1]')
  }
  return (
    binomialCoefficient(n, k) *
    p ** k *
    (1 - p) ** (n - k)
  )
}

function binomialTailProbability(
  n: number,
  p: number,
  atLeast: number,
): number {
  let probability = 0
  for (let count = atLeast; count <= n; count += 1) {
    probability += binomialProbability(n, p, count)
  }
  return probability
}

function summarizeSampler(
  counts: readonly number[],
  replicates: number,
): SamplerSummary {
  const { freePfu, adsorptionProbability, tailAtLeastAdsorbedPfu } =
    NUMERICAL_ADSORPTION_FIXTURE
  assert.equal(counts.length, replicates)

  let totalAdsorbedPfu = 0
  let zeroAdsorptionReplicates = 0
  let tailReplicates = 0
  let minimumAdsorbedPfu = Number.POSITIVE_INFINITY
  let maximumAdsorbedPfu = Number.NEGATIVE_INFINITY

  for (const count of counts) {
    assert.ok(Number.isSafeInteger(count))
    assert.ok(count >= 0 && count <= freePfu)
    totalAdsorbedPfu += count
    if (count === 0) zeroAdsorptionReplicates += 1
    if (count >= tailAtLeastAdsorbedPfu) tailReplicates += 1
    minimumAdsorbedPfu = Math.min(minimumAdsorbedPfu, count)
    maximumAdsorbedPfu = Math.max(maximumAdsorbedPfu, count)
  }

  const totalTrials = replicates * freePfu
  const expectedTotal = totalTrials * adsorptionProbability
  const totalVariance =
    totalTrials * adsorptionProbability * (1 - adsorptionProbability)

  const zeroProbability = (1 - adsorptionProbability) ** freePfu
  const zeroExpected = replicates * zeroProbability
  const zeroVariance =
    replicates * zeroProbability * (1 - zeroProbability)

  const tailProbability = binomialTailProbability(
    freePfu,
    adsorptionProbability,
    tailAtLeastAdsorbedPfu,
  )
  const tailExpected = replicates * tailProbability
  const tailVariance =
    replicates * tailProbability * (1 - tailProbability)

  return {
    totalAdsorbedPfu,
    zeroAdsorptionReplicates,
    tailReplicates,
    minimumAdsorbedPfu,
    maximumAdsorbedPfu,
    acceptance: {
      totalCount: acceptanceWindow(
        totalAdsorbedPfu,
        expectedTotal,
        totalVariance,
      ),
      zeroEventCount: acceptanceWindow(
        zeroAdsorptionReplicates,
        zeroExpected,
        zeroVariance,
      ),
      tailEventCount: acceptanceWindow(
        tailReplicates,
        tailExpected,
        tailVariance,
      ),
    },
  }
}

function samplerAccepted(summary: SamplerSummary): boolean {
  return Object.values(summary.acceptance).every((window) => window.passed)
}

function runAdsorptionStatistics(replicates: number): {
  readonly exactReference: SamplerSummary
  readonly acceleratedExact: SamplerSummary
  readonly sampleDigestSha256: string
  readonly acceleratedMaximumRngDraws: number
  readonly edgeProbabilitiesExact: boolean
} {
  const exactCounts: number[] = []
  const acceleratedCounts: number[] = []
  const digest = createHash('sha256')
  let acceleratedMaximumRngDraws = 0

  for (let index = 0; index < replicates; index += 1) {
    const seed = SEED_BASE + index
    const exact = sampleExactAdsorbedPfu(
      NUMERICAL_ADSORPTION_FIXTURE.freePfu,
      NUMERICAL_ADSORPTION_FIXTURE.adsorptionProbability,
      new SimulationRng(seed),
    )
    const accelerated = sampleAdsorbedPfuWithPolicy(
      NUMERICAL_ADSORPTION_FIXTURE.freePfu,
      NUMERICAL_ADSORPTION_FIXTURE.adsorptionProbability,
      new SimulationRng(seed),
      SAMPLING_POLICY,
    )

    assert.equal(
      accelerated.diagnostics.mode,
      'exact-sparse-binomial',
      'numerical fixture must exercise the bounded accelerated exact sampler',
    )
    assert.equal(
      accelerated.diagnostics.policyIdentity,
      samplingExecutionPolicyIdentity(SAMPLING_POLICY),
    )

    exactCounts.push(exact)
    acceleratedCounts.push(accelerated.adsorbedPfu)
    acceleratedMaximumRngDraws = Math.max(
      acceleratedMaximumRngDraws,
      accelerated.diagnostics.rngDraws,
    )
    digest.update(`${seed}:${exact}:${accelerated.adsorbedPfu}\n`)
  }

  const edgeZero = sampleAdsorbedPfuWithPolicy(
    NUMERICAL_ADSORPTION_FIXTURE.freePfu,
    0,
    new SimulationRng(SEED_BASE),
    SAMPLING_POLICY,
  ).adsorbedPfu
  const edgeOne = sampleAdsorbedPfuWithPolicy(
    NUMERICAL_ADSORPTION_FIXTURE.freePfu,
    1,
    new SimulationRng(SEED_BASE),
    SAMPLING_POLICY,
  ).adsorbedPfu

  return {
    exactReference: summarizeSampler(exactCounts, replicates),
    acceleratedExact: summarizeSampler(acceleratedCounts, replicates),
    sampleDigestSha256: digest.digest('hex'),
    acceleratedMaximumRngDraws,
    edgeProbabilitiesExact:
      edgeZero === 0 && edgeOne === NUMERICAL_ADSORPTION_FIXTURE.freePfu,
  }
}

function exactMeasuredResolution(): InDomainPhageLifeHistoryResolution {
  const row = T4_MG1655_LIFE_HISTORY.rows[0]
  if (row === undefined) {
    throw new Error('T4/MG1655 source pack has no measured life-history row')
  }

  const resolution = resolvePhageLifeHistory(
    T4_MG1655_LIFE_HISTORY,
    row.growthRatePerHour,
  )
  if (resolution.status !== 'exact') {
    throw new Error('expected first T4/MG1655 source row to resolve exactly')
  }
  return resolution
}

function derivedMidpointResolution(): InDomainPhageLifeHistoryResolution {
  const lower = T4_MG1655_LIFE_HISTORY.rows[0]
  const upper = T4_MG1655_LIFE_HISTORY.rows[1]
  if (lower === undefined || upper === undefined) {
    throw new Error('T4/MG1655 source pack requires two rows for midpoint check')
  }

  const midpoint =
    (lower.growthRatePerHour + upper.growthRatePerHour) / 2
  const resolution = resolvePhageLifeHistory(
    T4_MG1655_LIFE_HISTORY,
    midpoint,
  )
  if (resolution.status !== 'interpolated') {
    throw new Error('expected in-domain midpoint to resolve as derived interpolation')
  }
  return resolution
}

function scheduleTransactionCohort(
  state: PhageLysisTransactionState,
  resolution: InDomainPhageLifeHistoryResolution,
  infectionCount: number,
  infectedAtMinutes: number,
): PhageLysisTransactionState {
  return {
    ...state,
    latentQueue: scheduleLatentInfections(state.latentQueue, {
      infectionCount,
      infectedAtMinutes,
      lifeHistoryIdentity: createPhageLifeHistoryIdentity(resolution),
    }),
  }
}

function runMechanismChainChecks(): {
  readonly productiveInfection: Readonly<{
    readonly adsorbedPfu: number
    readonly susceptibleHostOpportunities: number
    readonly productiveInfections: number
    readonly nonProductiveAdsorptions: number
    readonly policyIdentity: string
  }>
  readonly measuredLifeHistory: Readonly<{
    readonly sourceDoi: string
    readonly growthRatePerHour: number
    readonly status: string
    readonly latentPeriodMinutes: number
    readonly burstSizePfuPerCell: number
    readonly preLatencyReleasedPfu: number
    readonly lysisHostDecrementCount: number
    readonly releasedPfu: number
    readonly residualExpectedPfu: number
  }>
  readonly derivedResidualCarry: Readonly<{
    readonly growthRatePerHour: number
    readonly status: string
    readonly sourceBracketGrowthRatesPerHour: readonly number[]
    readonly burstSizePfuPerCell: number
    readonly cohortReleasedPfu: readonly number[]
    readonly totalReleasedPfu: number
    readonly finalResidualExpectedPfu: number
  }>
} {
  const productive = resolveProductiveInfections({
    adsorbedPfu: 17,
    susceptibleHostOpportunities: 5,
  })
  assert.equal(productive.productiveInfections, 5)
  assert.equal(productive.nonProductiveAdsorptions, 12)

  const measured = exactMeasuredResolution()
  const measuredIdentity = createPhageLifeHistoryIdentity(measured)
  let measuredState = createPhageLysisTransactionState(
    DETERMINISTIC_RESIDUAL_BURST_POLICY,
  )
  measuredState = scheduleTransactionCohort(
    measuredState,
    measured,
    3,
    0,
  )

  const justBeforeLysis = applyPhageLysisTransaction(
    DETERMINISTIC_RESIDUAL_BURST_POLICY,
    measuredState,
    {
      throughMinutes: measured.values.latentPeriodMinutes - 0.001,
      lifeHistories: [measured],
    },
  )
  assert.equal(justBeforeLysis.hostDecrementCount, 0)
  assert.equal(justBeforeLysis.releasedPfu, 0)
  assert.equal(justBeforeLysis.state.latentQueue.cohorts.length, 1)

  const atLysis = applyPhageLysisTransaction(
    DETERMINISTIC_RESIDUAL_BURST_POLICY,
    justBeforeLysis.state,
    {
      throughMinutes: measured.values.latentPeriodMinutes,
      lifeHistories: [measured],
    },
  )
  assert.equal(atLysis.hostDecrementCount, 3)
  assert.equal(
    atLysis.releasedPfu,
    3 * measured.values.burstSizePfuPerCell,
  )
  assert.equal(atLysis.state.burstPolicyState.residualExpectedPfu, 0)

  const derived = derivedMidpointResolution()
  let derivedState = createPhageLysisTransactionState(
    DETERMINISTIC_RESIDUAL_BURST_POLICY,
  )
  derivedState = scheduleTransactionCohort(derivedState, derived, 1, 0)
  derivedState = scheduleTransactionCohort(derivedState, derived, 1, 0)

  const derivedLysis = applyPhageLysisTransaction(
    DETERMINISTIC_RESIDUAL_BURST_POLICY,
    derivedState,
    {
      throughMinutes: derived.values.latentPeriodMinutes,
      lifeHistories: [derived],
    },
  )
  const expectedDerivedPfu = 2 * derived.values.burstSizePfuPerCell
  assert.equal(derivedLysis.hostDecrementCount, 2)
  assert.equal(derivedLysis.releasedPfu, Math.floor(expectedDerivedPfu))
  assert.ok(
    Math.abs(
      derivedLysis.state.burstPolicyState.residualExpectedPfu -
        (expectedDerivedPfu - Math.floor(expectedDerivedPfu)),
    ) < 1e-12,
  )
  assert.deepStrictEqual(
    derivedLysis.lyses.map((lysis) => lysis.burst.releasedPfu),
    [10, 11],
    'source-derived 10.5 PFU/cell expectation must carry 0.5 residual across cohorts',
  )

  return {
    productiveInfection: {
      adsorbedPfu: productive.adsorbedPfu,
      susceptibleHostOpportunities: productive.susceptibleHostOpportunities,
      productiveInfections: productive.productiveInfections,
      nonProductiveAdsorptions: productive.nonProductiveAdsorptions,
      policyIdentity: productive.policyIdentity,
    },
    measuredLifeHistory: {
      sourceDoi: measuredIdentity.sourceDoi,
      growthRatePerHour: measuredIdentity.requestedGrowthRatePerHour,
      status: measuredIdentity.status,
      latentPeriodMinutes: measuredIdentity.latentPeriodMinutes,
      burstSizePfuPerCell: measuredIdentity.burstSizePfuPerCell,
      preLatencyReleasedPfu: justBeforeLysis.releasedPfu,
      lysisHostDecrementCount: atLysis.hostDecrementCount,
      releasedPfu: atLysis.releasedPfu,
      residualExpectedPfu:
        atLysis.state.burstPolicyState.residualExpectedPfu,
    },
    derivedResidualCarry: {
      growthRatePerHour: derived.requestedGrowthRatePerHour,
      status: derived.status,
      sourceBracketGrowthRatesPerHour: derived.sourceRows.map(
        (row) => row.growthRatePerHour,
      ),
      burstSizePfuPerCell: derived.values.burstSizePfuPerCell,
      cohortReleasedPfu: derivedLysis.lyses.map(
        (lysis) => lysis.burst.releasedPfu,
      ),
      totalReleasedPfu: derivedLysis.releasedPfu,
      finalResidualExpectedPfu:
        derivedLysis.state.burstPolicyState.residualExpectedPfu,
    },
  }
}

describe.sequential('phage mechanism statistics prepared local experiment', () => {
  it('records many-seed sampler controls and source-bound latent/lysis invariants', () => {
    const replicates = parseReplicates(
      process.env.PETRA_PHAGE_STAT_REPLICATES,
    )
    const startedAt = new Date().toISOString()

    try {
      const adsorption = runAdsorptionStatistics(replicates)
      const mechanism = runMechanismChainChecks()

      assert.ok(
        samplerAccepted(adsorption.exactReference),
        'trial-by-trial exact adsorption sampler must remain within the declared Binomial acceptance windows',
      )
      assert.ok(
        samplerAccepted(adsorption.acceleratedExact),
        'bounded accelerated adsorption sampler must remain within the declared Binomial acceptance windows',
      )
      assert.equal(adsorption.edgeProbabilitiesExact, true)

      const compactResult = {
        schema_version: 1,
        experiment_id: EXPERIMENT_ID,
        status: 'passed',
        started_at_utc: startedAt,
        completed_at_utc: new Date().toISOString(),
        local_run_id: process.env.PETRA_LOCAL_RUN_ID ?? null,
        preparation_issue: 752,
        final_activation_blocker: 283,
        profile: {
          replicates,
          seed_base_uint32: SEED_BASE,
          sampling_policy_identity:
            samplingExecutionPolicyIdentity(SAMPLING_POLICY),
          acceptance_policy: {
            kind: 'exact-binomial-model-window',
            sigma_multiplier: SIGMA_MULTIPLIER,
            checks: [
              'aggregate adsorbed PFU count',
              'zero-adsorption replicate count',
              `replicates with at least ${NUMERICAL_ADSORPTION_FIXTURE.tailAtLeastAdsorbedPfu} adsorbed PFU`,
            ],
          },
          adsorption_fixture: NUMERICAL_ADSORPTION_FIXTURE,
        },
        adsorption: {
          exact_reference: adsorption.exactReference,
          accelerated_exact: adsorption.acceleratedExact,
          edge_probabilities_exact: adsorption.edgeProbabilitiesExact,
          accelerated_maximum_rng_draws:
            adsorption.acceleratedMaximumRngDraws,
          sample_digest_sha256: adsorption.sampleDigestSha256,
        },
        mechanism,
        acceptance: {
          exact_reference_matches_binomial_model:
            samplerAccepted(adsorption.exactReference),
          accelerated_sampler_matches_binomial_model:
            samplerAccepted(adsorption.acceleratedExact),
          probability_zero_and_one_are_exact:
            adsorption.edgeProbabilitiesExact,
          productive_infection_saturates_at_discrete_hosts:
            mechanism.productiveInfection.productiveInfections ===
              mechanism.productiveInfection.susceptibleHostOpportunities &&
            mechanism.productiveInfection.nonProductiveAdsorptions === 12,
          no_release_before_source_backed_latent_delay:
            mechanism.measuredLifeHistory.preLatencyReleasedPfu === 0,
          measured_row_lysis_decrements_hosts_once:
            mechanism.measuredLifeHistory.lysisHostDecrementCount === 3,
          deterministic_burst_residual_carry_preserved:
            mechanism.derivedResidualCarry.cohortReleasedPfu[0] === 10 &&
            mechanism.derivedResidualCarry.cohortReleasedPfu[1] === 11 &&
            mechanism.derivedResidualCarry.finalResidualExpectedPfu === 0,
        },
        limitations: [
          'The adsorption probability is a numerical Binomial sampler fixture, not a biological calibration or a claim about T4/MG1655 adsorption in Petra space.',
          'The source-backed T4/MG1655 life-history checks exercise pure latent/lysis bookkeeping. They do not validate composed spatial infection, host removal, phage placement/transport, or checkpoint integration.',
          'The productive-infection saturation example is a discrete numerical contract check for the reviewed mechanistic-approximation policy, not an experimentally measured productive-entry efficiency.',
          'The burst policy intentionally adds no stochastic individual-burst distribution; source measured mean/SD remain distinct from Petra deterministic discretization.',
          'The stable local experiment registration must remain blocked on #283 until composed spatial phage state and replay/checkpoint authority are integrated and added to this harness.',
        ],
      }

      writeCompactResult(compactResult)

      expect(Object.values(compactResult.acceptance).every(Boolean)).toBe(true)
    } catch (error) {
      writeCompactResult({
        schema_version: 1,
        experiment_id: EXPERIMENT_ID,
        status: 'failed',
        started_at_utc: startedAt,
        completed_at_utc: new Date().toISOString(),
        local_run_id: process.env.PETRA_LOCAL_RUN_ID ?? null,
        preparation_issue: 752,
        final_activation_blocker: 283,
        failure: {
          name: error instanceof Error ? error.name : 'UnknownError',
          message: error instanceof Error ? error.message : String(error),
        },
      })
      throw error
    }
  })
})
