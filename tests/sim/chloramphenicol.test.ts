/**
 * Scientific fixture provenance:
 * - Greulich et al. 2015, DOI 10.15252/MSB.20145949: E. coli K-12
 *   MG1655 chloramphenicol growth-inhibition equation, MOPS context, fitted
 *   glycerol/glucose parameter pairs, and drug-free growth-rate strata.
 *
 * The tests exercise the source equation and its explicit applicability gates.
 * They do not authorize chloramphenicol killing, CAT resistance response curves,
 * physical drug transport, or Petra model-resource -> MOPS relabeling.
 */
import { describe, expect, it } from "vitest";
import chloramphenicolRecord from "../../data/antimicrobials/chloramphenicol_mg1655_greulich_v1.json";
import {
  greulichChloramphenicolCubicResidual,
  greulichChloramphenicolResponse,
  type GreulichChloramphenicolFit,
} from "../../src/sim/pharmacodynamics/chloramphenicol";
import {
  parseChloramphenicolAuthority,
  resolveGreulichChloramphenicolFit,
} from "../../src/sim/pharmacodynamics/chloramphenicolAuthority";
import {
  validateAntimicrobialEffect,
  type AntimicrobialEffect,
} from "../../src/sim/pharmacodynamics/effect";

const authority = parseChloramphenicolAuthority(chloramphenicolRecord);
const glycerol = resolveGreulichChloramphenicolFit(
  authority,
  "mops-glycerol",
);
const glucose = resolveGreulichChloramphenicolFit(
  authority,
  "mops-glucose",
);

describe("chloramphenicol authority record", () => {
  it("keeps source contexts, units, and fitted parameter records distinct", () => {
    expect(authority.version).toBe("1.0.1");
    expect(authority.drug.concentrationUnit).toBe("uM");
    expect(authority.model.effectKind).toBe("growth-inhibition");
    expect(authority.model.fitErrorMethod).toMatch(/1000 randomized data sets/);
    expect(glycerol).toMatchObject({
      id: "mops-glycerol",
      lambda0StarPerHour: 1.83,
      lambda0StarReportedFitErrorPerHour: 0.06,
      ic50StarMicromolar: 2.49,
      ic50StarReportedFitErrorMicromolar: 0.05,
      validatedDrugFreeGrowthRateRangePerHour: {
        minimum: 0.4,
        maximum: 1.35,
      },
    });
    expect(glucose).toMatchObject({
      id: "mops-glucose",
      lambda0StarPerHour: 1.28,
      lambda0StarReportedFitErrorPerHour: 0.02,
      ic50StarMicromolar: 4.5,
      ic50StarReportedFitErrorMicromolar: 0.05,
      validatedDrugFreeGrowthRateRangePerHour: {
        minimum: 0.64,
        maximum: 1.68,
      },
    });
  });

  it("rejects the superseded standard-deviation alias for fitted-parameter error bars", () => {
    const legacy = structuredClone(chloramphenicolRecord) as unknown as Record<string, unknown>;
    const model = legacy.model as Record<string, unknown>;
    const fits = model.fits as Array<Record<string, unknown>>;
    const first = fits[0]!;
    first.lambda0StarStandardDeviationPerHour =
      first.lambda0StarReportedFitErrorPerHour;
    delete first.lambda0StarReportedFitErrorPerHour;

    expect(() => parseChloramphenicolAuthority(legacy)).toThrow(
      /unsupported field|missing required field/,
    );
  });

  it("fails closed on unit aliases and unknown fit selection", () => {
    const invalidUnit = structuredClone(chloramphenicolRecord);
    invalidUnit.drug.concentrationUnit = "mg/L";
    expect(() => parseChloramphenicolAuthority(invalidUnit)).toThrow(
      /concentrationUnit must be uM/,
    );
    expect(() =>
      resolveGreulichChloramphenicolFit(authority, "generic-medium"),
    ).toThrow(/does not contain fit/);
  });
});

