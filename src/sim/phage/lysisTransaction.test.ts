import { describe, expect, it } from "vitest";

import {
  DETERMINISTIC_RESIDUAL_BURST_POLICY,
  PHAGE_BURST_POLICY_IDENTITY,
  PHAGE_BURST_POLICY_SCHEMA_VERSION,
} from "./burstPolicy";
import {
  createPhageLifeHistoryIdentity,
  resolvePhageLifeHistory,
  T4_MG1655_LIFE_HISTORY,
  type InDomainPhageLifeHistoryResolution,
} from "./lifeHistory";
import { scheduleLatentInfections } from "./latentQueue";
import {
  applyPhageLysisTransaction,
  createPhageLysisTransactionState,
  validatePhageLysisTransactionState,
  type PhageLysisTransactionState,
} from "./lysisTransaction";

function exactLifeHistory(
  growthRatePerHour: number,
): InDomainPhageLifeHistoryResolution {
  const resolved = resolvePhageLifeHistory(
    T4_MG1655_LIFE_HISTORY,
    growthRatePerHour,
  );
  if (resolved.status === "out-of-domain") {
    throw new Error("expected in-domain T4/MG1655 life history");
  }
  return resolved;
}

function withScheduledInfections(
  state: PhageLysisTransactionState,
  lifeHistory: InDomainPhageLifeHistoryResolution,
  infectionCount: number,
  infectedAtMinutes = 0,
): PhageLysisTransactionState {
  return {
    ...state,
    latentQueue: scheduleLatentInfections(state.latentQueue, {
      infectionCount,
      infectedAtMinutes,
      lifeHistoryIdentity: createPhageLifeHistoryIdentity(lifeHistory),
    }),
  };
}

