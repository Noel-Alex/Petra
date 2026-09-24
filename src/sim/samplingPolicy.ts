import { SimulationRng } from "./rng";

export const SAMPLING_EXECUTION_POLICY_SCHEMA_VERSION = 1 as const;
export const BOUNDED_HYBRID_BINOMIAL_V1 =
  "bounded-hybrid-binomial-v1" as const;

export type SamplingWorkload = "bernoulli" | "categorical";
export type AcceleratedBinomialPolicy =
  | "disabled"
  | typeof BOUNDED_HYBRID_BINOMIAL_V1;

export interface SamplingExecutionPolicy {
  readonly schemaVersion: typeof SAMPLING_EXECUTION_POLICY_SCHEMA_VERSION;
  readonly id: string;
  readonly exactTrialBudgets: Readonly<Record<SamplingWorkload, number>>;
  readonly acceleratedBinomial: AcceleratedBinomialPolicy;
}

export type SamplingExecutionPlan =
  | {
      readonly status: "exact";
      readonly workload: SamplingWorkload;
      readonly trialCount: number;
      readonly exactTrialBudget: number;
      readonly policyIdentity: string;
    }
  | {
      readonly status: "accelerated";
      readonly workload: SamplingWorkload;
      readonly trialCount: number;
      readonly exactTrialBudget: number;
      readonly algorithm: typeof BOUNDED_HYBRID_BINOMIAL_V1;
      readonly policyIdentity: string;
    }
  | {
      readonly status: "refused";
      readonly workload: SamplingWorkload;
      readonly trialCount: number;
      readonly exactTrialBudget: number;
      readonly reason: "exact-budget-exceeded";
      readonly policyIdentity: string;
    };

export interface SamplingPolicyRefusalDiagnostic {
  readonly workload: SamplingWorkload;
  readonly trialCount: number;
  readonly exactTrialBudget: number;
  readonly reason: "exact-budget-exceeded";
  readonly policyIdentity: string;
}

export class SamplingPolicyRefusal extends Error {
  readonly diagnostic: SamplingPolicyRefusalDiagnostic;

  constructor(diagnostic: SamplingPolicyRefusalDiagnostic) {
    super(
      `sampling policy refused ${diagnostic.workload} workload: ` +
        `${diagnostic.trialCount} trials exceed exact budget ` +
        `${diagnostic.exactTrialBudget} for this execution path`,
    );
    this.name = "SamplingPolicyRefusal";
    this.diagnostic = diagnostic;
  }
}

export function validateSamplingExecutionPolicy(
  policy: SamplingExecutionPolicy,
): void {
  if (policy.schemaVersion !== SAMPLING_EXECUTION_POLICY_SCHEMA_VERSION) {
    throw new RangeError("unsupported sampling execution policy version");
  }
  if (policy.id.trim().length === 0 || policy.id !== policy.id.trim()) {
    throw new TypeError(
      "sampling execution policy id must be a trimmed non-empty string",
    );
  }
  for (const workload of ["bernoulli", "categorical"] as const) {
    const budget = policy.exactTrialBudgets[workload];
    if (!Number.isSafeInteger(budget) || budget < 0) {
      throw new RangeError(
        `exact ${workload} trial budget must be a non-negative safe integer`,
      );
    }
  }
  if (
    policy.acceleratedBinomial !== "disabled" &&
    policy.acceleratedBinomial !== BOUNDED_HYBRID_BINOMIAL_V1
  ) {
    throw new RangeError("unsupported accelerated binomial policy");
  }
}

export function samplingExecutionPolicyIdentity(
  policy: SamplingExecutionPolicy,
): string {
  validateSamplingExecutionPolicy(policy);
  return JSON.stringify({
    schemaVersion: policy.schemaVersion,
    id: policy.id,
    exactTrialBudgets: {
      bernoulli: policy.exactTrialBudgets.bernoulli,
      categorical: policy.exactTrialBudgets.categorical,
    },
    acceleratedBinomial: policy.acceleratedBinomial,
  });
}