describe("Greulich chloramphenicol growth inhibition", () => {
  it("is an exact no-op at zero drug and adds no killing hazard", () => {
    const response = greulichChloramphenicolResponse(0, 0.85, glycerol);
    expect(response.growthRatio).toBe(1);
    expect(response.effect).toEqual({
      divisionMultiplier: 1,
      incrementalLossHazardPerHour: 0,
    });
  });

  it("matches an independently evaluated equation-7 reference point", () => {
    const response = greulichChloramphenicolResponse(1, 0.85, glycerol);
    expect(response.growthRatio).toBeCloseTo(0.8072366899309096, 12);
    expect(
      greulichChloramphenicolCubicResidual(
        response.growthRatio,
        1,
        0.85,
        glycerol,
      ),
    ).toBeCloseTo(0, 12);
  });

  it("stays physical, satisfies the cubic, and decreases with concentration for every measured growth stratum", () => {
    const concentrationsMicromolar = [0, 0.5, 1, 2, 5, 10, 20];

    for (const record of authority.model.fits) {
      const fit = resolveGreulichChloramphenicolFit(authority, record.id);
      for (const lambda0 of record.measuredDrugFreeGrowthRatesPerHour) {
        let previous = 1;
        for (const concentration of concentrationsMicromolar) {
          const response = greulichChloramphenicolResponse(
            concentration,
            lambda0,
            fit,
          );
          expect(Number.isFinite(response.growthRatio)).toBe(true);
          expect(response.growthRatio).toBeGreaterThanOrEqual(0);
          expect(response.growthRatio).toBeLessThanOrEqual(1);
          expect(response.growthRatio).toBeLessThanOrEqual(previous + 1e-12);
          expect(response.effect.incrementalLossHazardPerHour).toBe(0);
          expect(
            greulichChloramphenicolCubicResidual(
              response.growthRatio,
              concentration,
              lambda0,
              fit,
            ),
          ).toBeCloseTo(0, 11);
          previous = response.growthRatio;
        }
      }
    }
  });

  it("rejects growth contexts outside each source-backed carbon-family envelope", () => {
    expect(() =>
      greulichChloramphenicolResponse(1, 1.5, glycerol),
    ).toThrow(/source-backed range/);
    expect(() =>
      greulichChloramphenicolResponse(1, 0.5, glucose),
    ).toThrow(/source-backed range/);
  });

  it("rejects invalid concentration and non-finite growth input", () => {
    expect(() =>
      greulichChloramphenicolResponse(-0.1, 0.85, glycerol),
    ).toThrow(RangeError);
    expect(() =>
      greulichChloramphenicolResponse(1, Number.NaN, glycerol),
    ).toThrow(RangeError);
  });

  it("fails closed instead of selecting among multiple real response branches", () => {
    const ambiguous: GreulichChloramphenicolFit = {
      id: "synthetic-ambiguous-regime",
      lambda0StarPerHour: 1.28,
      ic50StarMicromolar: 4.5,
      validatedDrugFreeGrowthRateRangePerHour: {
        minimum: 8,
        maximum: 10,
      },
    };
    expect(() =>
      greulichChloramphenicolResponse(9, 8.8, ambiguous),
    ).toThrow(/single physical-root regime/);
  });
});

describe("generic antimicrobial effect contract", () => {
  it("keeps growth suppression and population loss as independent validated axes", () => {
    const bacteriostatic: AntimicrobialEffect = {
      divisionMultiplier: 0.4,
      incrementalLossHazardPerHour: 0,
    };
    const bactericidal: AntimicrobialEffect = {
      divisionMultiplier: 1,
      incrementalLossHazardPerHour: 2,
    };
    expect(() => validateAntimicrobialEffect(bacteriostatic)).not.toThrow();
    expect(() => validateAntimicrobialEffect(bactericidal)).not.toThrow();
    expect(() =>
      validateAntimicrobialEffect({
        divisionMultiplier: 1.01,
        incrementalLossHazardPerHour: 0,
      }),
    ).toThrow(RangeError);
    expect(() =>
      validateAntimicrobialEffect({
        divisionMultiplier: 1,
        incrementalLossHazardPerHour: -1,
      }),
    ).toThrow(RangeError);
  });
});
