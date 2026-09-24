import { describe, expect, it } from "vitest";

import {
  T4_MG1655_LIFE_HISTORY,
  resolvePhageLifeHistory,
  type PhageLifeHistoryResolution,
} from "./lifeHistory";
import {
  advanceLatentInfectionQueue,
  createLatentInfectionQueue,
  scheduleLatentInfections,
  type MaturedLatentInfections,
} from "./latentQueue";
import {
  PHAGE_BURST_POLICY_SCHEMA_VERSION,
  PHAGE_BURST_STATE_SCHEMA_VERSION,
  applyMaturedPhageLysis,
  createPhageBurstState,
  phageBurstPolicyIdentity,
  validatePhageBurstPolicy,
  validatePhageBurstState,
  type PhageBurstPolicy,
  type PhageBurstState,
} from "./burstPolicy";

function policy(
  overrides: Partial<PhageBurstPolicy> = {},
): PhageBurstPolicy {
  return {
    schemaVersion: PHAGE_BURST_POLICY_SCHEMA_VERSION,
    id: "t4-residual-expectation-test",
    discretization: "deterministic-residual-expectation-v1",
    ...overrides,
  };
}

function maturedBatch(
  infectionCount: number,
  throughMinutes: number,
  sequence = 0,
): MaturedLatentInfections {
  return {
    throughMinutes,
    infectionCount,
    cohorts:
      infectionCount === 0
        ? []
        : [
            {
              sequence,
              infectionCount,
              infectedAtMinutes: 0,
              latentPeriodMinutes: throughMinutes,
            },
          ],
  };
}

function exactLifeHistory(): Exclude<
  PhageLifeHistoryResolution,
  { readonly status: "out-of-domain" | "interpolated" }
> {
  const row = T4_MG1655_LIFE_HISTORY.rows[0]!;
  const resolved = resolvePhageLifeHistory(
    T4_MG1655_LIFE_HISTORY,
    row.growthRatePerHour,
  );
  if (resolved.status !== "exact") {
    throw new Error("expected exact life-history row");
  }
  return resolved;
}

