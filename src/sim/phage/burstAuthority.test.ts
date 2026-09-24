import { describe, expect, it } from "vitest";

import {
  DETERMINISTIC_RESIDUAL_BURST_POLICY,
  applyMaturedPhageBurst,
  createPhageBurstPolicyState,
} from "./burstPolicy";
import {
  T4_MG1655_LIFE_HISTORY,
  resolvePhageLifeHistory,
} from "./lifeHistory";
import {
  advanceLatentInfectionQueue,
  createLatentInfectionQueue,
  scheduleLatentInfections,
} from "./latentQueue";

describe("authority-bound phage burst handoff", () => {
  it("retains measured life-history provenance on discrete progeny output", () => {
    const row = T4_MG1655_LIFE_HISTORY.rows[0]!;
    const lifeHistory = resolvePhageLifeHistory(
      T4_MG1655_LIFE_HISTORY,
      row.growthRatePerHour,
    );
    expect(lifeHistory.status).toBe("exact");
    if (lifeHistory.status !== "exact") {
      throw new Error("expected exact life-history row");
    }

    let queue = createLatentInfectionQueue();
    queue = scheduleLatentInfections(queue, {
      infectionCount: 2,
      infectedAtMinutes: 0,
      latentPeriodMinutes: lifeHistory.values.latentPeriodMinutes,
    });
    const matured = advanceLatentInfectionQueue(
      queue,
      lifeHistory.values.latentPeriodMinutes,
    ).matured;

    const result = applyMaturedPhageBurst(
      DETERMINISTIC_RESIDUAL_BURST_POLICY,
      createPhageBurstPolicyState(DETERMINISTIC_RESIDUAL_BURST_POLICY),
      matured,
      lifeHistory,
    );

    expect(result).toMatchObject({
      lysedInfections: 2,
      meanBurstPfuPerCell: 8,
      cohortExpectedPfu: 16,
      releasedPfu: 16,
      sourceEvidenceClass: "measured",
      sourceResolution: "exact",
    });
  });

  it("retains derived interpolation provenance and residual carry", () => {
    const lifeHistory = resolvePhageLifeHistory(
      T4_MG1655_LIFE_HISTORY,
      0.095,
    );
    expect(lifeHistory.status).toBe("interpolated");
    if (lifeHistory.status !== "interpolated") {
      throw new Error("expected interpolated life history");
    }
    expect(lifeHistory.values.burstSizePfuPerCell).toBeCloseTo(10.5, 12);

    const first = applyMaturedPhageBurst(
      DETERMINISTIC_RESIDUAL_BURST_POLICY,
      createPhageBurstPolicyState(DETERMINISTIC_RESIDUAL_BURST_POLICY),
      {
        throughMinutes: 50,
        infectionCount: 1,
        cohorts: [
          {
            sequence: 0,
            infectionCount: 1,
            infectedAtMinutes: 0,
            latentPeriodMinutes: 50,
          },
        ],
      },
      lifeHistory,
    );

    const second = applyMaturedPhageBurst(
      DETERMINISTIC_RESIDUAL_BURST_POLICY,
      first.state,
      {
        throughMinutes: 60,
        infectionCount: 1,
        cohorts: [
          {
            sequence: 1,
            infectionCount: 1,
            infectedAtMinutes: 0,
            latentPeriodMinutes: 60,
          },
        ],
      },
      lifeHistory,
    );

    expect(first).toMatchObject({
      releasedPfu: 10,
      residualAfterPfu: 0.5,
      sourceEvidenceClass: "derived",
      sourceResolution: "interpolated",
    });
    expect(second).toMatchObject({
      releasedPfu: 11,
      residualAfterPfu: 0,
      sourceEvidenceClass: "derived",
      sourceResolution: "interpolated",
    });
  });

  it("cannot release progeny before the latent queue reports maturity", () => {
    const row = T4_MG1655_LIFE_HISTORY.rows[0]!;
    const lifeHistory = resolvePhageLifeHistory(
      T4_MG1655_LIFE_HISTORY,
      row.growthRatePerHour,
    );
    if (lifeHistory.status !== "exact") {
      throw new Error("expected exact life-history row");
    }

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
    const beforeBurst = applyMaturedPhageBurst(
      DETERMINISTIC_RESIDUAL_BURST_POLICY,
      createPhageBurstPolicyState(DETERMINISTIC_RESIDUAL_BURST_POLICY),
      before.matured,
      lifeHistory,
    );

    expect(beforeBurst.lysedInfections).toBe(0);
    expect(beforeBurst.releasedPfu).toBe(0);

    const atBoundary = advanceLatentInfectionQueue(
      before.state,
      lifeHistory.values.latentPeriodMinutes,
    );
    const boundaryBurst = applyMaturedPhageBurst(
      DETERMINISTIC_RESIDUAL_BURST_POLICY,
      beforeBurst.state,
      atBoundary.matured,
      lifeHistory,
    );

    expect(boundaryBurst.lysedInfections).toBe(1);
    expect(boundaryBurst.releasedPfu).toBe(8);
  });

  it("rejects out-of-domain life history instead of accepting an arbitrary mean", () => {
    const outOfDomain = resolvePhageLifeHistory(
      T4_MG1655_LIFE_HISTORY,
      1.5,
    );

    expect(() =>
      applyMaturedPhageBurst(
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

  it("rejects inconsistent or premature matured-cohort handoffs", () => {
    const row = T4_MG1655_LIFE_HISTORY.rows[0]!;
    const lifeHistory = resolvePhageLifeHistory(
      T4_MG1655_LIFE_HISTORY,
      row.growthRatePerHour,
    );
    if (lifeHistory.status !== "exact") {
      throw new Error("expected exact life-history row");
    }
    const state = createPhageBurstPolicyState(
      DETERMINISTIC_RESIDUAL_BURST_POLICY,
    );

    expect(() =>
      applyMaturedPhageBurst(
        DETERMINISTIC_RESIDUAL_BURST_POLICY,
        state,
        {
          throughMinutes: 80,
          infectionCount: 2,
          cohorts: [
            {
              sequence: 0,
              infectionCount: 1,
              infectedAtMinutes: 0,
              latentPeriodMinutes: 80,
            },
          ],
        },
        lifeHistory,
      ),
    ).toThrow(/equal the cohort count sum/);

    expect(() =>
      applyMaturedPhageBurst(
        DETERMINISTIC_RESIDUAL_BURST_POLICY,
        state,
        {
          throughMinutes: 79,
          infectionCount: 1,
          cohorts: [
            {
              sequence: 0,
              infectionCount: 1,
              infectedAtMinutes: 0,
              latentPeriodMinutes: 80,
            },
          ],
        },
        lifeHistory,
      ),
    ).toThrow(/before its lysis boundary/);
  });

  it("rejects duplicate and nondeterministically ordered matured cohorts", () => {
    const row = T4_MG1655_LIFE_HISTORY.rows[0]!;
    const lifeHistory = resolvePhageLifeHistory(
      T4_MG1655_LIFE_HISTORY,
      row.growthRatePerHour,
    );
    if (lifeHistory.status !== "exact") {
      throw new Error("expected exact life-history row");
    }
    const state = createPhageBurstPolicyState(
      DETERMINISTIC_RESIDUAL_BURST_POLICY,
    );

    expect(() =>
      applyMaturedPhageBurst(
        DETERMINISTIC_RESIDUAL_BURST_POLICY,
        state,
        {
          throughMinutes: 80,
          infectionCount: 2,
          cohorts: [
            {
              sequence: 0,
              infectionCount: 1,
              infectedAtMinutes: 0,
              latentPeriodMinutes: 80,
            },
            {
              sequence: 0,
              infectionCount: 1,
              infectedAtMinutes: 0,
              latentPeriodMinutes: 80,
            },
          ],
        },
        lifeHistory,
      ),
    ).toThrow(/sequences must be unique/);

    expect(() =>
      applyMaturedPhageBurst(
        DETERMINISTIC_RESIDUAL_BURST_POLICY,
        state,
        {
          throughMinutes: 80,
          infectionCount: 2,
          cohorts: [
            {
              sequence: 1,
              infectionCount: 1,
              infectedAtMinutes: 0,
              latentPeriodMinutes: 80,
            },
            {
              sequence: 0,
              infectionCount: 1,
              infectedAtMinutes: 0,
              latentPeriodMinutes: 80,
            },
          ],
        },
        lifeHistory,
      ),
    ).toThrow(/deterministic maturity order/);
  });
});
