/**
 * Scientific fixture provenance:
 * - Greulich et al. 2015, DOI 10.15252/MSB.20145949: E. coli K-12 MG1655,
 *   modified Neidhardt potassium-MOPS media, 37 C, chloramphenicol equation-7
 *   growth-inhibition response and the separate glucose/glycerol fit families.
 *
 * These tests validate the numerical/source contract only. They do not make the
 * current model-resource flagship a source-compatible MOPS environment.
 */
import { describe, expect, it } from "vitest";

import rawAuthority from "../../data/pharmacodynamics/chloramphenicol_mg1655_greulich_v1.json";
import { validateAntimicrobialEffect } from "../../src/sim/pharmacodynamics/antimicrobial";
import {
  CHLORAMPHENICOL_CONCENTRATION_UNIT,
  CHLORAMPHENICOL_ENVIRONMENT_FAMILY_IDS,
  CHLORAMPHENICOL_MG1655_RESPONSE_AUTHORITY,
  CHLORAMPHENICOL_RESPONSE_MODEL_ID,
  chloramphenicolGrowthInhibitionEffect,
  greulichChloramphenicolDivisionMultiplier,
  greulichEquation7Residual,
  parseChloramphenicolResponseAuthority,
  resolveChloramphenicolEnvironmentFamily,
} from "../../src/sim/pharmacodynamics/chloramphenicol";
import { CIPROFLOXACIN_RESOURCE_COMPOSITION_POLICY } from "../../src/sim/pharmacodynamics/composition";

function cloneRawAuthority(): Record<string, unknown> {
  return structuredClone(rawAuthority) as Record<string, unknown>;
}

describe("generic antimicrobial effect contract", () => {
  it("keeps division suppression independent from incremental loss", () => {
    expect(
      validateAntimicrobialEffect({
        divisionMultiplier: 0.4,
        incrementalLossHazardPerHour: 0,
      }),
    ).toEqual({
      divisionMultiplier: 0.4,
      incrementalLossHazardPerHour: 0,
    });
    expect(() =>
      validateAntimicrobialEffect({
        divisionMultiplier: 1.01,
        incrementalLossHazardPerHour: 0,
      }),
    ).toThrow(/divisionMultiplier/);
    expect(() =>
      validateAntimicrobialEffect({
        divisionMultiplier: 1,
        incrementalLossHazardPerHour: -0.01,
      }),
    ).toThrow(/incrementalLossHazardPerHour/);
  });
});

describe("chloramphenicol MG1655 authority parsing", () => {
  it("loads only the reviewed Greulich wild-type MOPS authority", () => {
    const authority = CHLORAMPHENICOL_MG1655_RESPONSE_AUTHORITY;
    expect(authority.drug).toEqual({
      id: "chloramphenicol",
      concentrationUnit: CHLORAMPHENICOL_CONCENTRATION_UNIT,
    });
    expect(authority.organism).toEqual({
      scientificName: "Escherichia coli",
      background: "K-12 MG1655",
    });
    expect(authority.responseModel.id).toBe(CHLORAMPHENICOL_RESPONSE_MODEL_ID);
    expect(authority.responseModel.sourceKey).toBe("greulich_2015");
    expect(authority.productGate.status).toBe("context-gated");
    expect(authority.environmentFamilies.map((family) => family.id)).toEqual(
      CHLORAMPHENICOL_ENVIRONMENT_FAMILY_IDS,
    );

    const glycerol = resolveChloramphenicolEnvironmentFamily(
      authority,
      "mops-glycerol",
    );
    const glucose = resolveChloramphenicolEnvironmentFamily(
      authority,
      "mops-glucose",
    );
    expect(glycerol.lambda0StarPerHour).toBe(1.83);
    expect(glycerol.ic50StarMicromolar).toBe(2.49);
    expect(glucose.lambda0StarPerHour).toBe(1.28);
    expect(glucose.ic50StarMicromolar).toBe(4.5);
  });

  it("fails closed on relabelled resistant backgrounds and invented environment families", () => {
    const resistant = cloneRawAuthority();
    const resistantOrganism = resistant.organism as Record<string, unknown>;
    resistantOrganism.background = "K-12 MG1655 catA1";
    expect(() =>
      parseChloramphenicolResponseAuthority(resistant),
    ).toThrow(/organism.background/);

    const invented = cloneRawAuthority();
    const families = invented.environmentFamilies as Array<
      Record<string, unknown>
    >;
    families.push({
      ...families[0]!,
      id: "model-resource",
      carbonSource: "unbound",
    });
    expect(() =>
      parseChloramphenicolResponseAuthority(invented),
    ).toThrow(/exactly the reviewed MOPS/);
  });

  it("fails closed on unit/model identity drift", () => {
    const wrongUnit = cloneRawAuthority();
    const drug = wrongUnit.drug as Record<string, unknown>;
    drug.concentrationUnit = "mg/L";
    expect(() =>
      parseChloramphenicolResponseAuthority(wrongUnit),
    ).toThrow(/concentrationUnit/);

    const wrongModel = cloneRawAuthority();
    const model = wrongModel.responseModel as Record<string, unknown>;
    model.id = CIPROFLOXACIN_RESOURCE_COMPOSITION_POLICY.id;
    expect(() =>
      parseChloramphenicolResponseAuthority(wrongModel),
    ).toThrow(/responseModel.id/);
  });
});

