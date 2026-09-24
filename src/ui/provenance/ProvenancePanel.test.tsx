import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { ProvenancePanel } from "./ProvenancePanel";
import {
  resolveScenarioProvenance,
  resolveScenarioTransferAssumptions,
} from "./scenarioAdapter";

describe("provenance panel", () => {
  it("renders complete evidence with text, icon geometry, pattern identity, and sources", () => {
    const record = resolveScenarioProvenance({
      id: "mic",
      label: "Ciprofloxacin MIC",
      record: {
        classification: "measured",
        citation: "marcusson_2009",
      },
      scenario: {
        citations: {
          marcusson_2009: {
            title: "Marcusson et al. 2009",
            doi: "10.1371/journal.ppat.1000541",
          },
        },
      },
      valueText: "0.016",
      units: "mg/L",
      context: "E. coli K-12 MG1655",
    });

    const markup = renderToStaticMarkup(
      <ProvenancePanel records={[record]} />,
    );

    expect(markup).toContain("Ciprofloxacin MIC");
    expect(markup).toContain("Measured");
    expect(markup).toContain('data-pattern="solid"');
    expect(markup).toContain("<svg");
    expect(markup).toContain("Marcusson et al. 2009");
    expect(markup).toContain("DOI: 10.1371/journal.ppat.1000541");
    expect(markup).toContain("1 complete");
  });

  it("keeps incomplete provenance visibly incomplete instead of rendering a neutral badge", () => {
    const record = resolveScenarioProvenance({
      id: "genotype",
      label: "Wild-type relative fitness",
      record: { citation: "marcusson_2009" },
      scenario: {
        citations: {
          marcusson_2009: {
            title: "Marcusson et al. 2009",
            doi: "10.1371/journal.ppat.1000541",
          },
        },
      },
      valueText: "1.00",
    });

    const markup = renderToStaticMarkup(
      <ProvenancePanel records={[record]} />,
    );

    expect(markup).toContain("Needs provenance");
    expect(markup).toContain(
      "Provenance incomplete: an explicit evidence classification is required.",
    );
    expect(markup).toContain("Declared sources");
    expect(markup).toContain("Marcusson et al. 2009");
    expect(markup).toContain("DOI: 10.1371/journal.ppat.1000541");
    expect(markup).toContain("0 complete · 1 need provenance");
    expect(markup).not.toContain("Measured evidence");
  });

  it("renders scenario assumptions separately from field-level evidence", () => {
    const assumptions = resolveScenarioTransferAssumptions({
      transferAssumptions: [
        "Reference pharmacodynamics are transferred across experimental systems.",
        "Spatial transport requires calibration.",
      ],
    });

    const markup = renderToStaticMarkup(
      <ProvenancePanel records={[]} assumptions={assumptions} />,
    );

    expect(markup).toContain("Scenario assumptions");
    expect(markup).toContain(
      "Reference pharmacodynamics are transferred across experimental systems.",
    );
    expect(markup).toContain("No provenance records are available");
  });

  it("renders transferred mechanistic meaning as two distinct patterned badges", () => {
    const record = resolveScenarioProvenance({
      id: "drug-policy",
      label: "Resource × ciprofloxacin loss policy",
      record: {
        classification: "transferred_mechanistic_approximation",
        citations: ["regoes", "marcusson"],
      },
      scenario: {
        citations: {
          regoes: { title: "Regoes et al.", doi: "10.1/regoes" },
          marcusson: { title: "Marcusson et al.", doi: "10.1/marcusson" },
        },
      },
      transferNote: "Cross-study transfer disclosed.",
      limitation: "Composition remains a model approximation.",
    });

    const markup = renderToStaticMarkup(
      <ProvenancePanel records={[record]} />,
    );

    expect(markup).toContain("Transferred");
    expect(markup).toContain("Model approximation");
    expect(markup).toContain('data-pattern="diagonal"');
    expect(markup).toContain('data-pattern="crosshatch"');
  });
});
