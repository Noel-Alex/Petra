import { SimulationRng } from '../rng'

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
