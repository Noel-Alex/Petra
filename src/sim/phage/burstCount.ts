import type { PhageLifeHistoryResolution } from "./lifeHistory";
import {
  cohortLysisAtMinutes,
  type MaturedLatentInfections,
} from "./latentQueue";

export const PHAGE_BURST_COUNT_POLICY_SCHEMA_VERSION = 1 as const;
export const PHAGE_BURST_COUNT_STATE_SCHEMA_VERSION = 1 as const;

export type PhageBurstCountPolicy =
  | Readonly<{
      schemaVersion: typeof PHAGE_BURST_COUNT_POLICY_SCHEMA_VERSION;
      id: string;
      kind: "deterministic-residual-expectation-v1";
      classification: "model";
      limitation: string;
    }>
  | Readonly<{
      schemaVersion: typeof PHAGE_BURST_COUNT_POLICY_SCHEMA_VERSION;
      id: string;
      kind: "zero-burst-control-v1";
      classification: "engineering-control";
      limitation: string;
    }>;

export interface PhageBurstCountState {
  readonly schemaVersion: typeof PHAGE_BURST_COUNT_STATE_SCHEMA_VERSION;
  readonly policyIdentity: string;
  /**
   * Fractional PFU expectation carried between authoritative lysis batches.
   * This is numerical model state, not a fractional biological PFU.
   */
  readonly residualExpectedPfu: number;
}

export interface PhageLysisBurstOutcome {
  readonly throughMinutes: number;
  readonly maturedCohortSequences: readonly number[];
  readonly lysedHostCount: number;
  readonly sourceMeanBurstSizePfuPerCell: number;
  readonly sourceExpectedProgenyPfu: number;
  readonly sourceEvidenceClass: "measured" | "derived";
  readonly progenyPfu: number;
  readonly countPolicyClassification: PhageBurstCountPolicy["classification"];
  readonly countPolicyIdentity: string;
  readonly state: PhageBurstCountState;
}

export function burstCountPolicyIdentity(
  policy: PhageBurstCountPolicy,
): string {
  validateBurstCountPolicy(policy);
  return JSON.stringify({
    schemaVersion: policy.schemaVersion,
    id: policy.id,
    kind: policy.kind,
    classification: policy.classification,
  });
}

export function createBurstCountState(
  policy: PhageBurstCountPolicy,
): PhageBurstCountState {
  return {
    schemaVersion: PHAGE_BURST_COUNT_STATE_SCHEMA_VERSION,
    policyIdentity: burstCountPolicyIdentity(policy),
    residualExpectedPfu: 0,
  };
}

/**
 * Convert an already-matured infected-host cohort into a discrete PFU release
 * handoff without inventing an individual-burst probability distribution.
 *
 * The deterministic residual policy carries fractional expected PFU between
 * lysis batches so cumulative integer release follows the source mean to
 * within less than one PFU. It is explicitly a model discretization policy,
 * not measured burst-count variance.
 *
 * This function does not mutate authoritative host or free-phage state.
 * Runtime composition must consume the matured cohort and apply
 * `lysedHostCount` + `progenyPfu` atomically exactly once.
 */
export function resolveLysisBurstCount(args: {
  readonly matured: MaturedLatentInfections;
  readonly lifeHistory: PhageLifeHistoryResolution;
  readonly policy: PhageBurstCountPolicy;
  readonly state: PhageBurstCountState;
}): PhageLysisBurstOutcome {
  const policyIdentity = burstCountPolicyIdentity(args.policy);
  validateBurstCountState(args.state, policyIdentity, args.policy);
  validateMaturedInfections(args.matured);

  if (args.lifeHistory.status === "out-of-domain") {
    throw new RangeError(
      "burst count requires an in-domain phage life-history resolution",
    );
  }

  const mean = args.lifeHistory.values.burstSizePfuPerCell;
  finiteNonNegative("burstSizePfuPerCell", mean);

  const sourceExpectedProgenyPfu = args.matured.infectionCount * mean;
  safeFiniteCountExpectation(
    "source expected progeny PFU",
    sourceExpectedProgenyPfu,
  );

  const base = {
    throughMinutes: args.matured.throughMinutes,
    maturedCohortSequences: args.matured.cohorts.map(
      (cohort) => cohort.sequence,
    ),
    lysedHostCount: args.matured.infectionCount,
    sourceMeanBurstSizePfuPerCell: mean,
    sourceExpectedProgenyPfu,
    sourceEvidenceClass: args.lifeHistory.evidenceClass,
    countPolicyClassification: args.policy.classification,
    countPolicyIdentity: policyIdentity,
  } as const;

  if (args.policy.kind === "zero-burst-control-v1") {
    return {
      ...base,
      progenyPfu: 0,
      state: args.state,
    };
  }

  if (args.matured.infectionCount === 0) {
    return {
      ...base,
      progenyPfu: 0,
      state: args.state,
    };
  }

  const carriedExpectation =
    sourceExpectedProgenyPfu + args.state.residualExpectedPfu;
  safeFiniteCountExpectation(
    "carried progeny PFU expectation",
    carriedExpectation,
  );

  const progenyPfu = Math.floor(carriedExpectation);
  nonNegativeSafeInteger("progenyPfu", progenyPfu);

  const residualExpectedPfu = carriedExpectation - progenyPfu;
  validateResidual(residualExpectedPfu);

  return {
    ...base,
    progenyPfu,
    state: {
      schemaVersion: PHAGE_BURST_COUNT_STATE_SCHEMA_VERSION,
      policyIdentity,
      residualExpectedPfu,
    },
  };
}

