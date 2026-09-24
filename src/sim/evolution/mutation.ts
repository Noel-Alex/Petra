import { SimulationRng } from "../rng";
import {
  BOUNDED_HYBRID_BINOMIAL_V1,
  SamplingPolicyRefusal,
  planSamplingExecution,
  requireExactSampling,
  sampleBoundedHybridBinomialV1,
  type SamplingExecutionPolicy,
} from "../samplingPolicy";

export interface MutationTarget {
  readonly genotypeId: string;
  /** Probability that one division produces this mutually-exclusive child class. */
  readonly probabilityPerDivision: number;
}

export interface MutationCount {
  readonly genotypeId: string;
  readonly count: number;
}

export interface MutationSamplingResult {
  readonly counts: readonly MutationCount[];
  readonly execution: "exact" | "accelerated";
  readonly algorithm:
    | "trial-categorical-reference-v1"
    | typeof BOUNDED_HYBRID_BINOMIAL_V1;
  readonly policyIdentity: string;
}

function assertDivisionCount(divisions: number): void {
  if (!Number.isSafeInteger(divisions) || divisions < 0) {
    throw new Error("divisions must be a non-negative safe integer");
  }
}

function assertTargets(targets: readonly MutationTarget[]): void {
  const ids = new Set<string>();
  let total = 0;
  for (const target of targets) {
    if (!target.genotypeId || ids.has(target.genotypeId)) {
      throw new Error(
        "mutation target genotype IDs must be non-empty and unique",
      );
    }
    ids.add(target.genotypeId);
    if (
      !Number.isFinite(target.probabilityPerDivision) ||
      target.probabilityPerDivision < 0 ||
      target.probabilityPerDivision > 1
    ) {
      throw new Error(
        "mutation probabilities must be finite values in [0, 1]",
      );
    }
    total += target.probabilityPerDivision;
  }
  if (total > 1 + Number.EPSILON) {
    throw new Error(
      "mutually-exclusive mutation probabilities cannot sum above 1",
    );
  }
}

/**
 * Exact trial-by-trial categorical reference sampler.
 *
 * Product/runtime callers must supply a versioned execution policy; counts
 * above its categorical exact budget fail closed rather than entering an
 * unbounded O(divisions) loop. Within the exact budget this preserves the
 * original draw order and deterministic replay sequence.
 */
export function sampleDivisionMutations(
  divisions: number,
  targets: readonly MutationTarget[],
  rng: SimulationRng,
  policy: SamplingExecutionPolicy,
): MutationCount[] {
  assertDivisionCount(divisions);
  assertTargets(targets);
  requireExactSampling(divisions, "categorical", policy);

  const counts = targets.map(() => 0);
  if (divisions === 0 || targets.length === 0) {
    return targets.map((target) => ({
      genotypeId: target.genotypeId,
      count: 0,
    }));
  }

  const cumulative: number[] = [];
  let sum = 0;
  for (const target of targets) {
    sum += target.probabilityPerDivision;
    cumulative.push(sum);
  }

  for (let division = 0; division < divisions; division += 1) {
    const draw = rng.nextFloat();
    for (
      let targetIndex = 0;
      targetIndex < cumulative.length;
      targetIndex += 1
    ) {
      if (draw < cumulative[targetIndex]!) {
        counts[targetIndex] = counts[targetIndex]! + 1;
        break;
      }
    }
  }

  return targets.map((target, index) => ({
    genotypeId: target.genotypeId,
    count: counts[index]!,
  }));
}

/**
 * Policy-aware mutation sampler.
 *
 * Accelerated execution uses a sequential conditional-binomial factorization
 * of the categorical/multinomial law. Every target remains mutually exclusive,
 * total mutant births remain <= reviewed division opportunities, and target
 * order stays replay-sensitive. The accelerated RNG stream intentionally
 * differs from trial-by-trial reference sampling and is therefore policy-
 * version/replay identity.
 */
export function sampleDivisionMutationsWithPolicy(
  divisions: number,
  targets: readonly MutationTarget[],
  rng: SimulationRng,
  policy: SamplingExecutionPolicy,
): MutationSamplingResult {
  assertDivisionCount(divisions);
  assertTargets(targets);

  const plan = planSamplingExecution(divisions, "categorical", policy);
  if (plan.status === "refused") {
    throw new SamplingPolicyRefusal({
      workload: plan.workload,
      trialCount: plan.trialCount,
      exactTrialBudget: plan.exactTrialBudget,
      reason: plan.reason,
      policyIdentity: plan.policyIdentity,
    });
  }

  if (plan.status === "exact") {
    return {
      counts: sampleDivisionMutations(divisions, targets, rng, policy),
      execution: "exact",
      algorithm: "trial-categorical-reference-v1",
      policyIdentity: plan.policyIdentity,
    };
  }

  let remainingTrials = divisions;
  let remainingProbabilityMass = 1;
  const counts: MutationCount[] = [];

  for (const target of targets) {
    if (remainingTrials === 0 || target.probabilityPerDivision === 0) {
      counts.push({ genotypeId: target.genotypeId, count: 0 });
      remainingProbabilityMass -= target.probabilityPerDivision;
      continue;
    }

    const conditionalProbability = checkedConditionalProbability(
      target.probabilityPerDivision,
      remainingProbabilityMass,
    );
    const count = sampleBoundedHybridBinomialV1(
      remainingTrials,
      conditionalProbability,
      rng,
    );
    counts.push({ genotypeId: target.genotypeId, count });
    remainingTrials -= count;
    remainingProbabilityMass -= target.probabilityPerDivision;
  }

  return {
    counts,
    execution: "accelerated",
    algorithm: plan.algorithm,
    policyIdentity: plan.policyIdentity,
  };
}

function checkedConditionalProbability(
  targetProbability: number,
  remainingProbabilityMass: number,
): number {
  if (targetProbability === 0) return 0;
  if (
    !Number.isFinite(remainingProbabilityMass) ||
    remainingProbabilityMass <= 0
  ) {
    throw new RangeError(
      "mutation conditional probability has no remaining probability mass",
    );
  }

  const conditional = targetProbability / remainingProbabilityMass;
  if (conditional >= 0 && conditional <= 1) return conditional;

  if (conditional > 1 && conditional <= 1 + 8 * Number.EPSILON) {
    return 1;
  }
  throw new RangeError("mutation conditional probability fell outside [0, 1]");
}
