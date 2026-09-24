import {
  createPhageBurstPolicyState,
  validatePhageBurstPolicyState,
  type PhageBurstPolicy,
  type PhageBurstPolicyState,
} from "./burstPolicy";
import {
  advanceLatentInfectionQueue,
  createLatentInfectionQueue,
  validateLatentInfectionQueue,
  type LatentInfectionCohort,
  type LatentInfectionQueueState,
  type MaturedLatentInfections,
} from "./latentQueue";
import {
  createPhageLifeHistoryIdentity,
  phageLifeHistoryIdentitiesEqual,
  type PhageLifeHistoryIdentity,
  type PhageLifeHistoryResolution,
} from "./lifeHistory";
import {
  applyMaturedPhageLysis,
  type MaturedPhageLysisResult,
} from "./lysis";

export const PHAGE_LYSIS_TRANSACTION_SCHEMA_VERSION = 1 as const;

export interface PhageLysisTransactionState {
  readonly schemaVersion: typeof PHAGE_LYSIS_TRANSACTION_SCHEMA_VERSION;
  readonly latentQueue: LatentInfectionQueueState;
  readonly burstPolicyState: PhageBurstPolicyState;
  /**
   * Authoritative discrete extracellular phage count for this pure transaction
   * boundary. Spatial placement/transport remains owned by later composition.
   */
  readonly freePfu: number;
}

export interface PhageLysisTransactionResult {
  readonly throughMinutes: number;
  /** Exact infected-host decrement that authoritative composition must commit once. */
  readonly hostDecrementCount: number;
  readonly releasedPfu: number;
  readonly maturedCohortSequences: readonly number[];
  /**
   * One lysis record per matured cohort, in deterministic maturity/sequence
   * order. Keeping cohort boundaries preserves infection-time authority when
   * multiple physiological states mature at the same biological time.
   */
  readonly lyses: readonly MaturedPhageLysisResult[];
  readonly state: PhageLysisTransactionState;
}

export function createPhageLysisTransactionState(
  policy: PhageBurstPolicy,
  args: {
    readonly currentTimeMinutes?: number;
    readonly freePfu?: number;
  } = {},
): PhageLysisTransactionState {
  const freePfu = args.freePfu ?? 0;
  nonNegativeSafeInteger("freePfu", freePfu);

  return {
    schemaVersion: PHAGE_LYSIS_TRANSACTION_SCHEMA_VERSION,
    latentQueue: createLatentInfectionQueue(args.currentTimeMinutes ?? 0),
    burstPolicyState: createPhageBurstPolicyState(policy),
    freePfu,
  };
}

export function validatePhageLysisTransactionState(
  state: PhageLysisTransactionState,
): void {
  if (!isRecord(state)) {
    throw new TypeError("phage lysis transaction state must be an object");
  }
  if (state.schemaVersion !== PHAGE_LYSIS_TRANSACTION_SCHEMA_VERSION) {
    throw new Error("unsupported phage lysis transaction state schema version");
  }
  if (!isRecord(state.latentQueue)) {
    throw new TypeError("phage lysis transaction latentQueue must be an object");
  }
  if (!isRecord(state.burstPolicyState)) {
    throw new TypeError(
      "phage lysis transaction burstPolicyState must be an object",
    );
  }
  validateLatentInfectionQueue(state.latentQueue);
  validatePhageBurstPolicyState(state.burstPolicyState);
  nonNegativeSafeInteger("phage lysis transaction freePfu", state.freePfu);
}

/**
 * Atomically advance delayed phage lysis bookkeeping.
 *
 * All constituent modules are pure. This function validates the current state,
 * computes every matured cohort's lysis in deterministic queue order, and
 * preflights discrete free-PFU addition before publishing a next state. Any
 * missing life-history authority, corrupt replay state, burst refusal, or PFU
 * overflow throws without mutating the caller-owned state.
 *
 * Host-grid mutation deliberately stays outside this module. The returned
 * hostDecrementCount is the exact authoritative count that the composed engine
 * must consume exactly once in the same higher-level commit.
 */
