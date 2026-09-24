import { describe, expect, it } from "vitest";

import {
  resolveScenarioProvenance,
  resolveScenarioTransferAssumptions,
  type ScenarioProvenanceContext,
} from "./scenarioAdapter";

const scenario: ScenarioProvenanceContext = {
  citations: {
    regoes_2004: {
      title: "Regoes et al. 2004",
      doi: "10.1128/AAC.48.10.3670-3676.2004",
    },
    marcusson_2009: {
      title: "Marcusson et al. 2009",
      doi: "10.1371/journal.ppat.1000541",
    },
    huseby_2017: {
      title: "Huseby et al. 2017",
      doi: "10.1093/molbev/msx052",
    },
  },
  transferAssumptions: [
    "Reference pharmacodynamics and genotype MICs come from different experimental systems.",
    "Spatial transport requires scenario calibration before physical claims.",
  ],
};

describe("scenario provenance adapter", () => {
  it("resolves an explicit transferred mechanistic record without inferring semantics", () => {
    const result = resolveScenarioProvenance({
      id: "drug-policy",
      label: "Resource × ciprofloxacin loss policy",
      record: {
        classification: "transferred_mechanistic_approximation",
        citations: ["regoes_2004", "marcusson_2009"],
      },
      scenario,
      transferNote:
        "Reference pharmacodynamics and genotype MICs come from different experimental systems.",
      limitation:
        "Stationary-phase interaction is not source-matched calibration.",
      transformation: "h_drug = ln(10) * (psi_max - psi_g(a))",
    });

    expect(result.status).toBe("complete");
    expect(result.problems).toEqual([]);
    expect(result.presentation?.badges.map((badge) => badge.label)).toEqual([
      "Transferred",
      "Model approximation",
    ]);
    expect(result.presentation?.details).toContainEqual({
      label: "Source",
      value:
        "Regoes et al. 2004 · DOI: 10.1128/AAC.48.10.3670-3676.2004",
      href: "https://doi.org/10.1128/AAC.48.10.3670-3676.2004",
    });
  });


  it("resolves normalized nested provenance without reinterpreting domain classification", () => {
    const result = resolveScenarioProvenance({
      id: "mutation-edge",
      label: "WT → gyrA S83L mutation target",
      record: {
        classification: "model_target_probability",
        citation: "huseby_2017",
        provenance: {
          classification: "mechanistic_approximation",
          citation: "huseby_2017",
          context: "Huseby-scale mutation target used in Petra's curated graph.",
          limitation:
            "This is a model target order of magnitude, not a measured exact edge probability.",
        },
      },
      scenario,
    });

    expect(result.status).toBe("complete");
    expect(result.rawClassification).toBe("mechanistic_approximation");
    expect(result.presentation?.badges.map((badge) => badge.label)).toEqual([
      "Model approximation",
    ]);
    expect(result.presentation?.details).toContainEqual({
      label: "Source",
      value: "Huseby et al. 2017 · DOI: 10.1093/molbev/msx052",
      href: "https://doi.org/10.1093/molbev/msx052",
    });
  });

  it("uses nested measured provenance for normalized genotype records", () => {
    const result = resolveScenarioProvenance({
      id: "genotype-wt",
      label: "Wild type MIC / fitness",
      record: {
        citation: "marcusson_2009",
        provenance: {
          classification: "measured",
          citation: "marcusson_2009",
          context: "E. coli K-12 MG1655.",
        },
      },
      scenario,
      valueText: "0.016 mg/L; fitness 1.00",
    });

    expect(result.status).toBe("complete");
    expect(result.presentation?.details).toContainEqual({
      label: "Context",
      value: "E. coli K-12 MG1655.",
    });
  });

  it("does not fall back to top-level classification when nested provenance is malformed", () => {
    const result = resolveScenarioProvenance({
      id: "malformed",
      label: "Malformed nested provenance",
      record: {
        classification: "measured",
        citation: "marcusson_2009",
        provenance: "measured",
      },
      scenario,
    });

    expect(result.status).toBe("needs-provenance");
    expect(result.presentation).toBeNull();
    expect(result.problems).toContain("Provenance record must be an object.");
    expect(result.rawClassification).toBeNull();
  });

  it("does not infer measured evidence merely because a citation exists", () => {
    const result = resolveScenarioProvenance({
      id: "mic",
      label: "Ciprofloxacin MIC",
      record: { citation: "marcusson_2009" },
      scenario,
      valueText: "0.016",
      units: "mg/L",
    });

    expect(result.status).toBe("needs-provenance");
    expect(result.presentation).toBeNull();
    expect(result.sourceKeys).toEqual(["marcusson_2009"]);
    expect(result.problems[0]).toContain(
      "explicit evidence classification is required",
    );
  });

  it("keeps unsupported source-domain classifications visibly incomplete", () => {
    const result = resolveScenarioProvenance({
      id: "mutation-edge",
      label: "WT → gyrA S83L mutation target",
      record: {
        classification: "model_target_probability",
        citation: "regoes_2004",
      },
      scenario,
    });

    expect(result.status).toBe("needs-provenance");
    expect(result.presentation).toBeNull();
    expect(result.rawClassification).toBe("model_target_probability");
    expect(result.problems[0]).toContain(
      'unsupported explicit evidence classification "model_target_probability"',
    );
  });

  it("lets the presentation contract expose missing required sources", () => {
    const result = resolveScenarioProvenance({
      id: "composition",
      label: "Transferred PD composition",
      record: {
        classification: "transferred_mechanistic_approximation",
      },
      scenario,
      transferNote: "Cross-study transfer disclosed.",
      limitation: "Approximation limitation disclosed.",
    });

    expect(result.status).toBe("needs-provenance");
    expect(result.presentation?.status).toBe("needs-provenance");
    expect(result.presentation?.disclosures).toContain(
      "Provenance incomplete: a source is required for this evidence class.",
    );
  });

  it("reports broken citation keys instead of inventing source metadata", () => {
    const result = resolveScenarioProvenance({
      id: "pd",
      label: "Reference pharmacodynamics",
      record: {
        classification: "transferred",
        citation: "missing_source",
      },
      scenario,
      transferNote: "Transferred from another experimental context.",
    });

    expect(result.status).toBe("needs-provenance");
    expect(result.presentation?.details.some((row) => row.label === "Source")).toBe(
      false,
    );
    expect(result.problems).toContain(
      'Provenance incomplete: citation key "missing_source" is not present in the active scenario citation map.',
    );
  });

  it("preserves explicit HTTP(S) citation URLs as actionable source authority", () => {
    const result = resolveScenarioProvenance({
      id: "url-source",
      label: "Explicit URL source",
      record: { classification: "measured", citation: "source" },
      scenario: {
        citations: {
          source: {
            title: "Explicit evidence page",
            url: "https://example.org/petra-evidence",
          },
        },
      },
    });

    expect(result.status).toBe("complete");
    expect(result.sources).toContainEqual({
      id: "source",
      label: "Explicit evidence page",
      locator: "https://example.org/petra-evidence",
      href: "https://example.org/petra-evidence",
    });
    expect(result.presentation?.details).toContainEqual({
      label: "Source",
      value:
        "Explicit evidence page · https://example.org/petra-evidence",
      href: "https://example.org/petra-evidence",
    });
  });

  it("keeps unsupported citation URL schemes visible but non-actionable", () => {
    const result = resolveScenarioProvenance({
      id: "unsafe-url",
      label: "Unsupported locator",
      record: { classification: "measured", citation: "source" },
      scenario: {
        citations: {
          source: {
            title: "Unsupported source locator",
            url: "javascript:alert(1)",
          },
        },
      },
    });

    expect(result.status).toBe("needs-provenance");
    expect(result.sources).toContainEqual({
      id: "source",
      label: "Unsupported source locator",
      locator: "javascript:alert(1)",
    });
    expect(result.sources[0]?.href).toBeUndefined();
    expect(result.problems).toContain(
      'Provenance incomplete: citation "source" uses unsupported URL protocol "javascript:".',
    );
  });

  it("flags malformed supplied citation locators rather than silently dropping them", () => {
    const result = resolveScenarioProvenance({
      id: "measured",
      label: "Measured quantity",
      record: { classification: "measured", citation: "broken" },
      scenario: {
        citations: {
          broken: { title: "Broken citation", doi: 42 },
        },
      },
    });

    expect(result.status).toBe("needs-provenance");
    expect(result.problems).toContain(
      'Provenance incomplete: citation "broken" has an invalid DOI locator.',
    );
  });

  it("keeps scenario transfer assumptions separate from field-specific claims", () => {
    const result = resolveScenarioTransferAssumptions(scenario);

    expect(result.problems).toEqual([]);
    expect(result.assumptions).toEqual([
      "Reference pharmacodynamics and genotype MICs come from different experimental systems.",
      "Spatial transport requires scenario calibration before physical claims.",
    ]);
  });

  it("reports malformed assumptions while preserving valid authoritative text", () => {
    const result = resolveScenarioTransferAssumptions({
      transferAssumptions: ["Valid assumption.", "", 7],
    });

    expect(result.assumptions).toEqual(["Valid assumption."]);
    expect(result.problems).toHaveLength(2);
  });
});
