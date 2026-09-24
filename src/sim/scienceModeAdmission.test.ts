import { describe, expect, it } from "vitest";

import flagshipScenario from "../../data/presets/ecoli_ciprofloxacin_v1.json";
import { evaluateScienceModeAdmission } from "./scienceModeAdmission";

function referenceScenario(): Record<string, unknown> {
  const source = "source_1";
  return {
    id: "reference-scenario",
    version: "1.0.0",
    title: "Reference scenario",
    warning: "Educational reference scenario with explicit scope and limitations.",
    citations: {
      [source]: {
        title: "Primary experimental source",
        doi: "10.0000/example",
      },
    },
    transferAssumptions: [],
    validationTargets: {
      quantitative: [{ metric: "growth-rate", citation: source }],
    },
    environment: {
      resourceContext: {
        bindingStatus: "measured_or_transferred",
        provenance: {
          classification: "measured",
          citation: source,
        },
      },
    },
    drug: {
      referencePharmacodynamics: { citation: source },
      resourceDrugCompositionPolicy: {
        provenance: {
          classification: "derived",
          citation: source,
        },
      },
    },
    genotypes: [
      {
        id: "WT",
        provenance: {
          classification: "measured",
          citation: source,
        },
      },
    ],
    mutationTransitions: [
      {
        from: "WT",
        to: "A",
        provenance: {
          classification: "derived",
          citation: source,
        },
      },
    ],
    executionProfile: {
      classification: "calibrated",
      provenance: {
        classification: "calibrated",
        citation: source,
        limitation: "Calibration is valid only for the declared reference setup.",
      },
    },
    composedParameterSet: {
      provenance: {
        classification: "derived",
        citation: source,
      },
    },
  };
}

describe("Science Mode scenario admission", () => {
  it("keeps the current flagship experimental while physical resource/growth authority is unbound", () => {
    const result = evaluateScienceModeAdmission(flagshipScenario);
    const codes = result.reasons.map((reason) => reason.code);

    expect(result.scenarioId).toBe("ecoli-ciprofloxacin-spatial");
    expect(result.scenarioVersion).toBe("1.4.0-research");
    expect(result.maturity).toBe("experimental");
    expect(result.admitted).toBe(false);
    expect(result.referenceEligible).toBe(false);
    expect(codes).toContain("unbound-required-value");
    expect(codes).toContain("engineering-execution-profile");
    expect(result.evidence.primarySourceCount).toBeGreaterThan(0);
    expect(result.evidence.validationTargetCount).toBeGreaterThan(0);
    expect(result.evidence.transferAssumptionCount).toBeGreaterThan(0);
  });

  it("admits a fully sourced measured/derived/calibrated scenario as reference", () => {
    const result = evaluateScienceModeAdmission(referenceScenario());

    expect(result.reasons).toEqual([]);
    expect(result.maturity).toBe("reference");
    expect(result.admitted).toBe(true);
    expect(result.referenceEligible).toBe(true);
  });

  it("downgrades an otherwise admissible transferred scenario to validated educational", () => {
    const scenario = referenceScenario();
    scenario.transferAssumptions = [
      "Reference pharmacodynamics are transferred across explicitly declared systems.",
    ];
    const drug = scenario.drug as Record<string, unknown>;
    drug.resourceDrugCompositionPolicy = {
      provenance: {
        classification: "transferred",
        citation: "source_1",
        transferNote: "Transferred from the declared reference system.",
        limitation: "Transfer is educational and not a source-matched calibration.",
      },
    };

    const result = evaluateScienceModeAdmission(scenario);

    expect(result.reasons).toEqual([]);
    expect(result.maturity).toBe("validated-educational");
    expect(result.admitted).toBe(true);
    expect(result.referenceEligible).toBe(false);
  });

  it("fails closed on unresolved citations and missing validation targets", () => {
    const scenario = referenceScenario();
    scenario.validationTargets = {};
    const genotypes = scenario.genotypes as Array<Record<string, unknown>>;
    genotypes[0] = {
      provenance: {
        classification: "measured",
        citation: "missing-source",
      },
    };

    const result = evaluateScienceModeAdmission(scenario);
    const codes = result.reasons.map((reason) => reason.code);

    expect(result.maturity).toBe("experimental");
    expect(result.admitted).toBe(false);
    expect(codes).toContain("missing-validation-target");
    expect(codes).toContain("unresolved-citation");
  });

  it("does not let an engineering execution profile satisfy grounded Science Mode", () => {
    const scenario = referenceScenario();
    scenario.executionProfile = {
      classification: "engineering",
      provenance: {
        classification: "engineering",
        context: "Numerically stable model-unit execution only.",
        limitation: "Not a physical calibration.",
      },
    };

    const result = evaluateScienceModeAdmission(scenario);

    expect(result.maturity).toBe("experimental");
    expect(result.reasons).toContainEqual(
      expect.objectContaining({ code: "engineering-execution-profile" }),
    );
  });
});
