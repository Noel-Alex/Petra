import {
  cohortLysisAtMinutes,
  type MaturedLatentInfections,
} from "./latentQueue";
import type { PhageLifeHistoryResolution } from "./lifeHistory";

export const PHAGE_BURST_POLICY_SCHEMA_VERSION = 1 as const;
export const PHAGE_BURST_STATE_SCHEMA_VERSION = 1 as const;

export type PhageBurstDiscretization =
  | "deterministic-residual-expectation-v1"
  | "zero-burst-control-v1";

export interface PhageBurstPolicy {
  readonly schemaVersion: typeof PHAGE_BURST_POLICY_SCHEMA_VERSION;
  readonly id: string;
  readonly discretization: PhageBurstDiscretization;
}

export interface PhageBurstState {
  readonly schemaVersion: typeof PHAGE_BURST_STATE_SCHEMA_VERSION;
  readonly policyIdentity: string;
  /**
   * Fractional expected PFU carried between authoritative lysis batches.
   * This is model/numerical state, not a measured biological quantity.
   */
  readonly residualExpectedPfu: number;
}

export interface PhageLysisBookkeeping {
  readonly lysedInfections: number;
  readonly releasedPfu: number;
  readonly meanBurstSizePfuPerCell: number;
  readonly expectedProgenyPfu: number;
  readonly sourceEvidenceClass: "measured" | "derived";
  readonly sourceResolution: "exact" | "interpolated";
  readonly discretization: PhageBurstDiscretization;
  readonly residualExpectedPfuBefore: number;
  readonly residualExpectedPfuAfter: number;
  readonly policyIdentity: string;
}

export function validatePhageBurstPolicy(policy: PhageBurstPolicy): void {
  if (policy.schemaVersion !== PHAGE_BURST_POLICY_SCHEMA_VERSION) {
    throw new Error("unsupported phage burst policy version");
  }
  if (policy.id.trim().length === 0 || policy.id !== policy.id.trim()) {
    throw new Error("phage burst policy id must be a trimmed non-empty string");
  }
  if (
    policy.discretization !== "deterministic-residual-expectation-v1" &&
    policy.discretization !== "zero-burst-control-v1"
  ) {
    throw new Error("unsupported phage burst discretization policy");
  }
}

export function phageBurstPolicyIdentity(policy: PhageBurstPolicy): string {
  validatePhageBurstPolicy(policy);
  return JSON.stringify({
    schemaVersion: policy.schemaVersion,
    id: policy.id,
    discretization: policy.discretization,
  });
}

export function createPhageBurstState(
  policy: PhageBurstPolicy,
): PhageBurstState {
  return {
    schemaVersion: PHAGE_BURST_STATE_SCHEMA_VERSION,
    policyIdentity: phageBurstPolicyIdentity(policy),
    residualExpectedPfu: 0,
  };
}

export function validatePhageBurstState(
  state: PhageBurstState,
  policy?: PhageBurstPolicy,
): void {
  if (state.schemaVersion !== PHAGE_BURST_STATE_SCHEMA_VERSION) {
    throw new Error("unsupported phage burst state version");
  }
  if (
    state.policyIdentity.trim().length === 0 ||
    state.policyIdentity !== state.policyIdentity.trim()
  ) {
    throw new Error("phage burst state requires a policy identity");
  }
  if (
    !Number.isFinite(state.residualExpectedPfu) ||
    state.residualExpectedPfu < 0 ||
    state.residualExpectedPfu >= 1
  ) {
    throw new RangeError(
      "phage burst residualExpectedPfu must be finite in [0, 1)",
    );
  }

  if (policy !== undefined) {
    const expectedIdentity = phageBurstPolicyIdentity(policy);
    if (state.policyIdentity !== expectedIdentity) {
      throw new Error("phage burst state policy identity mismatch");
    }
    if (
      policy.discretization === "zero-burst-control-v1" &&
      state.residualExpectedPfu !== 0
    ) {
      throw new Error("zero-burst control state cannot carry residual PFU");
    }
  }
}

