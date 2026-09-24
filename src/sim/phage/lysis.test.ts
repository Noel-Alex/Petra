import { describe, expect, it } from "vitest";

import {
  DETERMINISTIC_RESIDUAL_BURST_POLICY,
  PHAGE_BURST_POLICY_IDENTITY,
  PHAGE_BURST_POLICY_SCHEMA_VERSION,
  createPhageBurstPolicyState,
  type PhageBurstPolicyState,
} from "./burstPolicy";
import {
  T4_MG1655_LIFE_HISTORY,
  createPhageLifeHistoryIdentity,
  resolvePhageLifeHistory,
  type PhageLifeHistoryIdentity,
  type PhageLifeHistoryResolution,
} from "./lifeHistory";
import {
  advanceLatentInfectionQueue,
  createLatentInfectionQueue,
  scheduleLatentInfections,
  type MaturedLatentInfections,
} from "./latentQueue";
import {
  applyMaturedPhageLysis,
  validateMaturedLatentInfections,
} from "./lysis";

function exactLifeHistory() {
  const row = T4_MG1655_LIFE_HISTORY.rows[0]!;
  const resolved = resolvePhageLifeHistory(
    T4_MG1655_LIFE_HISTORY,
    row.growthRatePerHour,
  );
  if (resolved.status !== "exact") {
    throw new Error("expected exact T4/MG1655 life-history row");
  }
  return resolved;
}

function testLifeHistoryIdentity(
  latentPeriodMinutes: number,
): PhageLifeHistoryIdentity {
  return {
    ...createPhageLifeHistoryIdentity(exactLifeHistory()),
    latentPeriodMinutes,
  };
}

function maturedBatch(
  lifeHistory: Exclude<
    PhageLifeHistoryResolution,
    { readonly status: "out-of-domain" }
  >,
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
              infectedAtMinutes:
                throughMinutes - lifeHistory.values.latentPeriodMinutes,
              lifeHistoryIdentity: createPhageLifeHistoryIdentity(lifeHistory),
            },
          ],
  };
}

