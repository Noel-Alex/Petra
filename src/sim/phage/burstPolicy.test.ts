import { describe, expect, it } from "vitest";

import {
  DETERMINISTIC_RESIDUAL_BURST_POLICY,
  PHAGE_BURST_POLICY_IDENTITY,
  PHAGE_BURST_POLICY_SCHEMA_VERSION,
  applyDeterministicPhageBurst,
  createPhageBurstPolicyState,
  phageBurstPolicyIdentity,
  validatePhageBurstPolicyState,
  type PhageBurstPolicyState,
} from "./burstPolicy";
import {
  T4_MG1655_LIFE_HISTORY,
  resolvePhageLifeHistory,
} from "./lifeHistory";

describe("deterministic phage burst-count policy", () => {
  it("carries fractional derived burst expectation across lysis batches", () => {
    const resolved = resolvePhageLifeHistory(T4_MG1655_LIFE_HISTORY, 0.38);
    expect(resolved.status).toBe("interpolated");
    if (resolved.status !== "interpolated") {
      throw new Error("expected interpolated T4/MG1655 life history");
    }
    expect(resolved.values.burstSizePfuPerCell).toBeCloseTo(26.5, 12);

    const initial = createPhageBurstPolicyState(
      DETERMINISTIC_RESIDUAL_BURST_POLICY,
    );
    const first = applyDeterministicPhageBurst(
      DETERMINISTIC_RESIDUAL_BURST_POLICY,
      initial,
      {
        infectionCount: 1,
        meanBurstPfuPerCell: resolved.values.burstSizePfuPerCell,
      },
    );

    expect(first).toMatchObject({
      lysedInfections: 1,
      releasedPfu: 26,
      residualBeforePfu: 0,
      residualAfterPfu: 0.5,
      cohortExpectedPfu: 26.5,
    });

    const second = applyDeterministicPhageBurst(
      DETERMINISTIC_RESIDUAL_BURST_POLICY,
      first.state,
      {
        infectionCount: 1,
        meanBurstPfuPerCell: resolved.values.burstSizePfuPerCell,
      },
    );

    expect(second).toMatchObject({
      lysedInfections: 1,
      releasedPfu: 27,
      residualBeforePfu: 0.5,
      residualAfterPfu: 0,
      cohortExpectedPfu: 26.5,
    });
    expect(first.releasedPfu + second.releasedPfu).toBe(53);
  });

  it("preserves exact integer measured means without inventing variance", () => {
    const sourceRow = T4_MG1655_LIFE_HISTORY.rows[0]!;
    const resolved = resolvePhageLifeHistory(
      T4_MG1655_LIFE_HISTORY,
      sourceRow.growthRatePerHour,
    );
    expect(resolved.status).toBe("exact");
    if (resolved.status !== "exact") throw new Error("expected exact source row");

    const result = applyDeterministicPhageBurst(
      DETERMINISTIC_RESIDUAL_BURST_POLICY,
      createPhageBurstPolicyState(DETERMINISTIC_RESIDUAL_BURST_POLICY),
      {
        infectionCount: 3,
        meanBurstPfuPerCell: resolved.values.burstSizePfuPerCell,
      },
    );

    expect(result.meanBurstPfuPerCell).toBe(sourceRow.burstSizePfuPerCell);
    expect(result.l ysedInfections);
  });

  it("reports lysed infections separately from progeny PFU", () => {
    const result = applyDeterministicPhageBurst(
      DETERMINISTIC_RESIDUAL_BURST_POLICY,
      createPhageBurstPolicyState(DETERMINISTIC_RESIDUAL_BURST_POLICY),
      {
        infectionCount: 3,
        meanBurstPfuPerCell: 8,
      },
    );

    expect(result.lysedInfections).toBe(3);
    expect(result.releasedPfu).toBe(24);
    expect(result.residualAfterPfu).toBe(0);
  });

  it("treats zero infections as a state-preserving no-op", () => {
    const initial: PhageBurstPolicyState = {
      schemaVersion: PHAGE_BURST_POLICY_SCHEMA_VERSION,
      policyIdentity: PHAGE_BURST_POLICY_IDENTITY,
      residualExpectedPfu: 0.75,
    };

    const result = applyDeterministicPhageBurst(
      DETERMINISTIC_RESIDUAL_BURST_POLICY,
      initial,
      {
        infectionCount: 0,
        meanBurstPfuPerCell: 89,
      },
    );

    expect(result.lysedInfections).toBe(0);
    expect(result.releasedPfu).toBe(0);
    expect(result.residualAfterPfu).toBe(0.75);
    expect(result.state).toBe(initial);
  });

  it("supports an explicit zero-burst mechanism control", () => {
    const result = applyDeterministicPhageBurst(
      DETERMINISTIC_RESIDUAL_BURST_POLICY,
      createPhageBurstPolicyState(DETERMINISTIC_RESIDUAL_BURST_POLICY),
      {
        infectionCount: 7,
        meanBurstPfuPerCell: 0,
      },
    );

    expect(result.lysedInfections).toBe(7);
    expect(result.cohortExpectedPfu).toBe(0);
    expect(result.releasedPfu).toBe(0);
    expect(result.residualAfterPfu).toBe(0);
  });

  it("exposes stable policy identity for replay/configuration binding", () => {
    expect(
      phageBurstPolicyIdentity(DETERMINISTIC_RESIDUAL_BURST_POLICY),
    ).toBe(PHAGE_BURST_POLICY_IDENTITY);

    const state = createPhageBurstPolicyState(
      DETERMINISTIC_RESIDUAL_BURST_POLICY,
    );
    expect(state).toEqual({
      schemaVersion: PHAGE_BURST_POLICY_SCHEMA_VERSION,
      policyIdentity: PHAGE_BURST_POLICY_IDENTITY,
      residualExpectedPfu: 0,
    });
  });

  it("rejects corrupt restored residual or policy identity", () => {
    for (const residualExpectedPfu of [
      -0.01,
      1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]) {
      const corrupt = {
        schemaVersion: PHAGE_BURST_POLICY_SCHEMA_VERSION,
        policyIdentity: PHAGE_BURST_POLICY_IDENTITY,
        residualExpectedPfu,
      } as PhageBurstPolicyState;

      expect(() => validatePhageBurstPolicyState(corrupt)).toThrow();
    }

    const mismatched = {
      schemaVersion: PHAGE_BURST_POLICY_SCHEMA_VERSION,
      policyIdentity: "phage-burst-policy:v0:other",
      residualExpectedPfu: 0,
    } as unknown as PhageBurstPolicyState;

    expect(() => validatePhageBurstPolicyState(mismatched)).toThrow(
      /identity/,
    );
  });

  it("rejects non-discrete infections, invalid means, and unsafe PFU output", () => {
    const state = createPhageBurstPolicyState(
      DETERMINISTIC_RESIDUAL_BURST_POLICY,
    );

    for (const infectionCount of [-1, 0.5, Number.POSITIVE_INFINITY]) {
      expect(() =>
        applyDeterministicPhageBurst(
          DETERMINISTIC_RESIDUAL_BURST_POLICY,
          state,
          { infectionCount, meanBurstPfuPerCell: 8 },
        ),
      ).toThrow(/safe integer/);
    }

    for (const meanBurstPfuPerCell of [
      -1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      expect(() =>
        applyDeterministicPhageBurst(
          DETERMINISTIC_RESIDUAL_BURST_POLICY,
          state,
          { infectionCount: 1, meanBurstPfuPerCell },
        ),
      ).toThrow(/meanBurstPfuPerCell/);
    }

    expect(() =>
      applyDeterministicPhageBurst(
        DETERMINISTIC_RESIDUAL_BURST_POLICY,
        state,
        {
          infectionCount: 2,
          meanBurstPfuPerCell: Number.MAX_SAFE_INTEGER,
        },
      ),
    ).toThrow(/safe integer count range/);
  });
});