export function planSamplingExecution(
  trialCount: number,
  workload: SamplingWorkload,
  policy: SamplingExecutionPolicy,
): SamplingExecutionPlan {
  validateTrialCount(trialCount);
  validateSamplingExecutionPolicy(policy);
  const exactTrialBudget = policy.exactTrialBudgets[workload];
  const policyIdentity = samplingExecutionPolicyIdentity(policy);

  if (trialCount <= exactTrialBudget) {
    return {
      status: "exact",
      workload,
      trialCount,
      exactTrialBudget,
      policyIdentity,
    };
  }

  if (policy.acceleratedBinomial === BOUNDED_HYBRID_BINOMIAL_V1) {
    return {
      status: "accelerated",
      workload,
      trialCount,
      exactTrialBudget,
      algorithm: BOUNDED_HYBRID_BINOMIAL_V1,
      policyIdentity,
    };
  }

  return {
    status: "refused",
    workload,
    trialCount,
    exactTrialBudget,
    reason: "exact-budget-exceeded",
    policyIdentity,
  };
}

export function requireExactSampling(
  trialCount: number,
  workload: SamplingWorkload,
  policy: SamplingExecutionPolicy,
): void {
  const plan = planSamplingExecution(trialCount, workload, policy);
  if (plan.status === "exact") return;

  throw new SamplingPolicyRefusal({
    workload,
    trialCount,
    exactTrialBudget: plan.exactTrialBudget,
    reason: "exact-budget-exceeded",
    policyIdentity: plan.policyIdentity,
  });
}

/**
 * Versioned accelerated Binomial(n, p) sampler.
 *
 * - exact 0/1 limits;
 * - exact geometric skipping for a rare success/failure side with expected
 *   rare count <= 64 (runtime proportional to realized rare events, not n);
 * - continuity-corrected normal rejection for the high-count interior.
 *
 * The interior branch is an explicit numerical approximation. It never clamps
 * an out-of-range draw: bounded rejection either returns a valid integer or
 * fails closed after a fixed attempt budget.
 */
export function sampleBoundedHybridBinomialV1(
  trials: number,
  probability: number,
  rng: SimulationRng,
): number {
  validateTrialCount(trials);
  validateProbability(probability);
  if (trials === 0 || probability === 0) return 0;
  if (probability === 1) return trials;

  const useComplement = probability > 0.5;
  const rareProbability = useComplement ? 1 - probability : probability;
  const rareMean = trials * rareProbability;
  let rareCount: number;

  if (rareMean <= 64) {
    rareCount = sampleRareBinomialByGeometricSkipping(
      trials,
      rareProbability,
      rng,
    );
  } else {
    rareCount = sampleBinomialNormalRejection(
      trials,
      rareProbability,
      rng,
    );
  }

  return useComplement ? trials - rareCount : rareCount;
}

function sampleRareBinomialByGeometricSkipping(
  trials: number,
  probability: number,
  rng: SimulationRng,
): number {
  if (probability === 0) return 0;
  const logFailureProbability = Math.log1p(-probability);
  let lastSuccessIndex = -1;
  let count = 0;

  while (true) {
    const uniform = rng.nextFloat();
    const failuresBeforeSuccess = Math.floor(
      Math.log1p(-uniform) / logFailureProbability,
    );
    lastSuccessIndex += failuresBeforeSuccess + 1;
    if (lastSuccessIndex >= trials) return count;
    count += 1;
  }
}

function sampleBinomialNormalRejection(
  trials: number,
  probability: number,
  rng: SimulationRng,
): number {
  const mean = trials * probability;
  const standardDeviation = Math.sqrt(
    trials * probability * (1 - probability),
  );

  for (let attempt = 0; attempt < 32; attempt += 1) {
    const z = standardNormal(rng);
    const candidate = Math.floor(mean + standardDeviation * z + 0.5);
    if (
      Number.isSafeInteger(candidate) &&
      candidate >= 0 &&
      candidate <= trials
    ) {
      return candidate;
    }
  }

  throw new RangeError(
    "accelerated binomial rejection exhausted without a bounded draw",
  );
}

function standardNormal(rng: SimulationRng): number {
  let first = rng.nextFloat();
  if (first === 0) first = Number.MIN_VALUE;
  const second = rng.nextFloat();
  return (
    Math.sqrt(-2 * Math.log(first)) *
    Math.cos(2 * Math.PI * second)
  );
}

function validateTrialCount(trialCount: number): void {
  if (!Number.isSafeInteger(trialCount) || trialCount < 0) {
    throw new RangeError("sampling trial count must be a non-negative safe integer");
  }
}

function validateProbability(probability: number): void {
  if (
    !Number.isFinite(probability) ||
    probability < 0 ||
    probability > 1
  ) {
    throw new RangeError("sampling probability must be finite in [0, 1]");
  }
}
