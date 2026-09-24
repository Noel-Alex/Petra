import { describe, expect, it } from "vitest";

import {
  T4_MG1655_LIFE_HISTORY,
  resolvePhageLifeHistory,
  type PhageLifeHistoryResolution,
} from "./lifeHistory";
import type { MaturedLatentInfections } from "./latentQueue";
import {
  PHAGE_BURST_COUNT_POLICY_SCHEMA_VERSION,
  burstCountPolicyIdentity,
  createBurstCountState,
  resolveLysisBurstCount,
  type PhageBurstCountPolicy,
} from "./burstCount";

const RESIDUAL_POLICY: PhageBurstCountPolicy = {
  schemaVersion: PHAGE_BURST_COUNT_POLICY_SCHEMA_VERSION,
  id: "t4-residual-expectation-v1",
  kind: "deterministic-residual-expectation-v1",
  classification: "model",
  limitation:
    "Discretizes the resolved mean without asserting an individual-burst distribution.",
};

const ZERO_BURST_CONTROL: PhageBurstCountPolicy = {
  schemaVersion: PHAGE_BURST_COUNT_POLICY_SCHEMA_VERSION,
  id: "zero-burst-control-v1",
  kind: "zero-burst-control-v1",
  classification: "engineering-control",
  limitation: "Mechanism control only; not a biological T4 burst estimate.",
};

function matured(
  infectionCount: number,
  sequence = 0,
): MaturedLatentInfections {
  if (infectionCount === 0) {
    return {
      throughMinutes: 20,
      infectionCount: 0,
      cohorts: [],
    };
  }

  return {
    throughMinutes: 20,
    infectionCount,
    cohorts: [
      {
        sequence,
        infectionCount,
        infectedAtMinutes: 0,
        latentPeriodMinutes: 20,
      },
    ],
  };
}

function exactLifeHistory(): PhageLifeHistoryResolution {
  return resolvePhageLifeHistory(
    T4_MG1655_LIFE_HISTORY,
    T4_MG1655_LIFE_HISTORY.rows[0]!.growthRatePerHour,
  );
}

function halfStepLifeHistory(): PhageLifeHistoryResolution {
  const lower = T4_MG1655_LIFE_HISTORY.rows[0]!;
  const upper = T4_MG1655_LIFE_HISTORY.rows[1]!;
  return resolvePhageLifeHistory(
    T4_MG1655_LIFE_HISTORY,
    (lower.growthRatePerHour + upper.growthRatePerHour) / 2,
  );
}