describe("phage burst-count policy", () => {
  it("keeps measured burst mean separate from integer progeny bookkeeping", () => {
    const burstPolicy = policy();
    const initial = createPhageBurstState(burstPolicy);
    const resolved = exactLifeHistory();

    const result = applyMaturedPhageLysis(
      initial,
      maturedBatch(2, 80),
      resolved,
      burstPolicy,
    );

    expect(resolved.values.burstSizePfuPerCell).toBe(8);
    expect(result.lysis).toMatchObject({
      lysedInfections: 2,
      releasedPfu: 16,
      meanBurstSizePfuPerCell: 8,
      expectedProgenyPfu: 16,
      sourceEvidenceClass: "measured",
      sourceResolution: "exact",
      discretization: "deterministic-residual-expectation-v1",
      residualExpectedPfuBefore: 0,
      residualExpectedPfuAfter: 0,
    });
    expect(Number.isSafeInteger(result.lysis.releasedPfu)).toBe(true);
    expect(result.state.residualExpectedPfu).toBe(0);
  });

  it("carries fractional expectation across cohorts instead of rounding each cohort", () => {
    const burstPolicy = policy();
    const resolved = resolvePhageLifeHistory(T4_MG1655_LIFE_HISTORY, 0.095);
    expect(resolved.status).toBe("interpolated");
    if (resolved.status !== "interpolated") {
      throw new Error("expected interpolated life history");
    }
    expect(resolved.values.burstSizePfuPerCell).toBeCloseTo(10.5, 12);

    const first = applyMaturedPhageLysis(
      createPhageBurstState(burstPolicy),
      maturedBatch(1, 50, 0),
      resolved,
      burstPolicy,
    );
    expect(first.lysis.releasedPfu).toBe(10);
    expect(first.lysis.residualExpectedPfuAfter).toBeCloseTo(0.5, 12);
    expect(first.lysis.sourceEvidenceClass).toBe("derived");

    const second = applyMaturedPhageLysis(
      first.state,
      maturedBatch(1, 60, 1),
      resolved,
      burstPolicy,
    );
    expect(second.lysis.releasedPfu).toBe(11);
    expect(second.lysis.residualExpectedPfuAfter).toBeCloseTo(0, 12);

    const totalReleased =
      first.lysis.releasedPfu + second.lysis.releasedPfu;
    const totalExpected =
      first.lysis.expectedProgenyPfu + second.lysis.expectedProgenyPfu;
    expect(
      totalReleased + second.lysis.residualExpectedPfuAfter,
    ).toBeCloseTo(totalExpected, 12);
  });

  it("supports an explicit zero-burst engineering control without suppressing lysis", () => {
    const zeroPolicy = policy({
      id: "zero-burst-mechanism-control",
      discretization: "zero-burst-control-v1",
    });
    const initial = createPhageBurstState(zeroPolicy);

    const result = applyMaturedPhageLysis(
      initial,
      maturedBatch(3, 80),
      exactLifeHistory(),
      zeroPolicy,
    );

    expect(result.lysis.lysedInfections).toBe(3);
    expect(result.lysis.releasedPfu).toBe(0);
    expect(result.lysis.expectedProgenyPfu).toBe(24);
    expect(result.lysis.residualExpectedPfuAfter).toBe(0);
    expect(result.state).toBe(initial);
  });

  it("releases no progeny before the reviewed latent-period boundary", () => {
    const burstPolicy = policy();
    const lifeHistory = exactLifeHistory();
    let queue = createLatentInfectionQueue();

    queue = scheduleLatentInfections(queue, {
      infectionCount: 1,
      infectedAtMinutes: 0,
      latentPeriodMinutes: lifeHistory.values.latentPeriodMinutes,
    });

    const before = advanceLatentInfectionQueue(
      queue,
      lifeHistory.values.latentPeriodMinutes - 0.001,
    );
    const beforeLysis = applyMaturedPhageLysis(
      createPhageBurstState(burstPolicy),
      before.matured,
      lifeHistory,
      burstPolicy,
    );
    expect(beforeLysis.lysis.lysedInfections).toBe(0);
    expect(beforeLysis.lysis.releasedPfu).toBe(0);

    const atBoundary = advanceLatentInfectionQueue(
      before.state,
      lifeHistory.values.latentPeriodMinutes,
    );
    const boundaryLysis = applyMaturedPhageLysis(
      beforeLysis.state,
      atBoundary.matured,
      lifeHistory,
      burstPolicy,
    );
    expect(boundaryLysis.lysis.lysedInfections).toBe(1);
    expect(boundaryLysis.lysis.releasedPfu).toBe(8);
  });

  it("keeps zero matured infections a deterministic no-op", () => {
    const burstPolicy = policy();
    const state = createPhageBurstState(burstPolicy);

    const result = applyMaturedPhageLysis(
      state,
      maturedBatch(0, 10),
      exactLifeHistory(),
      burstPolicy,
    );

    expect(result.state).toBe(state);
    expect(result.lysis).toMatchObject({
      lysedInfections: 0,
      releasedPfu: 0,
      expectedProgenyPfu: 0,
      residualExpectedPfuBefore: 0,
      residualExpectedPfuAfter: 0,
    });
  });

  it("rejects OOD life history instead of inventing a burst mean", () => {
    const burstPolicy = policy();
    const outOfDomain = resolvePhageLifeHistory(T4_MG1655_LIFE_HISTORY, 1.5);
    expect(outOfDomain.status).toBe("out-of-domain");

    expect(() =>
      applyMaturedPhageLysis(
        createPhageBurstState(burstPolicy),
        maturedBatch(1, 10),
        outOfDomain,
        burstPolicy,
      ),
    ).toThrow(/requires in-domain/);
  });

  it("rejects corrupt matured-cohort handoffs before progeny accounting", () => {
    const burstPolicy = policy();
    const state = createPhageBurstState(burstPolicy);
    const lifeHistory = exactLifeHistory();

    expect(() =>
      applyMaturedPhageLysis(
        state,
        {
          throughMinutes: 10,
          infectionCount: 2,
          cohorts: [
            {
              sequence: 0,
              infectionCount: 1,
              infectedAtMinutes: 0,
              latentPeriodMinutes: 10,
            },
          ],
        },
        lifeHistory,
        burstPolicy,
      ),
    ).toThrow(/equal the cohort count sum/);

    expect(() =>
      applyMaturedPhageLysis(
        state,
        {
          throughMinutes: 10,
          infectionCount: 1,
          cohorts: [
            {
              sequence: 0,
              infectionCount: 1,
              infectedAtMinutes: 0,
              latentPeriodMinutes: 11,
            },
          ],
        },
        lifeHistory,
        burstPolicy,
      ),
    ).toThrow(/cannot precede its lysis boundary/);
  });

  it("rejects unsafe progeny expectation instead of overflowing discrete PFU", () => {
    const burstPolicy = policy();
    const lifeHistory = exactLifeHistory();
    const overflowLifeHistory = {
      ...lifeHistory,
      values: {
        ...lifeHistory.values,
        burstSizePfuPerCell: Number.MAX_SAFE_INTEGER,
      },
    };

    expect(() =>
      applyMaturedPhageLysis(
        createPhageBurstState(burstPolicy),
        maturedBatch(2, 80),
        overflowLifeHistory,
        burstPolicy,
      ),
    ).toThrow(/exceeds safe integer accounting range/);
  });

  it("makes policy identity and residual state replay-critical", () => {
    const a = policy({ id: "policy-a" });
    const b = policy({ id: "policy-b" });

    expect(phageBurstPolicyIdentity(a)).not.toBe(phageBurstPolicyIdentity(b));

    const stateA = createPhageBurstState(a);
    expect(() => validatePhageBurstState(stateA, b)).toThrow(
      /policy identity mismatch/,
    );

    const corruptResidual: PhageBurstState = {
      schemaVersion: PHAGE_BURST_STATE_SCHEMA_VERSION,
      policyIdentity: phageBurstPolicyIdentity(a),
      residualExpectedPfu: 1,
    };
    expect(() => validatePhageBurstState(corruptResidual, a)).toThrow(
      /finite in \[0, 1\)/,
    );

    const zeroControl = policy({
      id: "zero",
      discretization: "zero-burst-control-v1",
    });
    const impossibleZeroState: PhageBurstState = {
      schemaVersion: PHAGE_BURST_STATE_SCHEMA_VERSION,
      policyIdentity: phageBurstPolicyIdentity(zeroControl),
      residualExpectedPfu: 0.25,
    };
    expect(() =>
      validatePhageBurstState(impossibleZeroState, zeroControl),
    ).toThrow(/cannot carry residual/);
  });

  it("rejects unsupported or malformed policy versions and ids", () => {
    expect(() =>
      validatePhageBurstPolicy(
        {
          schemaVersion: 2,
          id: "future",
          discretization: "deterministic-residual-expectation-v1",
        } as unknown as PhageBurstPolicy,
      ),
    ).toThrow(/unsupported phage burst policy version/);

    expect(() =>
      validatePhageBurstPolicy(policy({ id: " padded " })),
    ).toThrow(/trimmed non-empty/);
  });
});