describe("matured phage lysis authority", () => {
  it("releases no progeny before maturity and binds exact source evidence at the boundary", () => {
    const lifeHistory = exactLifeHistory();
    let queue = createLatentInfectionQueue();

    queue = scheduleLatentInfections(queue, {
      infectionCount: 2,
      infectedAtMinutes: 0,
      lifeHistoryIdentity: createPhageLifeHistoryIdentity(lifeHistory),
    });

    const before = advanceLatentInfectionQueue(
      queue,
      lifeHistory.values.latentPeriodMinutes - 0.001,
    );
    const burstState = createPhageBurstPolicyState(
      DETERMINISTIC_RESIDUAL_BURST_POLICY,
    );
    const beforeLysis = applyMaturedPhageLysis(
      DETERMINISTIC_RESIDUAL_BURST_POLICY,
      burstState,
      before.matured,
      lifeHistory,
    );

    expect(beforeLysis.burst.lysedInfections).toBe(0);
    expect(beforeLysis.burst.releasedPfu).toBe(0);
    expect(beforeLysis.burst.state).toBe(burstState);

    const atBoundary = advanceLatentInfectionQueue(
      before.state,
      lifeHistory.values.latentPeriodMinutes,
    );
    const lysis = applyMaturedPhageLysis(
      DETERMINISTIC_RESIDUAL_BURST_POLICY,
      beforeLysis.burst.state,
      atBoundary.matured,
      lifeHistory,
    );

    expect(lysis).toMatchObject({
      throughMinutes: lifeHistory.values.latentPeriodMinutes,
      maturedCohortSequences: [0],
      provenance: {
        requestedGrowthRatePerHour: lifeHistory.requestedGrowthRatePerHour,
        status: "exact",
        evidenceClass: "measured",
        sourceKey: lifeHistory.source.key,
        sourceDoi: lifeHistory.source.doi,
        latentPeriodMinutes: lifeHistory.values.latentPeriodMinutes,
        meanBurstPfuPerCell: lifeHistory.values.burstSizePfuPerCell,
      },
      burst: {
        lysedInfections: 2,
        meanBurstPfuPerCell: lifeHistory.values.burstSizePfuPerCell,
        releasedPfu: 16,
        residualAfterPfu: 0,
      },
    });
  });

  it("preserves derived evidence classification while reusing residual carry", () => {
    const lifeHistory = resolvePhageLifeHistory(
      T4_MG1655_LIFE_HISTORY,
      0.38,
    );
    expect(lifeHistory.status).toBe("interpolated");
    if (lifeHistory.status !== "interpolated") {
      throw new Error("expected interpolated T4/MG1655 life history");
    }
    expect(lifeHistory.values.burstSizePfuPerCell).toBeCloseTo(26.5, 12);

    const initial = createPhageBurstPolicyState(
      DETERMINISTIC_RESIDUAL_BURST_POLICY,
    );
    const first = applyMaturedPhageLysis(
      DETERMINISTIC_RESIDUAL_BURST_POLICY,
      initial,
      maturedBatch(
        lifeHistory,
        1,
        lifeHistory.values.latentPeriodMinutes,
        2,
      ),
      lifeHistory,
    );
    const second = applyMaturedPhageLysis(
      DETERMINISTIC_RESIDUAL_BURST_POLICY,
      first.burst.state,
      maturedBatch(
        lifeHistory,
        1,
        lifeHistory.values.latentPeriodMinutes + 10,
        3,
      ),
      lifeHistory,
    );

    expect(first.provenance.evidenceClass).toBe("derived");
    expect(first.provenance.status).toBe("interpolated");
    expect(first.burst.releasedPfu).toBe(26);
    expect(first.burst.residualAfterPfu).toBeCloseTo(0.5, 12);
    expect(second.burst.releasedPfu).toBe(27);
    expect(second.burst.residualAfterPfu).toBeCloseTo(0, 12);
  });

  it("rejects out-of-domain life history instead of inventing burst authority", () => {
    const outOfDomain = resolvePhageLifeHistory(
      T4_MG1655_LIFE_HISTORY,
      T4_MG1655_LIFE_HISTORY.measuredDomain.growthRatePerHourMax + 0.1,
    );
    expect(outOfDomain.status).toBe("out-of-domain");

    expect(() =>
      applyMaturedPhageLysis(
        DETERMINISTIC_RESIDUAL_BURST_POLICY,
        createPhageBurstPolicyState(DETERMINISTIC_RESIDUAL_BURST_POLICY),
        {
          throughMinutes: 10,
          infectionCount: 0,
          cohorts: [],
        },
        outOfDomain,
      ),
    ).toThrow(/in-domain life-history/);
  });

  it("rejects inconsistent matured counts, future cohorts, duplicates, and order drift", () => {
    expect(() =>
      validateMaturedLatentInfections({
        throughMinutes: 10,
        infectionCount: 2,
        cohorts: [
          {
            sequence: 0,
            infectionCount: 1,
            infectedAtMinutes: 0,
            lifeHistoryIdentity: testLifeHistoryIdentity(10),
          },
        ],
      }),
    ).toThrow(/equal the cohort count sum/);

    expect(() =>
      validateMaturedLatentInfections({
        throughMinutes: 10,
        infectionCount: 1,
        cohorts: [
          {
            sequence: 0,
            infectionCount: 1,
            infectedAtMinutes: 0,
            lifeHistoryIdentity: testLifeHistoryIdentity(11),
          },
        ],
      }),
    ).toThrow(/cannot precede its lysis boundary/);

    expect(() =>
      validateMaturedLatentInfections({
        throughMinutes: 20,
        infectionCount: 2,
        cohorts: [
          {
            sequence: 0,
            infectionCount: 1,
            infectedAtMinutes: 0,
            lifeHistoryIdentity: testLifeHistoryIdentity(10),
          },
          {
            sequence: 0,
            infectionCount: 1,
            infectedAtMinutes: 0,
            lifeHistoryIdentity: testLifeHistoryIdentity(10),
          },
        ],
      }),
    ).toThrow(/sequences must be unique/);

    expect(() =>
      validateMaturedLatentInfections({
        throughMinutes: 20,
        infectionCount: 2,
        cohorts: [
          {
            sequence: 1,
            infectionCount: 1,
            infectedAtMinutes: 0,
            lifeHistoryIdentity: testLifeHistoryIdentity(15),
          },
          {
            sequence: 0,
            infectionCount: 1,
            infectedAtMinutes: 0,
            lifeHistoryIdentity: testLifeHistoryIdentity(10),
          },
        ],
      }),
    ).toThrow(/deterministic maturity order/);
  });

  it("rejects a burst resolution that is not the same life-history state used for latency", () => {
    const first = exactLifeHistory();
    const secondRow = T4_MG1655_LIFE_HISTORY.rows[1]!;
    const second = resolvePhageLifeHistory(
      T4_MG1655_LIFE_HISTORY,
      secondRow.growthRatePerHour,
    );
    if (second.status !== "exact") {
      throw new Error("expected second exact T4/MG1655 life-history row");
    }

    expect(first.values.latentPeriodMinutes).not.toBe(
      second.values.latentPeriodMinutes,
    );

    expect(() =>
      applyMaturedPhageLysis(
        DETERMINISTIC_RESIDUAL_BURST_POLICY,
        createPhageBurstPolicyState(DETERMINISTIC_RESIDUAL_BURST_POLICY),
        maturedBatch(
          first,
          1,
          first.values.latentPeriodMinutes,
        ),
        second,
      ),
    ).toThrow(/life-history identity does not match/);
  });

  it("rejects a different infection-time state even when latent periods are equal", () => {
    const lowerRow = T4_MG1655_LIFE_HISTORY.rows[6]!;
    const upperRow = T4_MG1655_LIFE_HISTORY.rows[7]!;
    const lower = resolvePhageLifeHistory(
      T4_MG1655_LIFE_HISTORY,
      lowerRow.growthRatePerHour,
    );
    const upper = resolvePhageLifeHistory(
      T4_MG1655_LIFE_HISTORY,
      upperRow.growthRatePerHour,
    );
    if (lower.status !== "exact" || upper.status !== "exact") {
      throw new Error("expected exact equal-latency T4/MG1655 rows");
    }

    expect(lower.values.latentPeriodMinutes).toBe(27);
    expect(upper.values.latentPeriodMinutes).toBe(27);
    expect(lower.values.burstSizePfuPerCell).toBe(75);
    expect(upper.values.burstSizePfuPerCell).toBe(89);

    expect(() =>
      applyMaturedPhageLysis(
        DETERMINISTIC_RESIDUAL_BURST_POLICY,
        createPhageBurstPolicyState(DETERMINISTIC_RESIDUAL_BURST_POLICY),
        maturedBatch(lower, 1, 27),
        upper,
      ),
    ).toThrow(/life-history identity does not match/);
  });

  it("fails closed on malformed serialized handoffs instead of property-access errors", () => {
    expect(() =>
      validateMaturedLatentInfections(
        null as unknown as MaturedLatentInfections,
      ),
    ).toThrow(/must be an object/);

    const malformedResolution = {
      ...exactLifeHistory(),
      evidenceClass: "derived",
    } as unknown as PhageLifeHistoryResolution;

    expect(() =>
      applyMaturedPhageLysis(
        DETERMINISTIC_RESIDUAL_BURST_POLICY,
        createPhageBurstPolicyState(DETERMINISTIC_RESIDUAL_BURST_POLICY),
        maturedBatch(exactLifeHistory(), 0, 0),
        malformedResolution,
      ),
    ).toThrow(/evidence class/);
  });

  it("preserves an existing burst residual on a valid zero-maturity handoff", () => {
    const state: PhageBurstPolicyState = {
      schemaVersion: PHAGE_BURST_POLICY_SCHEMA_VERSION,
      policyIdentity: PHAGE_BURST_POLICY_IDENTITY,
      residualExpectedPfu: 0.75,
    };
    const lifeHistory = exactLifeHistory();

    const result = applyMaturedPhageLysis(
      DETERMINISTIC_RESIDUAL_BURST_POLICY,
      state,
      maturedBatch(lifeHistory, 0, 5),
      lifeHistory,
    );

    expect(result.burst.state).toBe(state);
    expect(result.burst.releasedPfu).toBe(0);
    expect(result.burst.residualAfterPfu).toBe(0.75);
  });
});
