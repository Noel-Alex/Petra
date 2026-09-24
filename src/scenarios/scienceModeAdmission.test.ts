import { describe, expect, it } from "vitest";

import flagshipScenario from "../../data/presets/ecoli_ciprofloxacin_v1.json";
import {
  evaluateScenarioScienceAdmission,
  type ScenarioAdmissionReasonCode,
} from "./scienceModeAdmission";

function reasonCodes(result: ReturnType<typeof evaluateScenarioScienceAdmission>) {
  return result.reasons.map((reason) => reason.code);
}

function referenceFixture(): Record<string, unknown> {
  return {
    id: "reference-fixture",
    version: "1.0.0",
    title: "Reference fixture",
    warning: "Reference fixture limitations remain visible to the user.",
    citations: {
      primary_1: {
        title: "Primary experiment",
        doi: "10.1000/reference-fixture",
      },
    },
    transferAssumptions: [
      "No cross-study transfer is used beyond the declared reference fixture.",
    ],
    validationTargets: {
      qualitative: ["reproduces the declared reference trend"],
    },
    mechanism: {
      provenance: {
        classification: "measured",
        citation: "primary_1",
        context: "Source-matched fixture context.",
      },
    },
    units: {
      time: "hour",
    },
    limitations: {
      main: "Reference fixture remains bounded to its declared source context.",
    },
    resource: {
      bindingStatus: "bound",
    },
    scienceModeAdmission: {
      schemaVersion: 1,
      scenarioId: "reference-fixture",
      scenarioVersion: "1.0.0",
      requestedMaturity: "reference",
      primaryEvidenceCitationKeys: ["primary_1"],
      decisiveParameterPaths: ["mechanism"],
      requiredNonEmptyPaths: ["warning", "units.time"],
      limitationPaths: ["warning", "limitations.main"],
      referenceBindings: [
        {
          path: "resource.bindingStatus",
          expected: "bound",
          label: "source-matched resource context",
        },
      ],
      engineeringExecutionProfilePath: null,
    },
  };
}

describe("Science Mode scenario admission", () => {
  it("admits the current flagship only as validated educational science", () => {
    const result = evaluateScenarioScienceAdmission(flagshipScenario);

    expect(result).toMatchObject({
      scenarioId: "ecoli-ciprofloxacin-spatial",
      scenarioVersion: "1.4.0-research",
      maturity: "validated-educational",
      availability: "educational-only",
      referenceEligible: false,
    });
    expect(reasonCodes(result)).toContain("reference-binding-unmet");
    expect(reasonCodes(result)).toContain("engineering-execution-profile");
    expect(result.reasons.some((reason) => reason.severity === "blocker")).toBe(
      false,
    );
  });

  it("does not treat a parseable scenario without an admission manifest as science", () => {
    const result = evaluateScenarioScienceAdmission({
      id: "parseable",
      version: "1",
      title: "Parseable JSON",
      citations: {},
    });

    expect(result).toMatchObject({
      maturity: "experimental",
      availability: "refused",
      referenceEligible: false,
    });
    expect(reasonCodes(result)).toContain("missing-admission-manifest");
  });

  it("admits a fully bound explicitly evidenced scenario as reference", () => {
    const result = evaluateScenarioScienceAdmission(referenceFixture());

    expect(result).toMatchObject({
      maturity: "reference",
      availability: "reference",
      referenceEligible: true,
      reasons: [],
    });
  });

  it("downgrades a reference request when a required scientific binding is unbound", () => {
    const scenario = referenceFixture();
    (scenario.resource as { bindingStatus: string }).bindingStatus = "unbound";

    const result = evaluateScenarioScienceAdmission(scenario);

    expect(result).toMatchObject({
      maturity: "validated-educational",
      availability: "educational-only",
      referenceEligible: false,
    });
    expect(reasonCodes(result)).toContain("reference-binding-unmet");
  });

  it.each([
    [
      "missing primary citation",
      (scenario: Record<string, any>) => {
        delete scenario.citations.primary_1;
      },
      "missing-primary-literature",
    ],
    [
      "missing decisive provenance",
      (scenario: Record<string, any>) => {
        delete scenario.mechanism.provenance;
      },
      "missing-decisive-parameter-evidence",
    ],
    [
      "missing transfer disclosure",
      (scenario: Record<string, any>) => {
        scenario.transferAssumptions = [];
      },
      "missing-transfer-assumptions",
    ],
    [
      "missing validation target",
      (scenario: Record<string, any>) => {
        scenario.validationTargets = {};
      },
      "missing-validation-target",
    ],
    [
      "missing required unit",
      (scenario: Record<string, any>) => {
        scenario.units.time = "";
      },
      "missing-required-field",
    ],
    [
      "missing visible limitation",
      (scenario: Record<string, any>) => {
        scenario.limitations.main = "";
      },
      "missing-limitation",
    ],
  ] as const)(
    "fails closed for %s",
    (_label, mutate, expectedCode) => {
      const scenario = referenceFixture() as Record<string, any>;
      mutate(scenario);
      const result = evaluateScenarioScienceAdmission(scenario);

      expect(result.availability).toBe("refused");
      expect(result.maturity).toBe("experimental");
      expect(reasonCodes(result)).toContain(
        expectedCode as ScenarioAdmissionReasonCode,
      );
    },
  );

  it("invalidates admission evidence when scenario version changes without the manifest", () => {
    const scenario = referenceFixture();
    scenario.version = "2.0.0";

    const result = evaluateScenarioScienceAdmission(scenario);

    expect(result.availability).toBe("refused");
    expect(reasonCodes(result)).toContain("scenario-identity-drift");
  });
});
