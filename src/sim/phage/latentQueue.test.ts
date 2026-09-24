import { describe, expect, it } from "vitest";

import {
  T4_MG1655_LIFE_HISTORY,
  createPhageLifeHistoryIdentity,
  resolvePhageLifeHistory,
  type PhageLifeHistoryIdentity,
} from "./lifeHistory";
import {
  PHAGE_LATENT_QUEUE_SCHEMA_VERSION,
  advanceLatentInfectionQueue,
  cohortLysisAtMinutes,
  createLatentInfectionQueue,
  scheduleLatentInfections,
  validateLatentInfectionQueue,
  type LatentInfectionQueueState,
} from "./latentQueue";

function testLifeHistoryIdentity(
  lifeHistoryIdentity: testLifeHistoryIdentity(number),
): PhageLifeHistoryIdentity {
  const row = T4_MG1655_LIFE_HISTORY.rows[0]!;
  const resolved = resolvePhageLifeHistory(
    T4_MG1655_LIFE_HISTORY,
    row.growthRatePerHour,
  );
  if (resolved.status !== "exact") {
    throw new Error("expected exact T4/MG1655 life-history row");
  }
  return {
    ...createPhageLifeHistoryIdentity(resolved),
    latentPeriodMinutes,
  };
}

describe("phage latent infection queue", () => {
  it("orders cohorts deterministically by lysis maturity, then sequence", () => {
    let state = createLatentInfectionQueue(10);

    state = scheduleLatentInfections(state, {
      infectionCount: 2,
      infectedAtMinutes: 10,
      lifeHistoryIdentity: testLifeHistoryIdentity(20),
    });
    state = scheduleLatentInfections(state, {
      infectionCount: 3,
      infectedAtMinutes: 11,
      lifeHistoryIdentity: testLifeHistoryIdentity(5),
    });
    state = scheduleLatentInfections(state, {
      infectionCount: 4,
      infectedAtMinutes: 12,
      lifeHistoryIdentity: testLifeHistoryIdentity(4),
    });

    expect(state.schemaVersion).toBe(PHAGE_LATENT_QUEUE_SCHEMA_VERSION);
    expect(state.cohorts.map((cohort) => cohort.sequence)).toEqual([1, 2, 0]);
    expect(state.cohorts.map(cohortLysisAtMinutes)).toEqual([16, 16, 30]);
  });

  it("matures infections exactly at the total latent-period boundary", () => {
    let state = createLatentInfectionQueue();
    state = scheduleLatentInfections(state, {
      infectionCount: 7,
      infectedAtMinutes: 2,
      lifeHistoryIdentity: testLifeHistoryIdentity(18),
    });

    const before = advanceLatentInfectionQueue(state, 19.999);
    expect(before.matured.infectionCount).toBe(0);
    expect(before.state.cohorts).toHaveLength(1);

    const atBoundary = advanceLatentInfectionQueue(before.state, 20);
    expect(atBoundary.matured.infectionCount).toBe(7);
    expect(atBoundary.matured.cohorts[0]?.sequence).toBe(0);
    expect(atBoundary.state.cohorts).toEqual([]);
    expect(atBoundary.state.currentTimeMinutes).toBe(20);
  });

  it("supports a zero-delay control without inventing burst PFU", () => {
    const scheduled = scheduleLatentInfections(createLatentInfectionQueue(5), {
      infectionCount: 3,
      infectedAtMinutes: 5,
      lifeHistoryIdentity: testLifeHistoryIdentity(0),
    });

    const advanced = advanceLatentInfectionQueue(scheduled, 5);
    expect(advanced.matured.infectionCount).toBe(3);
    expect(advanced.matured.cohorts).toHaveLength(1);
    expect(advanced.state.cohorts).toHaveLength(0);
  });

  it("uses measured/derived life-history latent period only as a maturity delay", () => {
    const sourceRow = T4_MG1655_LIFE_HISTORY.rows[0]!;
    const resolved = resolvePhageLifeHistory(
      T4_MG1655_LIFE_HISTORY,
      sourceRow.growthRatePerHour,
    );
    expect(resolved.status).toBe("exact");
    if (resolved.status !== "exact") return;

    const scheduled = scheduleLatentInfections(createLatentInfectionQueue(), {
      infectionCount: 2,
      infectedAtMinutes: 4,
      lifeHistoryIdentity: testLifeHistoryIdentity(resolved.values.latentPeriodMinutes),
    });
    const cohort = scheduled.cohorts[0]!;

    expect(cohortLysisAtMinutes(cohort)).toBe(
      4 + resolved.values.latentPeriodMinutes,
    );
    expect(cohort.infectionCount).toBe(2);
  });

  it("treats zero infections as a no-op and keeps sequence identity stable", () => {
    const state = createLatentInfectionQueue(3);
    const next = scheduleLatentInfections(state, {
      infectionCount: 0,
      infectedAtMinutes: 3,
      lifeHistoryIdentity: testLifeHistoryIdentity(10),
    });

    expect(next).toBe(state);
    expect(next.nextSequence).toBe(0);
  });

  it("refuses backward biological time and non-discrete infection counts", () => {
    const state = createLatentInfectionQueue(10);

    expect(() =>
      scheduleLatentInfections(state, {
        infectionCount: 1,
        infectedAtMinutes: 9,
        lifeHistoryIdentity: testLifeHistoryIdentity(1),
      }),
    ).toThrow(/cannot precede/);

    expect(() =>
      scheduleLatentInfections(state, {
        infectionCount: 1.5,
        infectedAtMinutes: 10,
        lifeHistoryIdentity: testLifeHistoryIdentity(1),
      }),
    ).toThrow(/safe integer/);

    expect(() => advanceLatentInfectionQueue(state, 9)).toThrow(
      /cannot advance backward/,
    );
  });

  it("refuses sequence allocation before nextSequence becomes unsafe", () => {
    const nearLimit: LatentInfectionQueueState = {
      schemaVersion: PHAGE_LATENT_QUEUE_SCHEMA_VERSION,
      currentTimeMinutes: 0,
      nextSequence: Number.MAX_SAFE_INTEGER - 1,
      cohorts: [],
    };

    const lastRepresentable = scheduleLatentInfections(nearLimit, {
      infectionCount: 1,
      infectedAtMinutes: 0,
      lifeHistoryIdentity: testLifeHistoryIdentity(10),
    });

    expect(lastRepresentable.nextSequence).toBe(Number.MAX_SAFE_INTEGER);
    expect(lastRepresentable.cohorts[0]?.sequence).toBe(
      Number.MAX_SAFE_INTEGER - 1,
    );
    expect(() => validateLatentInfectionQueue(lastRepresentable)).not.toThrow();

    expect(() =>
      scheduleLatentInfections(lastRepresentable, {
        infectionCount: 1,
        infectedAtMinutes: 0,
        lifeHistoryIdentity: testLifeHistoryIdentity(10),
      }),
    ).toThrow(/sequence allocation would exceed safe integer range/);

    const zeroCount = scheduleLatentInfections(lastRepresentable, {
      infectionCount: 0,
      infectedAtMinutes: 0,
      lifeHistoryIdentity: testLifeHistoryIdentity(10),
    });
    expect(zeroCount).toBe(lastRepresentable);
  });

  it("round-trips infection-time life-history identity through serialized queue state", () => {
    const identity = testLifeHistoryIdentity(27);
    const scheduled = scheduleLatentInfections(createLatentInfectionQueue(), {
      infectionCount: 4,
      infectedAtMinutes: 3,
      lifeHistoryIdentity: identity,
    });

    const restored = JSON.parse(
      JSON.stringify(scheduled),
    ) as LatentInfectionQueueState;
    expect(() => validateLatentInfectionQueue(restored)).not.toThrow();
    expect(restored.cohorts[0]?.lifeHistoryIdentity).toEqual(identity);
    expect(restored.cohorts[0]?.lifeHistoryIdentity).not.toBe(identity);
  });

  it("rejects malformed replay-critical life-history identity on restore", () => {
    const identity = testLifeHistoryIdentity(10);
    const malformed = {
      schemaVersion: PHAGE_LATENT_QUEUE_SCHEMA_VERSION,
      currentTimeMinutes: 0,
      nextSequence: 1,
      cohorts: [
        {
          sequence: 0,
          infectionCount: 1,
          infectedAtMinutes: 0,
          lifeHistoryIdentity: {
            ...identity,
            sourceKey: ` ${identity.sourceKey}`,
          },
        },
      ],
    } as unknown as LatentInfectionQueueState;

    expect(() => validateLatentInfectionQueue(malformed)).toThrow(
      /trimmed non-empty string/,
    );
  });

  it("rejects corrupted or nondeterministically ordered queue state", () => {
    const corruptSequence: LatentInfectionQueueState = {
      schemaVersion: PHAGE_LATENT_QUEUE_SCHEMA_VERSION,
      currentTimeMinutes: 0,
      nextSequence: 1,
      cohorts: [
        {
          sequence: 1,
          infectionCount: 1,
          infectedAtMinutes: 0,
          lifeHistoryIdentity: testLifeHistoryIdentity(10),
        },
      ],
    };
    expect(() => validateLatentInfectionQueue(corruptSequence)).toThrow(
      /lower than nextSequence/,
    );

    const unsorted: LatentInfectionQueueState = {
      schemaVersion: PHAGE_LATENT_QUEUE_SCHEMA_VERSION,
      currentTimeMinutes: 0,
      nextSequence: 2,
      cohorts: [
        {
          sequence: 0,
          infectionCount: 1,
          infectedAtMinutes: 0,
          lifeHistoryIdentity: testLifeHistoryIdentity(20),
        },
        {
          sequence: 1,
          infectionCount: 1,
          infectedAtMinutes: 0,
          lifeHistoryIdentity: testLifeHistoryIdentity(10),
        },
      ],
    };
    expect(() => validateLatentInfectionQueue(unsorted)).toThrow(
      /deterministic maturity order/,
    );
  });
});