describe("Greulich chloramphenicol equation-7 evaluator", () => {
  const authority = CHLORAMPHENICOL_MG1655_RESPONSE_AUTHORITY;

  it("returns exact drug-free neutrality and no authorized killing hazard", () => {
    for (const environmentFamilyId of CHLORAMPHENICOL_ENVIRONMENT_FAMILY_IDS) {
      const effect = chloramphenicolGrowthInhibitionEffect({
        authority,
        environmentFamilyId,
        concentration: { value: 0, unit: "uM" },
        drugFreeGrowthRatePerHour: 1,
      });
      expect(effect.divisionMultiplier).toBe(1);
      expect(effect.incrementalLossHazardPerHour).toBe(0);
    }
  });

  it("selects a finite physical root satisfying the source cubic", () => {
    for (const environmentFamilyId of CHLORAMPHENICOL_ENVIRONMENT_FAMILY_IDS) {
      const family = resolveChloramphenicolEnvironmentFamily(
        authority,
        environmentFamilyId,
      );
      for (const drugFreeGrowthRatePerHour of [0.5, 1, 1.5, 2]) {
        for (const concentrationMicromolar of [0, 0.1, 0.5, 1, 2.5, 5, 10, 50]) {
          const multiplier = greulichChloramphenicolDivisionMultiplier(
            concentrationMicromolar,
            drugFreeGrowthRatePerHour,
            family,
          );
          expect(Number.isFinite(multiplier)).toBe(true);
          expect(multiplier).toBeGreaterThanOrEqual(0);
          expect(multiplier).toBeLessThanOrEqual(1);
          expect(
            greulichEquation7Residual(
              multiplier,
              concentrationMicromolar,
              drugFreeGrowthRatePerHour,
              family,
            ),
          ).toBeCloseTo(0, 10);
        }
      }
    }
  });

  it("does not increase growth as chloramphenicol rises at fixed source-compatible context", () => {
    const concentrations = [0, 0.1, 0.5, 1, 2.5, 5, 10, 25, 50];
    for (const environmentFamilyId of CHLORAMPHENICOL_ENVIRONMENT_FAMILY_IDS) {
      const family = resolveChloramphenicolEnvironmentFamily(
        authority,
        environmentFamilyId,
      );
      const responses = concentrations.map((concentration) =>
        greulichChloramphenicolDivisionMultiplier(
          concentration,
          1,
          family,
        ),
      );
      for (let index = 1; index < responses.length; index += 1) {
        expect(responses[index]!).toBeLessThanOrEqual(
          responses[index - 1]! + 1e-12,
        );
      }
    }
  });

  it("keeps the glucose and glycerol fit families distinct", () => {
    const glycerol = chloramphenicolGrowthInhibitionEffect({
      authority,
      environmentFamilyId: "mops-glycerol",
      concentration: { value: 5, unit: "uM" },
      drugFreeGrowthRatePerHour: 1,
    });
    const glucose = chloramphenicolGrowthInhibitionEffect({
      authority,
      environmentFamilyId: "mops-glucose",
      concentration: { value: 5, unit: "uM" },
      drugFreeGrowthRatePerHour: 1,
    });
    expect(glycerol.divisionMultiplier).not.toBeCloseTo(
      glucose.divisionMultiplier,
      8,
    );
  });

  it("fails closed rather than choosing among multiple physical roots", () => {
    const syntheticAmbiguousFamily = {
      id: "synthetic-ambiguous",
      medium: "synthetic numerical fixture",
      carbonSource: "synthetic",
      carbonSourceConcentration: "synthetic",
      temperatureC: 37,
      lambda0StarPerHour: 0.001,
      lambda0StarReportedPlusMinusPerHour: 0,
      ic50StarMicromolar: 1,
      ic50StarReportedPlusMinusMicromolar: 0,
    };

    expect(() =>
      greulichChloramphenicolDivisionMultiplier(
        2,
        1,
        syntheticAmbiguousFamily,
      ),
    ).toThrow(/ambiguous/);
  });

  it("rejects unit, environment, concentration, and growth-context mismatches", () => {
    expect(() =>
      chloramphenicolGrowthInhibitionEffect({
        authority,
        environmentFamilyId: "mops-glycerol",
        concentration: { value: 1, unit: "mg/L" },
        drugFreeGrowthRatePerHour: 1,
      }),
    ).toThrow(/unit/);

    expect(() =>
      chloramphenicolGrowthInhibitionEffect({
        authority,
        environmentFamilyId: "model-resource",
        concentration: { value: 1, unit: "uM" },
        drugFreeGrowthRatePerHour: 1,
      }),
    ).toThrow(/unsupported chloramphenicol environment family/);

    expect(() =>
      chloramphenicolGrowthInhibitionEffect({
        authority,
        environmentFamilyId: "mops-glycerol",
        concentration: { value: -1, unit: "uM" },
        drugFreeGrowthRatePerHour: 1,
      }),
    ).toThrow(/concentration/);

    expect(() =>
      chloramphenicolGrowthInhibitionEffect({
        authority,
        environmentFamilyId: "mops-glycerol",
        concentration: { value: 1, unit: "uM" },
        drugFreeGrowthRatePerHour: 0,
      }),
    ).toThrow(/drugFreeGrowthRatePerHour/);
  });

  it("cannot alias the ciprofloxacin incremental-loss policy", () => {
    expect(CHLORAMPHENICOL_RESPONSE_MODEL_ID).not.toBe(
      CIPROFLOXACIN_RESOURCE_COMPOSITION_POLICY.id,
    );
    const effect = chloramphenicolGrowthInhibitionEffect({
      authority,
      environmentFamilyId: "mops-glycerol",
      concentration: { value: 10, unit: "uM" },
      drugFreeGrowthRatePerHour: 1,
    });
    expect(effect.divisionMultiplier).toBeLessThan(1);
    expect(effect.incrementalLossHazardPerHour).toBe(0);
  });
});