export function validateBurstCountPolicy(
  policy: PhageBurstCountPolicy,
): void {
  if (policy.schemaVersion !== PHAGE_BURST_COUNT_POLICY_SCHEMA_VERSION) {
    throw new Error("unsupported phage burst-count policy schema version");
  }
  if (policy.id.trim().length === 0 || policy.id !== policy.id.trim()) {
    throw new Error("phage burst-count policy id must be a trimmed non-empty string");
  }
  if (
    policy.kind !== "deterministic-residual-expectation-v1" &&
    policy.kind !== "zero-burst-control-v1"
  ) {
    throw new Error("unsupported phage burst-count policy kind");
  }
  if (
    (policy.kind === "deterministic-residual-expectation-v1" &&
      policy.classification !== "model") ||
    (policy.kind === "zero-burst-control-v1" &&
      policy.classification !== "engineering-control")
  ) {
    throw new Error("phage burst-count policy classification does not match kind");
  }
  if (
    policy.limitation.trim().length === 0 ||
    policy.limitation !== policy.limitation.trim()
  ) {
    throw new Error(
      "phage burst-count policy requires a trimmed non-empty limitation",
    );
  }
}

export function validateBurstCountState(
  state: PhageBurstCountState,
  expectedPolicyIdentity: string,
  policy?: PhageBurstCountPolicy,
): void {
  if (state.schemaVersion !== PHAGE_BURST_COUNT_STATE_SCHEMA_VERSION) {
    throw new Error("unsupported phage burst-count state schema version");
  }
  if (state.policyIdentity !== expectedPolicyIdentity) {
    throw new Error("phage burst-count state policy identity mismatch");
  }
  validateResidual(state.residualExpectedPfu);
  if (
    policy?.kind === "zero-burst-control-v1" &&
    state.residualExpectedPfu !== 0
  ) {
    throw new RangeError("zero-burst control cannot carry PFU expectation");
  }
}

function validateMaturedInfections(
  matured: MaturedLatentInfections,
): void {
  finiteNonNegative("throughMinutes", matured.throughMinutes);
  nonNegativeSafeInteger("matured.infectionCount", matured.infectionCount);

  let summedInfections = 0;
  const sequences = new Set<number>();
  for (const cohort of matured.cohorts) {
    nonNegativeSafeInteger("matured cohort sequence", cohort.sequence);
    if (sequences.has(cohort.sequence)) {
      throw new RangeError("matured cohort sequences must be unique");
    }
    sequences.add(cohort.sequence);

    positiveSafeInteger("matured cohort infectionCount", cohort.infectionCount);
    if (cohortLysisAtMinutes(cohort) > matured.throughMinutes) {
      throw new RangeError("matured cohort cannot precede its lysis time");
    }

    summedInfections += cohort.infectionCount;
    if (!Number.isSafeInteger(summedInfections)) {
      throw new RangeError("matured infection sum exceeds safe integer range");
    }
  }

  if (summedInfections !== matured.infectionCount) {
    throw new RangeError(
      "matured infection count must equal the sum of matured cohorts",
    );
  }
}

function validateResidual(value: number): void {
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RangeError("residualExpectedPfu must be finite in [0, 1)");
  }
}

function safeFiniteCountExpectation(name: string, value: number): void {
  finiteNonNegative(name, value);
  if (value > Number.MAX_SAFE_INTEGER) {
    throw new RangeError(`${name} exceeds safe integer range`);
  }
}

function positiveSafeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
}

function nonNegativeSafeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
}

function finiteNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be finite and non-negative`);
  }
}
