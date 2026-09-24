import { describe, expect, it } from "vitest";
import {
  T4_MG1655_LIFE_HISTORY,
  resolvePhageLifeHistory,
} from "./lifeHistory";

describe("T4 / MG1655 life-history evidence", () => {
  it("preserves every measured source row exactly", () => {
    expect(T4_MG1655_LIFE_HISTORY.rows).toHaveLength(8);
    expect(T4_MG1655_LIFE_HISTORY.source.doi).toBe("10.1002/mbo3.558");
    expect(T4_MG1655_LIFE_HISTORY.phage).toEqual({
      name: "T4",
      collectionId: "DSM 4505",
    });
    expect(T4_MG1655_LIFE_HISTORY.host).toEqual({
      species: "Escherichia coli",
      background: "K-12 MG1655",
      collectionId: "DSM 18039",
    });

    expect(
      T4_MG1655_LIFE_HISTORY.rows.map((row) => [
        row.growthRatePerHour,
        row.adsorptionConstantMlPerMin,
        row.adsorptionConstantSdMlPerMin,
        row.latentPeriodMinutes,
        row.latentPeriodSdMinutes,
        row.burstSizePfuPerCell,
        row.burstSizeSdPfuPerCell,
      ]),
    ).toEqual([
      [0.06, 2.6e-9, 0.24e-9, 80, 4, 8, 2],
      [0.13, 2.0e-9, 0.12e-9, 60, 4, 13, 3],
      [0.26, 1.1e-9, 0.19e-9, 41, 1, 20, 5],
      [0.5, 0.81e-9, 0.04e-9, 36, 4, 33, 6],
      [0.6, 0.53e-9, 0.04e-9, 31, 3, 59, 3],
      [0.73, 0.42e-9, 0.07e-9, 29, 3, 66, 7],
      [0.82, 0.5e-9, 0.05e-9, 27, 1, 75, 4],
      [0.98, 0.52e-9, 0.04e-9, 27, 1, 89, 4],
    ]);

    for (const row of T4_MG1655_LIFE_HISTORY.rows) {
      const resolved = resolvePhageLifeHistory(
        T4_MG1655_LIFE_HISTORY,
        row.growthRatePerHour,
      );

      expect(resolved.status).toBe("exact");
      if (resolved.status !== "exact") throw new Error("expected exact row");

      expect(resolved.evidenceClass).toBe("measured");
      expect(resolved.sourceRows).toEqual([row]);
      expect(resolved.values).toEqual({
        adsorptionConstantMlPerMin: row.adsorptionConstantMlPerMin,
        latentPeriodMinutes: row.latentPeriodMinutes,
        burstSizePfuPerCell: row.burstSizePfuPerCell,
      });
      expect(resolved.uncertainty).toEqual({
        adsorptionConstantSdMlPerMin: row.adsorptionConstantSdMlPerMin,
        latentPeriodSdMinutes: row.latentPeriodSdMinutes,
        burstSizeSdPfuPerCell: row.burstSizeSdPfuPerCell,
      });
    }
  });

  it("labels in-domain interpolation derived and retains measured brackets", () => {
    const resolved = resolvePhageLifeHistory(T4_MG1655_LIFE_HISTORY, 0.38);

    expect(resolved.status).toBe("interpolated");
    if (resolved.status !== "interpolated") {
      throw new Error("expected interpolated row");
    }

    expect(resolved.evidenceClass).toBe("derived");
    expect(resolved.transformation).toBe("linear-interpolation");
    expect(resolved.uncertainty).toBeNull();
    expect(resolved.sourceRows.map((row) => row.growthRatePerHour)).toEqual([
      0.26,
      0.5,
    ]);
    expect(resolved.values.adsorptionConstantMlPerMin).toBeCloseTo(0.955e-9, 15);
    expect(resolved.values.latentPeriodMinutes).toBeCloseTo(38.5, 12);
    expect(resolved.values.burstSizePfuPerCell).toBeCloseTo(26.5, 12);
  });

  it("refuses to extrapolate outside the measured growth-rate domain", () => {
    for (const growthRate of [0, 0.05, 0.981, 1.5]) {
      const resolved = resolvePhageLifeHistory(
        T4_MG1655_LIFE_HISTORY,
        growthRate,
      );

      expect(resolved).toMatchObject({
        status: "out-of-domain",
        evidenceClass: null,
        requestedGrowthRatePerHour: growthRate,
        measuredDomain: {
          growthRatePerHourMin: 0.06,
          growthRatePerHourMax: 0.98,
        },
        sourceRows: [],
      });
    }
  });

  it("rejects non-finite or negative query rates", () => {
    for (const growthRate of [Number.NaN, Number.POSITIVE_INFINITY, -0.01]) {
      expect(() =>
        resolvePhageLifeHistory(T4_MG1655_LIFE_HISTORY, growthRate),
      ).toThrow(RangeError);
    }
  });

  it("carries the exact source units and calibration context", () => {
    expect(T4_MG1655_LIFE_HISTORY.units).toEqual({
      growthRate: "h^-1",
      adsorptionConstant: "mL min^-1",
      latentPeriod: "min",
      burstSize: "PFU cell^-1",
    });
    expect(T4_MG1655_LIFE_HISTORY.context).toMatchObject({
      culture: "aerobic continuous culture (chemostat)",
      medium: "low-salt LB",
      pH: 7,
      temperatureC: 37,
    });
    expect(T4_MG1655_LIFE_HISTORY.provenance.classification).toBe("measured");
    expect(T4_MG1655_LIFE_HISTORY.provenance.limitation).toContain(
      "transferred mechanistic approximation",
    );
  });
});
