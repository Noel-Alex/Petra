import { SimulationRng } from "./rng";

export const SAMPLING_EXECUTION_POLICY_SCHEMA_VERSION = 1 as const;
export const EXACT_SPARSE_BINOMIAL_ALGORITHM_VERSION = 1 as const;

export type CountSamplingAcceleration =
  | "disabled"
  | "exact-sparse-binomial-v1";

export interface SamplingExecutionPolicy {
  readonly schemaVersion: typeof SAMPLING_EXECUTION_POLICY_SCHEMA_VERSION;
  readonly id: string;
  readonly exactTrialLimit: number;
  readonly acceleration: CountSamplingAcceleration;
  /**
   * Preflight ceiling for the conservative expected number of accelerated RNG
   * draws in one operation. Numerical/runtime policy only; not biology.
   */
  readonly maximumExpectedAcceleratedDraws: number;
  /**
   * Absolute RNG-draw ceiling for one accelerated operation. Crossing it
   * refuses atomically rather than allowing unbounded work.
   */
  readonly maximumAcceleratedDraws: number;
}

export type SamplingPolicyRefusalReason =
  | "exact-trial-budget-exceeded"
  | "accelerated-expected-budget-exceeded"
  | "accelerated-hard-budget-exceeded";

export interface SamplingPolicyRefusalDiagnostics {
  readonly reason: SamplingPolicyRefusalReason;
  readonly policyIdentity: string;
  readonly requestedTrials: number;
  readonly expectedAcceleratedDraws: number | null;
  readonly acceleratedDrawsUsed: number;
}

export class SamplingPolicyRefusalError extends Error {
  readonly code = "sampling-policy-refusal" as const;
  readonly diagnostics: SamplingPolicyRefusalDiagnostics;

  constructor(message: string, diagnostics: SamplingPolicyRefusalDiagnostics) {
    super(message);
    this.name = "SamplingPolicyRefusalError";
    this.diagnostics = diagnostics;
  }
}

export interface SamplingDrawBudget {
  readonly limit: number;
  used: number;
}

export function validateSamplingExecutionPolicy(
  policy: SamplingExecutionPolicy,
): void {
  if (policy.schemaVersion !== SAMPLING_EXECUTION_POLICY_SCHEMA_VERSION) {
    throw new Error("unsupported sampling execution policy version");
  }
  if (policy.id.trim().length === 0 || policy.id !== policy.id.trim()) {
    throw new Error("sampling execution policy id must be a trimmed non-empty string");
  }
  nonNegativeSafeInteger("exactTrialLimit", policy.exactTrialLimit);
  positiveSafeInteger(
    "maximumExpectedAcceleratedDraws",
    policy.maximumExpectedAcceleratedDraws,
  );
  positiveSafeInteger(
    "maximumAcceleratedDraws",
    policy.maximumAcceleratedDraws,
  );
  if (
    policy.maximumExpectedAcceleratedDraws >
    policy.maximumAcceleratedDraws
  ) {
    throw new Error(
      "maximumExpectedAcceleratedDraws cannot exceed maximumAcceleratedDraws",
    );
  }
  if (
    policy.acceleration !== "disabled" &&
    policy.acceleration !== "exact-sparse-binomial-v1"
  ) {
    throw new Error("unsupported count-sampling acceleration");
  }
}

export function samplingExecutionPolicyIdentity(
  policy: SamplingExecutionPolicy,
): string {
  validateSamplingExecutionPolicy(policy);
  return JSON.stringify({
    schemaVersion: policy.schemaVersion,
    id: policy.id,
    exactTrialLimit: policy.exactTrialLimit,
    acceleration: policy.acceleration,
    maximumExpectedAcceleratedDraws:
      policy.maximumExpectedAcceleratedDraws,
    maximumAcceleratedDraws: policy.maximumAcceleratedDraws,
    sparseBinomialAlgorithmVersion:
      policy.acceleration === "exact-sparse-binomial-v1"
        ? EXACT_SPARSE_BINOMIAL_ALGORITHM_VERSION
        : null,
  });
}

export function createSamplingDrawBudget(
  policy: SamplingExecutionPolicy,
): SamplingDrawBudget {
  validateSamplingExecutionPolicy(policy);
  return { limit: policy.maximumAcceleratedDraws, used: 0 };
}

