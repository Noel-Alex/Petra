import { SimulationRng } from '../rng'
import {
  createSamplingDrawBudget,
  expectedSparseBinomialDraws,
  requireAcceleratedSampling,
  runSamplingTransaction,
  sampleExactSparseBinomial,
  samplingExecutionPolicyIdentity,
  validateSamplingExecutionPolicy,
  type SamplingExecutionPolicy,
} from '../samplingPolicy'

export type ConjugationSamplingMode =
  | 'exact-reference'
  | 'exact-sparse-binomial'

export interface ConjugationSamplingDiagnostics {
  readonly mode: ConjugationSamplingMode
  readonly policyIdentity: string
  readonly rngDraws: number
}

export interface ConjugationSamplingResult {
  readonly transferCount: number
  readonly diagnostics: ConjugationSamplingDiagnostics
}

/**
 * Exact reference sampler for one already-authoritative conjugation opportunity
 * batch.
 *
 * `eligibleRecipientCount` must already represent distinct recipients that are
 * eligible for this one transfer channel. The caller owns that biological
 * eligibility/contact definition and the transfer probability. This sampler
 * never derives either quantity from grid distance, renderer glyphs, density,
 * antibiotics, or a named plasmid.
 *
 * Keep this trial-by-trial path for bounded fixtures and distribution
 * validation. Runtime composition with externally supplied large counts must
 * use `sampleConjugationTransfersWithPolicy(...)`.
 */
export function sampleConjugationTransfers(
  eligibleRecipientCount: number,
  transferProbabilityPerEligibleRecipient: number,
  rng: SimulationRng,
): number {
  assertEligibleRecipientCount(eligibleRecipientCount)
  assertTransferProbability(transferProbabilityPerEligibleRecipient)

  let transfers = 0
  for (let recipient = 0; recipient < eligibleRecipientCount; recipient += 1) {
    if (rng.nextFloat() < transferProbabilityPerEligibleRecipient) {
      transfers += 1
    }
  }
  return transfers
}

/**
 * Policy-bounded exact conjugation count sampling.
 *
 * Small opportunity batches replay the reference Bernoulli path exactly.
 * Larger batches use Petra's exact sparse-binomial sampler, not a
 * Poisson/normal approximation. The sampling policy is numerical execution
 * authority and must be included in configuration identity before this helper
 * participates in checkpointed composition.
 *
 * This function intentionally does not define a conjugation law. In
 * particular, a future #551 source-law adapter must establish the exact
 * eligible-recipient set and probability before calling this sampler, and
 * later #552 composition must ensure recipients cannot be double-counted
 * across competing transfer channels.
 */
export function sampleConjugationTransfersWithPolicy(
  eligibleRecipientCount: number,
  transferProbabilityPerEligibleRecipient: number,
  rng: SimulationRng,
  policy: SamplingExecutionPolicy,
): ConjugationSamplingResult {
  assertEligibleRecipientCount(eligibleRecipientCount)
  assertTransferProbability(transferProbabilityPerEligibleRecipient)
  validateSamplingExecutionPolicy(policy)

  const policyIdentity = samplingExecutionPolicyIdentity(policy)

  if (eligibleRecipientCount <= policy.exactTrialLimit) {
    return {
      transferCount: sampleConjugationTransfers(
        eligibleRecipientCount,
        transferProbabilityPerEligibleRecipient,
        rng,
      ),
      diagnostics: {
        mode: 'exact-reference',
        policyIdentity,
        rngDraws: eligibleRecipientCount,
      },
    }
  }

  const expectedDraws = expectedSparseBinomialDraws(
    eligibleRecipientCount,
    transferProbabilityPerEligibleRecipient,
  )
  requireAcceleratedSampling(
    eligibleRecipientCount,
    expectedDraws,
    policy,
  )

  return runSamplingTransaction(rng, (transactionRng) => {
    const budget = createSamplingDrawBudget(policy)
    const transferCount = sampleExactSparseBinomial(
      eligibleRecipientCount,
      transferProbabilityPerEligibleRecipient,
      transactionRng,
      budget,
      policyIdentity,
    )

    return {
      transferCount,
      diagnostics: {
        mode: 'exact-sparse-binomial' as const,
        policyIdentity,
        rngDraws: budget.used,
      },
    }
  })
}

function assertEligibleRecipientCount(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(
      'eligibleRecipientCount must be a non-negative safe integer',
    )
  }
}

function assertTransferProbability(value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(
      'transferProbabilityPerEligibleRecipient must be finite in [0, 1]',
    )
  }
}
