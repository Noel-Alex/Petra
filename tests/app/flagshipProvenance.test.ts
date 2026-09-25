import { describe, expect, it } from "vitest";

import { buildFlagshipProvenanceView } from "../../src/app/flagshipProvenance";

describe("flagship provenance presentation projection", () => {
  it("carries the authoritative flagship identity into presentation", () => {
    const view = buildFlagshipProvenanceView();

    expect(view.scenario).toEqual({
      id: "ecoli-ciprofloxacin-spatial",
      version: "1.5.0-research",
      title: "E. coli / ciprofloxacin spatial evolution",
    });
  });

  it("resolves every flagship provenance record from an explicit science/data classification", () => {
    const view = buildFlagshipProvenanceView();
    const incomplete = view.records.filter(
      (record) => record.status === "needs-provenance",
    );

    expect(view.records.length).toBeGreaterThan(1);
    expect(incomplete).toEqual([]);
  });

  it("exposes the baseline composed parameter set as engineering authority", () => {
    const view = buildFlagshipProvenanceView();
    const parameterSet = view.records.find((record) =>
      record.id.startsWith("composed-parameter-set:"),
    );

    expect(parameterSet?.status).toBe("complete");
    expect(parameterSet?.rawClassification).toBe("engineering");
    expect(parameterSet?.sourceKeys).toEqual([]);
    expect(
      parameterSet?.presentation?.disclosures.some((text) =>
        text.includes("not a physical culture calibration"),
      ),
    ).toBe(true);
  });

  it("exposes the unbound limiting-resource context as engineering model units", () => {
    const view = buildFlagshipProvenanceView();
    const resourceContext = view.records.find((record) =>
      record.id.startsWith("resource-context:"),
    );

    expect(resourceContext?.status).toBe("complete");
    expect(resourceContext?.rawClassification).toBe("engineering");
    expect(resourceContext?.sourceKeys).toEqual([]);
    expect(resourceContext?.presentation?.details).toContainEqual({
      label: "Value",
      value:
        "unbound-model-resource-v1 · dimensionless_model_resource",
    });
    expect(resourceContext?.presentation?.details).toContainEqual({
      label: "Units",
      value: "model-resource",
    });
    expect(
      resourceContext?.presentation?.disclosures.some((text) =>
        text.includes("must not be labelled glucose"),
      ),
    ).toBe(true);
  });

  it("shows the Regoes reference-PD fit as explicitly derived source-context evidence", () => {
    const view = buildFlagshipProvenanceView();
    const referencePd = view.records.find(
      (record) => record.id === "drug-reference-pd:regoes-cab1-ciprofloxacin",
    );

    expect(referencePd?.status).toBe("complete");
    expect(referencePd?.rawClassification).toBe("derived");
    expect(referencePd?.sourceKeys).toEqual(["regoes_2004"]);
    expect(referencePd?.sources[0]).toMatchObject({
      id: "regoes_2004",
      href: "https://doi.org/10.1128/AAC.48.10.3670-3676.2004",
    });
    expect(referencePd?.presentation?.disclosures).toContain(
      "These are fitted source-context parameter estimates, not direct raw measurements and not an MG1655 or Petra resource-ecology calibration.",
    );
  });

  it("surfaces the source-domain ciprofloxacin control as transferred guardrail evidence", () => {
    const view = buildFlagshipProvenanceView();
    const control = view.records.find(
      (record) => record.id === "drug-control:ciprofloxacin-source-domain",
    );

    expect(control?.status).toBe("complete");
    expect(control?.rawClassification).toBe("transferred");
    expect(control?.sourceKeys).toEqual(["regoes_2004"]);
    expect(control?.presentation?.details).toContainEqual({
      label: "Value",
      value: "0–2 mg/L · default 0 mg/L · set field edit",
    });
    expect(control?.presentation?.disclosures).toContain(
      "0 mg/L is the exact neutral initial flagship state and an interaction default, not a measured effective or optimal dose.",
    );
    expect(
      control?.presentation?.disclosures.some((text) =>
        text.includes("genotype MIC values do not widen the 0-2 mg/L source-domain guardrail"),
      ),
    ).toBe(true);
  });

  it("exposes the runnable ecology profile as engineering rather than measured science", () => {
    const view = buildFlagshipProvenanceView();
    const profile = view.records.find((record) =>
      record.id.startsWith("execution-profile:"),
    );

    expect(profile?.status).toBe("complete");
    expect(profile?.rawClassification).toBe("engineering");
    expect(profile?.sourceKeys).toEqual([]);
    expect(
      profile?.presentation?.disclosures.some((text) =>
        text.includes("Science-Mode physical growth parameters remain UNBOUND"),
      ),
    ).toBe(true);
  });

  it("surfaces source-supported Marcusson MIC and fitness uncertainty without a composite score", () => {
    const view = buildFlagshipProvenanceView();
    const s83l = view.records.find((record) => record.id === "genotype:A");

    expect(s83l?.status).toBe("complete");
    expect(s83l?.rawClassification).toBe("measured");
    expect(s83l?.presentation?.details).toContainEqual({
      label: "Measurement uncertainty · Ciprofloxacin MIC",
      value: "Reported margin ±1 half-doubling step",
    });
    expect(s83l?.presentation?.details).toContainEqual({
      label: "Measurement uncertainty · Relative fitness",
      value:
        "SD 0.03 dimensionless · 6 independent competition experiments",
    });
    expect(s83l?.presentation?.ariaLabel).toContain(
      "Reported margin ±1 half-doubling step",
    );
    expect(s83l?.presentation?.ariaLabel).not.toMatch(/confidence score/i);
  });

  it("keeps the cross-study drug composition explicitly transferred and mechanistic", () => {
    const view = buildFlagshipProvenanceView();
    const composition = view.records.find((record) =>
      record.id.startsWith("drug-policy:"),
    );

    expect(composition?.rawClassification).toBe(
      "transferred_mechanistic_approximation",
    );
    expect(composition?.sourceKeys).toEqual([
      "regoes_2004",
      "marcusson_2009",
    ]);
  });

  it("preserves scenario-wide assumptions as separate disclosures", () => {
    const view = buildFlagshipProvenanceView();

    expect(view.assumptions.problems).toEqual([]);
    expect(view.assumptions.assumptions.length).toBeGreaterThan(0);
  });
});
