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

export interface MutationTarget {
  readonly genotypeId: string
  /** Probability that one division produces this mutually-exclusive child class. */
  readonly probabilityPerDivision: number
}

export interface MutationCount {
  readonly genotypeId: string
  readonly count: number
}

function assertDivisionCount(divisions: number): void {
  if (!Number.isSafeInteger(divisions) || divisions < 0) {
    throw new Error('divisions must be a non-negative safe integer')
  }
}

function assertTargets(targets: readonly MutationTarget[]): void {
  const ids = new Set<string>()
  let total = 0
  for (const target of targets) {
    if (!target.genotypeId || ids.has(target.genotypeId)) {
      throw new Error('mutation target genotype IDs must be non-empty and unique')
    }
    ids.add(target.genotypeId)
    if (!Number.isFinite(target.probabilityPerDivision) || target.probabilityPerDivision < 0 || target.probabilityPerDivision > 1) {
      throw new Error('mutation probabilities must be finite values in [0, 1]')
    }
    total += target.probabilityPerDivision
  }
  if (total > 1 + Number.EPSILON) {
    throw new Error('mutually-exclusive mutation probabilities cannot sum above 1')
  }
}

/**
 * Samples mutually-exclusive mutation classes from actual division events.
 *
 * This exact categorical path is intentionally simple and bounded: every
 * division consumes at most one mutation outcome, so mutant births can never
 * exceed births. It is the reference path against which a future accelerated
 * binomial/multinomial implementation can be validated.
 *
 * Probabilities are scenario-owned inputs. This function does not infer or
 * modify them from antibiotic concentration or any other selective pressure.
 */
export function sampleDivisionMutations(
  divisions: number,
  targets: readonly MutationTarget[],
  rng: SimulationRng,
): MutationCount[] {
  assertDivisionCount(divisions)
  assertTargets(targets)

  const counts = targets.map(() => 0)
  if (divisions === 0 || targets.length === 0) {
    return targets.map((target) => ({ genotypeId: target.genotypeId, count: 0 }))
  }

  const cumulative: number[] = []
  let sum = 0
  for (const target of targets) {
    sum += target.probabilityPerDivision
    cumulative.push(sum)
  }

  for (let division = 0; division < divisions; division += 1) {
    const draw = rng.nextFloat()
    for (let targetIndex = 0; targetIndex < cumulative.length; targetIndex += 1) {
      if (draw < cumulative[targetIndex]!) {
        counts[targetIndex] = counts[targetIndex]! + 1
        break
      }
    }
  }

  return targets.map((target, index) => ({ genotypeId: target.genotypeId, count: counts[index]! }))
}


export type MutationSamplingMode =
  | 'exact-reference'
  | 'exact-sparse-multinomial'

export interface MutationSamplingDiagnostics {
  readonly mode: MutationSamplingMode
  readonly policyIdentity: string
  readonly rngDraws: number
}

export interface MutationSamplingResult {
  readonly counts: readonly MutationCount[]
  readonly diagnostics: MutationSamplingDiagnostics
}

/**
 * Policy-bounded mutation sampling for product/runtime callers.
 *
 * Small counts use the trial-by-trial reference path unchanged. Large counts
 * use a sequence of exact binomial conditionals, which is exactly multinomial
 * for the supplied mutually-exclusive target probabilities. No probability is
 * approximated or retuned.
 */
export function sampleDivisionMutationsWithPolicy(
  divisions: number,
  targets: readonly MutationTarget[],
  rng: SimulationRng,
  policy: SamplingExecutionPolicy,
): MutationSamplingResult {
  assertDivisionCount(divisions)
  assertTargets(targets)
  validateSamplingExecutionPolicy(policy)
  const policyIdentity = samplingExecutionPolicyIdentity(policy)

  if (divisions <= policy.exactTrialLimit) {
    return {
      counts: sampleDivisionMutations(divisions, targets, rng),
      diagnostics: {
        mode: 'exact-reference',
        policyIdentity,
        rngDraws: divisions === 0 || targets.length === 0 ? 0 : divisions,
      },
    }
  }

  const conditionals = conditionalMutationProbabilities(targets)
  const expectedDraws = conditionals.reduce(
    (sum, probability) =>
      sum + expectedSparseBinomialDraws(divisions, probability),
    0,
  )
  requireAcceleratedSampling(divisions, expectedDraws, policy)

  return runSamplingTransaction(rng, (transactionRng) => {
    const budget = createSamplingDrawBudget(policy)
    const counts: MutationCount[] = []
    let remainingDivisions = divisions

    for (let index = 0; index < targets.length; index += 1) {
      const target = targets[index]!
      const conditionalProbability = conditionals[index]!
      const count = sampleExactSparseBinomial(
        remainingDivisions,
        conditionalProbability,
        transactionRng,
        budget,
        policyIdentity,
      )
      counts.push({ genotypeId: target.genotypeId, count })
      remainingDivisions -= count
    }

    return {
      counts,
      diagnostics: {
        mode: 'exact-sparse-multinomial' as const,
        policyIdentity,
        rngDraws: budget.used,
      },
    }
  })
}

function conditionalMutationProbabilities(
  targets: readonly MutationTarget[],
): number[] {
  const conditionals: number[] = []
  let remainingMass = 1

  for (const target of targets) {
    if (target.probabilityPerDivision === 0) {
      conditionals.push(0)
      continue
    }
    if (remainingMass <= 0) {
      throw new Error('mutation probability mass leaves no remaining outcome')
    }

    const raw = target.probabilityPerDivision / remainingMass
    if (raw > 1 && raw - 1 > Number.EPSILON * 8) {
      throw new Error('conditional mutation probability exceeds one')
    }
    conditionals.push(Math.min(1, raw))
    remainingMass -= target.probabilityPerDivision
    if (Math.abs(remainingMass) <= Number.EPSILON * 8) remainingMass = 0
  }

  return conditionals
}
