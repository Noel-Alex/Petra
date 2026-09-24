import {
  cohortLysisAtMinutes,
  type MaturedLatentInfections,
} from "./latentQueue";
import type { PhageLifeHistoryResolution } from "./lifeHistory";

export const PHAGE_BURST_POLICY_SCHEMA_VERSION = 1 as const;

export const DETERMINISTIC_RESIDUAL_BURST_POLICY = Object.freeze({
  schemaVersion: PHAGE_BURST_POLICY_SCHEMA_VERSION,
  id: "deterministic-residual-expectation-v1",
  discretization: "floor-with-fractional-residual-carry",
  stochasticDistribution: null,
} as const);

export type PhageBurstPolicy = typeof DETERMINISTIC_RESIDUAL_BURST_POLICY;

export const PHAGE_BURST_POLICY_IDENTITY =
  "phage-burst-policy:v1:deterministic-residual-expectation-v1" as const;

export interface PhageBurstPolicyState {
  readonly schemaVersion: typeof PHAGE_BURST_POLICY_SCHEMA_VERSION;
  readonly policyIdentity: typeof PHAGE_BURST_POLICY_IDENTITY;
  /**
   * Fractional progeny expectation retained between authoritative lysis batches.
   *
   * This is numerical bookkeeping only. It is not a fractional PFU and must
   * remain in [0, 1).
   */
  readonly residualExpectedPfu: number;
}

export interface PhageLysisBurstResult {
  readonly policyIdentity: typeof PHAGE_BURST_POLICY_IDENTITY;
  readonly lysedInfections: number;
  readonly meanBurstPfuPerCell: number;
  readonly cohortExpectedPfu: number;
  readonly residualBeforePfu: number;
  readonly releasedPfu: number;
  readonly residualAfterPfu: number;
  readonly state: PhageBurstPolicyState;
}

export interface AuthoritativePhageLysisBurstResult
  extends PhageLysisBurstResult {
  readonly sourceEvidenceClass: "measured" | "derived";
  readonly sourceResolution: "exact" | "interpolated";
}

/**
 * Canonical replay/configuration identity for the currently supported burst
 * discretization policy.
 *
 * The measured/derived burst-size evidence remains owned by lifeHistory.ts.
 * This identity describes only how a caller-supplied expectation is converted
 * into discrete PFU.
 */
export function phageBurstPolicyIdentity(
  policy: PhageBurstPolicy,
): typeof PHAGE_BURST_POLICY_IDENTITY {
  validatePhageBurstPolicy(policy);
  return PHAGE_BURST_POLICY_IDENTITY;
}

export function createPhageBurstPolicyState(
  policy: PhageBurstPolicy,
): PhageBurstPolicyState {
  return {
    schemaVersion: PHAGE_BURST_POLICY_SCHEMA_VERSION,
    policyIdentity: phageBurstPolicyIdentity(policy),
    residualExpectedPfu: 0,
  };
}

/**
 * Authority-bound lysis entrypoint for product/runtime composition.
 *
 * This accepts only the latent queue's already-matured cohort handoff and an
 * in-domain reviewed life-history resolution. It refuses inconsistent counts,
 * duplicate/out-of-order cohorts, or cohorts whose lysis boundary has not
 * elapsed before delegating to the unchanged numerical residual-carry policy.
 *
 * Source evidence classification is retained on the result so downstream
 * provenance can distinguish measured rows from derived interpolation.
 */
export function applyMaturedPhageBurst(
  policy: PhageBurstPolicy,
  state: PhageBurstPolicyState,
  matured: MaturedLatentInfections,
  lifeHistory: PhageLifeHistoryResolution,
): AuthoritativePhageLysisBurstResult {
  validateMaturedLatentInfections(matured);

  if (lifeHistory.status === "out-of-domain") {
    throw new RangeError(
      "phage burst requires an in-domain life-history resolution",
    );
  }

  const burst = applyDeterministicPhageBurst(policy, state, {
    infectionCount: matured.infectionCount,
    meanBurstPfuPerCell: lifeHistory.values.burstSizePfuPerCell,
  });

  return {
    ...burst,
    sourceEvidenceClass: lifeHistory.evidenceClass,
    sourceResolution: lifeHistory.status,
  };
}

/**
 * Convert one matured authoritative infection count into discrete progeny PFU.
 *
 * This deliberately does not sample a per-cell burst distribution: Petra has a
 * source-backed mean/SD for the T4/MG1655 pack, but no reviewed individual-burst
 * law. Instead, the policy treats infectionCount * meanBurstPfuPerCell as an
 * expectation and carries the fractional remainder into the next lysis batch.
 *
 * This is the low-level numerical primitive. Product/runtime composition should
 * prefer applyMaturedPhageBurst so the mean comes from reviewed life-history
 * authority and the infection count comes from a validated matured queue handoff.
 *
 * The caller remains responsible for atomically decrementing infected-host
 * state exactly once. This pure contract reports lysedInfections separately
 * from releasedPfu so composition cannot silently conflate the two.
 */