describe("atomic phage lysis transaction", () => {
  it("advances queue time without changing PFU or residual before maturity", () => {
    const lifeHistory = exactLifeHistory(0.06);
    const initial = withScheduledInfections(
      createPhageLysisTransactionState(DETERMINISTIC_RESIDUAL_BURST_POLICY, {
        freePfu: 7,
      }),
      lifeHistory,
      2,
    );

    const result = applyPhageLysisTransaction(
      DETERMINISTIC_RESIDUAL_BURST_POLICY,
      initial,
      {
        throughMinutes: lifeHistory.values.latentPeriodMinutes - 0.001,
        lifeHistories: [],
      },
    );

    expect(result.hostDecrementCount).toBe(0);
    expect(result.releasedPfu).toBe(0);
    expect(result.lyses).toEqual([]);
    expect(result.state.freePfu).toBe(7);
    expect(result.state.burstPolicyState).toBe(initial.burstPolicyState);
    expect(result.state.latentQueue.cohorts).toHaveLength(1);
  });

  it("commits queue advancement, exact host decrement, residual, and free PFU together", () => {
    const lifeHistory = exactLifeHistory(0.06);
    const initial = withScheduledInfections(
      createPhageLysisTransactionState(DETERMINISTIC_RESIDUAL_BURST_POLICY, {
        freePfu: 5,
      }),
      lifeHistory,
      2,
    );

    const result = applyPhageLysisTransaction(
      DETERMINISTIC_RESIDUAL_BURST_POLICY,
      initial,
      {
        throughMinutes: lifeHistory.values.latentPeriodMinutes,
        lifeHistories: [lifeHistory],
      },
    );

    expect(result).toMatchObject({
      hostDecrementCount: 2,
      releasedPfu: 16,
      maturedCohortSequences: [0],
      state: {
        freePfu: 21,
        burstPolicyState: {
          residualExpectedPfu: 0,
        },
        latentQueue: {
          cohorts: [],
          currentTimeMinutes: lifeHistory.values.latentPeriodMinutes,
        },
      },
    });
    expect(result.lyses).toHaveLength(1);
    expect(result.lyses[0]?.burst.lysedInfections).toBe(2);
  });

  it("carries deterministic fractional burst residual in the same transaction state", () => {
    const lifeHistory = exactLifeHistory(0.38);
    expect(lifeHistory.status).toBe("interpolated");
    expect(lifeHistory.values.burstSizePfuPerCell).toBeCloseTo(26.5, 12);

    const firstInput = withScheduledInfections(
      createPhageLysisTransactionState(DETERMINISTIC_RESIDUAL_BURST_POLICY),
      lifeHistory,
      1,
    );
    const first = applyPhageLysisTransaction(
      DETERMINISTIC_RESIDUAL_BURST_POLICY,
      firstInput,
      {
        throughMinutes: lifeHistory.values.latentPeriodMinutes,
        lifeHistories: [lifeHistory],
      },
    );
    expect(first.releasedPfu).toBe(26);
    expect(first.state.freePfu).toBe(26);
    expect(first.state.burstPolicyState.residualExpectedPfu).toBeCloseTo(
      0.5,
      12,
    );

    const secondInput = withScheduledInfections(
      first.state,
      lifeHistory,
      1,
      lifeHistory.values.latentPeriodMinutes,
    );
    const second = applyPhageLysisTransaction(
      DETERMINISTIC_RESIDUAL_BURST_POLICY,
      secondInput,
      {
        throughMinutes: lifeHistory.values.latentPeriodMinutes * 2,
        lifeHistories: [lifeHistory],
      },
    );

    expect(second.releasedPfu).toBe(27);
    expect(second.state.freePfu).toBe(53);
    expect(second.state.burstPolicyState.residualExpectedPfu).toBe(0);
  });

  it("processes equal-latency different-burst cohorts in deterministic queue order", () => {
    const lower = exactLifeHistory(0.82);
    const upper = exactLifeHistory(0.98);
    expect(lower.values.latentPeriodMinutes).toBe(27);
    expect(upper.values.latentPeriodMinutes).toBe(27);
    expect(lower.values.burstSizePfuPerCell).toBe(75);
    expect(upper.values.burstSizePfuPerCell).toBe(89);

    let initial = createPhageLysisTransactionState(
      DETERMINISTIC_RESIDUAL_BURST_POLICY,
    );
    initial = withScheduledInfections(initial, lower, 1);
    initial = withScheduledInfections(initial, upper, 1);

    const result = applyPhageLysisTransaction(
      DETERMINISTIC_RESIDUAL_BURST_POLICY,
      initial,
      {
        throughMinutes: 27,
        // Deliberately reverse authority-list order; queue sequence remains authoritative.
        lifeHistories: [upper, lower],
      },
    );

    expect(result.hostDecrementCount).toBe(2);
    expect(result.releasedPfu).toBe(164);
    expect(result.state.freePfu).toBe(164);
    expect(result.maturedCohortSequences).toEqual([0, 1]);
    expect(result.lyses.map((lysis) => lysis.burst.releasedPfu)).toEqual([
      75,
      89,
    ]);
  });

  it("fails atomically when a matured cohort has no matching life-history authority", () => {
    const lower = exactLifeHistory(0.82);
    const upper = exactLifeHistory(0.98);
    let initial = createPhageLysisTransactionState(
      DETERMINISTIC_RESIDUAL_BURST_POLICY,
      { freePfu: 10 },
    );
    initial = withScheduledInfections(initial, lower, 1);
    initial = withScheduledInfections(initial, upper, 1);
    const before = JSON.parse(JSON.stringify(initial));

    expect(() =>
      applyPhageLysisTransaction(
        DETERMINISTIC_RESIDUAL_BURST_POLICY,
        initial,
        {
          throughMinutes: 27,
          lifeHistories: [lower],
        },
      ),
    ).toThrow(/missing phage life-history authority/);

    expect(initial).toEqual(before);
  });

  it("fails atomically when released progeny would overflow discrete free PFU", () => {
    const lifeHistory = exactLifeHistory(0.06);
    const initial = withScheduledInfections(
      createPhageLysisTransactionState(DETERMINISTIC_RESIDUAL_BURST_POLICY, {
        freePfu: Number.MAX_SAFE_INTEGER - 5,
      }),
      lifeHistory,
      1,
    );
    const before = JSON.parse(JSON.stringify(initial));

    expect(() =>
      applyPhageLysisTransaction(
        DETERMINISTIC_RESIDUAL_BURST_POLICY,
        initial,
        {
          throughMinutes: lifeHistory.values.latentPeriodMinutes,
          lifeHistories: [lifeHistory],
        },
      ),
    ).toThrow(/free PFU after phage lysis exceeds the safe integer count range/);

    expect(initial).toEqual(before);
  });

  it("replays identically from serialized transaction state", () => {
    const lifeHistory = exactLifeHistory(0.38);
    const initial = withScheduledInfections(
      createPhageLysisTransactionState(DETERMINISTIC_RESIDUAL_BURST_POLICY, {
        freePfu: 3,
      }),
      lifeHistory,
      2,
    );
    const restored = JSON.parse(
      JSON.stringify(initial),
    ) as PhageLysisTransactionState;
    expect(() => validatePhageLysisTransactionState(restored)).not.toThrow();

    const args = {
      throughMinutes: lifeHistory.values.latentPeriodMinutes,
      lifeHistories: [lifeHistory],
    } as const;
    const originalResult = applyPhageLysisTransaction(
      DETERMINISTIC_RESIDUAL_BURST_POLICY,
      initial,
      args,
    );
    const restoredResult = applyPhageLysisTransaction(
      DETERMINISTIC_RESIDUAL_BURST_POLICY,
      restored,
      args,
    );

    expect(restoredResult).toEqual(originalResult);
  });

  it("rejects corrupt transaction state before queue or burst work", () => {
    const corrupt = {
      ...createPhageLysisTransactionState(DETERMINISTIC_RESIDUAL_BURST_POLICY),
      freePfu: -1,
    } as PhageLysisTransactionState;
    expect(() => validatePhageLysisTransactionState(corrupt)).toThrow(
      /non-negative safe integer/,
    );

    const wrongPolicy = {
      ...createPhageLysisTransactionState(DETERMINISTIC_RESIDUAL_BURST_POLICY),
      burstPolicyState: {
        schemaVersion: PHAGE_BURST_POLICY_SCHEMA_VERSION,
        policyIdentity: PHAGE_BURST_POLICY_IDENTITY,
        residualExpectedPfu: 1,
      },
    } as PhageLysisTransactionState;
    expect(() => validatePhageLysisTransactionState(wrongPolicy)).toThrow(
      /residualExpectedPfu/,
    );
  });
});