export function applyPhageLysisTransaction(
  policy: PhageBurstPolicy,
  state: PhageLysisTransactionState,
  args: {
    readonly throughMinutes: number;
    readonly lifeHistories: readonly PhageLifeHistoryResolution[];
  },
): PhageLysisTransactionResult {
  validatePhageLysisTransactionState(state);
  finiteNonNegative("throughMinutes", args.throughMinutes);
  if (!Array.isArray(args.lifeHistories)) {
    throw new TypeError("lifeHistories must be an array");
  }

  const authorities = buildLifeHistoryAuthorities(args.lifeHistories);
  const advanced = advanceLatentInfectionQueue(
    state.latentQueue,
    args.throughMinutes,
  );

  if (advanced.matured.infectionCount === 0) {
    return {
      throughMinutes: args.throughMinutes,
      hostDecrementCount: 0,
      releasedPfu: 0,
      maturedCohortSequences: [],
      lyses: [],
      state: {
        schemaVersion: PHAGE_LYSIS_TRANSACTION_SCHEMA_VERSION,
        latentQueue: advanced.state,
        burstPolicyState: state.burstPolicyState,
        freePfu: state.freePfu,
      },
    };
  }

  let burstPolicyState = state.burstPolicyState;
  let nextFreePfu = state.freePfu;
  let releasedPfu = 0;
  let hostDecrementCount = 0;
  const lyses: MaturedPhageLysisResult[] = [];

  for (const cohort of advanced.matured.cohorts) {
    const authority = findAuthority(cohort, authorities);
    const matured = singleCohortMaturity(advanced.matured, cohort);
    const lysis = applyMaturedPhageLysis(
      policy,
      burstPolicyState,
      matured,
      authority.resolution,
    );

    nextFreePfu = safeCountSum(
      "free PFU after phage lysis",
      nextFreePfu,
      lysis.burst.releasedPfu,
    );
    releasedPfu = safeCountSum(
      "released PFU in phage lysis transaction",
      releasedPfu,
      lysis.burst.releasedPfu,
    );
    hostDecrementCount = safeCountSum(
      "host decrement count in phage lysis transaction",
      hostDecrementCount,
      lysis.burst.lysedInfections,
    );
    burstPolicyState = lysis.burst.state;
    lyses.push(lysis);
  }

  if (hostDecrementCount !== advanced.matured.infectionCount) {
    throw new Error(
      "phage lysis transaction host decrement must equal matured infection count",
    );
  }

  return {
    throughMinutes: args.throughMinutes,
    hostDecrementCount,
    releasedPfu,
    maturedCohortSequences: lyses.flatMap(
      (lysis) => lysis.maturedCohortSequences,
    ),
    lyses,
    state: {
      schemaVersion: PHAGE_LYSIS_TRANSACTION_SCHEMA_VERSION,
      latentQueue: advanced.state,
      burstPolicyState,
      freePfu: nextFreePfu,
    },
  };
}

interface LifeHistoryAuthority {
  readonly identity: PhageLifeHistoryIdentity;
  readonly resolution: PhageLifeHistoryResolution;
}

function buildLifeHistoryAuthorities(
  resolutions: readonly PhageLifeHistoryResolution[],
): readonly LifeHistoryAuthority[] {
  const authorities: LifeHistoryAuthority[] = [];

  for (const resolution of resolutions) {
    const identity = createPhageLifeHistoryIdentity(resolution);
    if (
      authorities.some((authority) =>
        phageLifeHistoryIdentitiesEqual(authority.identity, identity),
      )
    ) {
      throw new Error("duplicate phage life-history authority identity");
    }
    authorities.push({ identity, resolution });
  }

  return authorities;
}

function findAuthority(
  cohort: LatentInfectionCohort,
  authorities: readonly LifeHistoryAuthority[],
): LifeHistoryAuthority {
  const authority = authorities.find((candidate) =>
    phageLifeHistoryIdentitiesEqual(
      cohort.lifeHistoryIdentity,
      candidate.identity,
    ),
  );
  if (authority === undefined) {
    throw new Error(
      "missing phage life-history authority for matured infection cohort",
    );
  }
  return authority;
}

function singleCohortMaturity(
  matured: MaturedLatentInfections,
  cohort: LatentInfectionCohort,
): MaturedLatentInfections {
  return {
    throughMinutes: matured.throughMinutes,
    infectionCount: cohort.infectionCount,
    cohorts: [cohort],
  };
}

function safeCountSum(name: string, left: number, right: number): number {
  nonNegativeSafeInteger(`${name} left operand`, left);
  nonNegativeSafeInteger(`${name} right operand`, right);
  const sum = left + right;
  if (!Number.isSafeInteger(sum) || sum < 0) {
    throw new RangeError(`${name} exceeds the safe integer count range`);
  }
  return sum;
}

function nonNegativeSafeInteger(name: string, value: unknown): void {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
}

function finiteNonNegative(name: string, value: unknown): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be finite and non-negative`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