export function applyDeterministicPhageBurst(
  policy: PhageBurstPolicy,
  state: PhageBurstPolicyState,
  args: {
    readonly infectionCount: number;
    readonly meanBurstPfuPerCell: number;
  },
): PhageLysisBurstResult {
  const policyIdentity = phageBurstPolicyIdentity(policy);
  validatePhageBurstPolicyState(state);

  if (state.policyIdentity !== policyIdentity) {
    throw new Error(
      "phage burst policy state identity does not match the requested policy",
    );
  }

  nonNegativeSafeInteger("infectionCount", args.infectionCount);
  finiteRepresentableExpectation(
    "meanBurstPfuPerCell",
    args.meanBurstPfuPerCell,
  );

  const residualBeforePfu = state.residualExpectedPfu;

  if (args.infectionCount === 0) {
    return {
      policyIdentity,
      lysedInfections: 0,
      meanBurstPfuPerCell: args.meanBurstPfuPerCell,
      cohortExpectedPfu: 0,
      residualBeforePfu,
      releasedPfu: 0,
      residualAfterPfu: residualBeforePfu,
      state,
    };
  }

  const cohortExpectedPfu =
    args.infectionCount * args.meanBurstPfuPerCell;
  if (!Number.isFinite(cohortExpectedPfu) || cohortExpectedPfu < 0) {
    throw new RangeError(
      "phage cohort progeny expectation exceeds finite numeric range",
    );
  }

  const totalExpectedPfu = residualBeforePfu + cohortExpectedPfu;
  if (!Number.isFinite(totalExpectedPfu) || totalExpectedPfu < 0) {
    throw new RangeError(
      "phage total progeny expectation exceeds finite numeric range",
    );
  }

  const releasedPfu = Math.floor(totalExpectedPfu);
  if (!Number.isSafeInteger(releasedPfu) || releasedPfu < 0) {
    throw new RangeError(
      "released phage PFU would exceed the safe integer count range",
    );
  }

  const rawResidualAfterPfu = totalExpectedPfu - releasedPfu;
  const residualAfterPfu =
    rawResidualAfterPfu === 0 ? 0 : rawResidualAfterPfu;
  validateResidual(residualAfterPfu);

  const nextState: PhageBurstPolicyState = {
    schemaVersion: PHAGE_BURST_POLICY_SCHEMA_VERSION,
    policyIdentity,
    residualExpectedPfu: residualAfterPfu,
  };

  return {
    policyIdentity,
    lysedInfections: args.infectionCount,
    meanBurstPfuPerCell: args.meanBurstPfuPerCell,
    cohortExpectedPfu,
    residualBeforePfu,
    releasedPfu,
    residualAfterPfu,
    state: nextState,
  };
}

export function validatePhageBurstPolicyState(
  state: PhageBurstPolicyState,
): void {
  if (state.schemaVersion !== PHAGE_BURST_POLICY_SCHEMA_VERSION) {
    throw new Error("unsupported phage burst policy state schema version");
  }
  if (state.policyIdentity !== PHAGE_BURST_POLICY_IDENTITY) {
    throw new Error("unsupported phage burst policy state identity");
  }
  validateResidual(state.residualExpectedPfu);
}

function validateMaturedLatentInfections(
  matured: MaturedLatentInfections,
): void {
  finiteNonNegative("matured.throughMinutes", matured.throughMinutes);
  nonNegativeSafeInteger("matured.infectionCount", matured.infectionCount);

  let infectionCount = 0;
  let previousLysisAtMinutes = -Infinity;
  let previousSequence = -Infinity;
  const sequences = new Set<number>();

  for (const cohort of matured.cohorts) {
    nonNegativeSafeInteger("matured cohort sequence", cohort.sequence);
    positiveSafeInteger(
      "matured cohort infectionCount",
      cohort.infectionCount,
    );

    if (sequences.has(cohort.sequence)) {
      throw new RangeError("matured latent cohort sequences must be unique");
    }
    sequences.add(cohort.sequence);

    const lysisAtMinutes = cohortLysisAtMinutes(cohort);
    if (lysisAtMinutes > matured.throughMinutes) {
      throw new RangeError(
        "matured latent cohort cannot be reported before its lysis boundary",
      );
    }
    if (
      lysisAtMinutes < previousLysisAtMinutes ||
      (lysisAtMinutes === previousLysisAtMinutes &&
        cohort.sequence < previousSequence)
    ) {
      throw new RangeError(
        "matured latent cohorts must remain in deterministic maturity order",
      );
    }

    infectionCount += cohort.infectionCount;
    if (!Number.isSafeInteger(infectionCount)) {
      throw new RangeError(
        "matured latent infection count exceeds safe integer range",
      );
    }

    previousLysisAtMinutes = lysisAtMinutes;
    previousSequence = cohort.sequence;
  }

  if (infectionCount !== matured.infectionCount) {
    throw new RangeError(
      "matured latent infection count must equal the cohort count sum",
    );
  }
}

function validatePhageBurstPolicy(policy: PhageBurstPolicy): void {
  if (
    policy.schemaVersion !== PHAGE_BURST_POLICY_SCHEMA_VERSION ||
    policy.id !== DETERMINISTIC_RESIDUAL_BURST_POLICY.id ||
    policy.discretization !==
      DETERMINISTIC_RESIDUAL_BURST_POLICY.discretization ||
    policy.stochasticDistribution !== null
  ) {
    throw new Error("unsupported phage burst policy");
  }
}

function validateResidual(value: number): void {
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RangeError(
      "phage burst residualExpectedPfu must be finite and in [0, 1)",
    );
  }
}

function finiteNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be finite and non-negative`);
  }
}

function nonNegativeSafeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
}

function positiveSafeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
}

function finiteRepresentableExpectation(name: string, value: number): void {
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    value > Number.MAX_SAFE_INTEGER
  ) {
    throw new RangeError(
      `${name} must be finite, non-negative, and no greater than Number.MAX_SAFE_INTEGER`,
    );
  }
}