describe("phage burst-count policy", () => {
  it("keeps policy identity replay-critical and separate from source evidence", () => {
    const identity = burstCountPolicyIdentity(RESIDUAL_POLICY);
    const state = createBurstCountState(RESIDUAL_POLICY);

    expect(state.policyIdentity).toBe(identity);
    expect(state.residualExpectedPfu).toBe(0);
    expect(identity).toContain("deterministic-residual-expectation-v1");
    expect(identity).not.toContain("measured");
  });

  it("carries fractional expected PFU instead of rounding every lysis batch", () => {
    const lifeHistory = halfStepLifeHistory();
    expect(lifeHistory.status).toBe("interpolated");
    if (lifeHistory.status !== "interpolated") return;
    expect(lifeHistory.values.burstSizePfuPerCell).toBe(10.5);

    const first = resolveLysisBurstCount({
      matured: matured(1, 3),
      lifeHistory,
      policy: RESIDUAL_POLICY,
      state: createBurstCountState(RESIDUAL_POLICY),
    });

    expect(first.sourceEvidenceClass).toBe("derived");
    expect(first.countPolicyClassification).toBe("model");
    expect(first.sourceExpectedProgenyPfu).toBe(10.5);
    expect(first.progenyPfu).toBe(10);
    expect(first.state.residualExpectedPfu).toBe(0.5);
    expect(first.lysedHostCount).toBe(1);
    expect(first.maturedCohortSequences).toEqual([3]);

    const second = resolveLysisBurstCount({
      matured: matured(1, 4),
      lifeHistory,
      policy: RESIDUAL_POLICY,
      state: first.state,
    });

    expect(second.progenyPfu).toBe(11);
    expect(second.state.residualExpectedPfu).toBe(0);
    expect(first.progenyPfu + second.progenyPfu).toBe(21);
  });

  it("preserves an exact measured integer burst expectation", () => {
    const lifeHistory = exactLifeHistory();
    expect(lifeHistory.status).toBe("exact");
    if (lifeHistory.status !== "exact") return;

    const outcome = resolveLysisBurstCount({
      matured: matured(3),
      lifeHistory,
      policy: RESIDUAL_POLICY,
      state: createBurstCountState(RESIDUAL_POLICY),
    });

    expect(outcome.sourceEvidenceClass).toBe("measured");
    expect(outcome.sourceMeanBurstSizePfuPerCell).toBe(8);
    expect(outcome.sourceExpectedProgenyPfu).toBe(24);
    expect(outcome.progenyPfu).toBe(24);
    expect(outcome.state.residualExpectedPfu).toBe(0);
    expect(outcome.lysedHostCount).toBe(3);
  });

  it("supports an explicit zero-burst engineering control", () => {
    const lifeHistory = exactLifeHistory();
    expect(lifeHistory.status).toBe("exact");
    if (lifeHistory.status !== "exact") return;

    const outcome = resolveLysisBurstCount({
      matured: matured(3),
      lifeHistory,
      policy: ZERO_BURST_CONTROL,
      state: createBurstCountState(ZERO_BURST_CONTROL),
    });

    expect(outcome.sourceExpectedProgenyPfu).toBe(24);
    expect(outcome.progenyPfu).toBe(0);
    expect(outcome.countPolicyClassification).toBe("engineering-control");
    expect(outcome.state.residualExpectedPfu).toBe(0);
  });

  it("does not release a carried fraction when no infections mature", () => {
    const lifeHistory = halfStepLifeHistory();
    expect(lifeHistory.status).toBe("interpolated");
    if (lifeHistory.status !== "interpolated") return;

    const first = resolveLysisBurstCount({
      matured: matured(1),
      lifeHistory,
      policy: RESIDUAL_POLICY,
      state: createBurstCountState(RESIDUAL_POLICY),
    });
    expect(first.state.residualExpectedPfu).toBe(0.5);

    const empty = resolveLysisBurstCount({
      matured: matured(0),
      lifeHistory,
      policy: RESIDUAL_POLICY,
      state: first.state,
    });
    expect(empty.progenyPfu).toBe(0);
    expect(empty.lysedHostCount).toBe(0);
    expect(empty.state).toBe(first.state);
  });

  it("refuses out-of-domain life history and inconsistent matured cohorts", () => {
    const outOfDomain = resolvePhageLifeHistory(
      T4_MG1655_LIFE_HISTORY,
      T4_MG1655_LIFE_HISTORY.measuredDomain.growthRatePerHourMax + 0.1,
    );

    expect(() =>
      resolveLysisBurstCount({
        matured: matured(1),
        lifeHistory: outOfDomain,
        policy: RESIDUAL_POLICY,
        state: createBurstCountState(RESIDUAL_POLICY),
      }),
    ).toThrow(/in-domain/);

    const inconsistent: MaturedLatentInfections = {
      throughMinutes: 20,
      infectionCount: 2,
      cohorts: [
        {
          sequence: 0,
          infectionCount: 1,
          infectedAtMinutes: 0,
          latentPeriodMinutes: 20,
        },
      ],
    };

    expect(() =>
      resolveLysisBurstCount({
        matured: inconsistent,
        lifeHistory: exactLifeHistory(),
        policy: RESIDUAL_POLICY,
        state: createBurstCountState(RESIDUAL_POLICY),
      }),
    ).toThrow(/sum of matured cohorts/);
  });

  it("rejects policy-state drift and unsafe progeny expectations", () => {
    const lifeHistory = exactLifeHistory();

    expect(() =>
      resolveLysisBurstCount({
        matured: matured(1),
        lifeHistory,
        policy: RESIDUAL_POLICY,
        state: createBurstCountState(ZERO_BURST_CONTROL),
      }),
    ).toThrow(/policy identity mismatch/);

    expect(() =>
      resolveLysisBurstCount({
        matured: matured(Number.MAX_SAFE_INTEGER),
        lifeHistory,
        policy: RESIDUAL_POLICY,
        state: createBurstCountState(RESIDUAL_POLICY),
      }),
    ).toThrow(/exceeds safe integer range/);
  });
});