/**
 * Convert one already-matured latent-infection handoff into lysis bookkeeping.
 *
 * The source life-history resolution supplies only the measured/derived mean
 * burst size. Discretization is an explicit Petra model policy:
 *
 * - deterministic-residual-expectation-v1 carries fractional expected PFU
 *   between lysis batches and emits only integer PFU;
 * - zero-burst-control-v1 is an engineering/mechanism-test control and emits
 *   no progeny while still reporting the authoritative lysed-host count.
 *
 * No stochastic burst distribution is inferred from source SD values.
 * Authoritative composition must consume a matured queue handoff exactly once
 * and commit host removal, queue advancement, burst state, and released PFU
 * atomically.
 */
export function applyMaturedPhageLysis(
  state: PhageBurstState,
  matured: MaturedLatentInfections,
  lifeHistory: PhageLifeHistoryResolution,
  policy: PhageBurstPolicy,
): {
  readonly state: PhageBurstState;
  readonly lysis: PhageLysisBookkeeping;
} {
  validatePhageBurstPolicy(policy);
  validatePhageBurstState(state, policy);
  validateMaturedLatentInfections(matured);

  if (lifeHistory.status === "out-of-domain") {
    throw new RangeError(
      "phage burst policy requires in-domain life-history evidence",
    );
  }

  const meanBurstSizePfuPerCell = lifeHistory.values.burstSizePfuPerCell;
  finiteNonNegative("mean burst size", meanBurstSizePfuPerCell);

  const expectedProgenyPfu =
    matured.infectionCount * meanBurstSizePfuPerCell;
  finiteNonNegative("expected progeny PFU", expectedProgenyPfu);
  if (expectedProgenyPfu > Number.MAX_SAFE_INTEGER) {
    throw new RangeError(
      "expected phage progeny exceeds safe integer accounting range",
    );
  }

  const policyIdentity = phageBurstPolicyIdentity(policy);
  const common = {
    lysedInfections: matured.infectionCount,
    meanBurstSizePfuPerCell,
    expectedProgenyPfu,
    sourceEvidenceClass: lifeHistory.evidenceClass,
    sourceResolution: lifeHistory.status,
    discretization: policy.discretization,
    residualExpectedPfuBefore: state.residualExpectedPfu,
    policyIdentity,
  } as const;

  if (policy.discretization === "zero-burst-control-v1") {
    return {
      state,
      lysis: {
        ...common,
        releasedPfu: 0,
        residualExpectedPfuAfter: 0,
      },
    };
  }

  if (matured.infectionCount === 0) {
    return {
      state,
      lysis: {
        ...common,
        releasedPfu: 0,
        residualExpectedPfuAfter: state.residualExpectedPfu,
      },
    };
  }

  const totalExpectedPfu =
    state.residualExpectedPfu + expectedProgenyPfu;
  finiteNonNegative("total expected progeny PFU", totalExpectedPfu);
  if (totalExpectedPfu > Number.MAX_SAFE_INTEGER) {
    throw new RangeError(
      "phage progeny plus residual exceeds safe integer accounting range",
    );
  }

  const releasedPfu = Math.floor(totalExpectedPfu);
  nonNegativeSafeInteger("releasedPfu", releasedPfu);
  const residualExpectedPfu = totalExpectedPfu - releasedPfu;
  if (
    !Number.isFinite(residualExpectedPfu) ||
    residualExpectedPfu < 0 ||
    residualExpectedPfu >= 1
  ) {
    throw new RangeError("phage burst residual calculation left [0, 1)");
  }

  const nextState: PhageBurstState = {
    schemaVersion: PHAGE_BURST_STATE_SCHEMA_VERSION,
    policyIdentity,
    residualExpectedPfu,
  };

  return {
    state: nextState,
    lysis: {
      ...common,
      releasedPfu,
      residualExpectedPfuAfter: residualExpectedPfu,
    },
  };
}

function validateMaturedLatentInfections(
  matured: MaturedLatentInfections,
): void {
  finiteNonNegative("matured.throughMinutes", matured.throughMinutes);
  nonNegativeSafeInteger("matured.infectionCount", matured.infectionCount);

  let summedInfections = 0;
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
        "matured latent cohort cannot precede its lysis boundary",
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

    summedInfections += cohort.infectionCount;
    if (!Number.isSafeInteger(summedInfections)) {
      throw new RangeError(
        "matured latent infection count exceeds safe integer range",
      );
    }
    previousLysisAtMinutes = lysisAtMinutes;
    previousSequence = cohort.sequence;
  }

  if (summedInfections !== matured.infectionCount) {
    throw new RangeError(
      "matured latent infection count must equal the cohort count sum",
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