export function expectedSparseBinomialDraws(
  trials: number,
  probability: number,
): number {
  nonNegativeSafeInteger("trials", trials);
  probability01(probability);
  if (trials === 0 || probability === 0 || probability === 1) return 0;
  return trials * Math.min(probability, 1 - probability) + 1;
}

export function requireAcceleratedSampling(
  requestedTrials: number,
  expectedAcceleratedDraws: number,
  policy: SamplingExecutionPolicy,
): void {
  validateSamplingExecutionPolicy(policy);
  nonNegativeSafeInteger("requestedTrials", requestedTrials);
  if (!Number.isFinite(expectedAcceleratedDraws) || expectedAcceleratedDraws < 0) {
    throw new RangeError("expectedAcceleratedDraws must be finite and non-negative");
  }

  const identity = samplingExecutionPolicyIdentity(policy);
  if (policy.acceleration === "disabled") {
    throw new SamplingPolicyRefusalError(
      "exact trial budget exceeded and accelerated sampling is disabled",
      {
        reason: "exact-trial-budget-exceeded",
        policyIdentity: identity,
        requestedTrials,
        expectedAcceleratedDraws,
        acceleratedDrawsUsed: 0,
      },
    );
  }
  if (
    expectedAcceleratedDraws >
    policy.maximumExpectedAcceleratedDraws
  ) {
    throw new SamplingPolicyRefusalError(
      "accelerated sampling exceeds the policy expected-draw budget",
      {
        reason: "accelerated-expected-budget-exceeded",
        policyIdentity: identity,
        requestedTrials,
        expectedAcceleratedDraws,
        acceleratedDrawsUsed: 0,
      },
    );
  }
}

/**
 * Exact binomial sampler using geometric skipping over the rarer Bernoulli
 * outcome. It is exact, not a Poisson/normal approximation. Work scales with
 * the sampled minority count, plus one terminating draw.
 */
export function sampleExactSparseBinomial(
  trials: number,
  probability: number,
  rng: SimulationRng,
  budget: SamplingDrawBudget,
  policyIdentity: string,
): number {
  nonNegativeSafeInteger("trials", trials);
  probability01(probability);
  if (!Number.isSafeInteger(budget.limit) || budget.limit < 1) {
    throw new RangeError("sampling draw budget limit must be a positive safe integer");
  }
  if (!Number.isSafeInteger(budget.used) || budget.used < 0) {
    throw new RangeError("sampling draw budget usage must be a non-negative safe integer");
  }
  if (trials === 0 || probability === 0) return 0;
  if (probability === 1) return trials;

  const sampleProbability = probability <= 0.5
    ? probability
    : 1 - probability;
  const complement = probability > 0.5;
  const logFailureProbability = Math.log1p(-sampleProbability);

  let minorityCount = 0;
  let cursor = -1;
  while (true) {
    consumeDraw(budget, trials, policyIdentity);
    const draw = rng.nextFloat();
    const gap = Math.floor(Math.log1p(-draw) / logFailureProbability);
    cursor += gap + 1;
    if (cursor >= trials) break;
    minorityCount += 1;
  }

  return complement ? trials - minorityCount : minorityCount;
}

export function runSamplingTransaction<T>(
  rng: SimulationRng,
  operation: (transactionRng: SimulationRng) => T,
): T {
  const transactionRng = new SimulationRng(rng.snapshot());
  const value = operation(transactionRng);
  rng.restore(transactionRng.snapshot());
  return value;
}

function consumeDraw(
  budget: SamplingDrawBudget,
  requestedTrials: number,
  policyIdentity: string,
): void {
  if (budget.used >= budget.limit) {
    throw new SamplingPolicyRefusalError(
      "accelerated sampling exhausted the hard RNG-draw budget",
      {
        reason: "accelerated-hard-budget-exceeded",
        policyIdentity,
        requestedTrials,
        expectedAcceleratedDraws: null,
        acceleratedDrawsUsed: budget.used,
      },
    );
  }
  budget.used += 1;
}

function probability01(value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError("probability must be finite in [0, 1]");
  }
}

function nonNegativeSafeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
}

function positiveSafeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
}
