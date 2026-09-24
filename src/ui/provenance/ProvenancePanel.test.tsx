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
    expect(markup).toContain(
      'href="https://doi.org/10.1371/journal.ppat.1000541"',
    );
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain("Opens source in a new tab.");
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
    expect(markup).toContain(
      'href="https://doi.org/10.1371/journal.ppat.1000541"',
    );
    expect(markup).toContain("0 complete · 1 need provenance");
    expect(markup).not.toContain("Measured evidence");
  });

  it("renders unsupported locator schemes as visible non-actionable text", () => {
    const record = resolveScenarioProvenance({
      id: "unsafe",
      label: "Unsupported source",
      record: {
        citation: "unsafe",
      },
      scenario: {
        citations: {
          unsafe: {
            title: "Unsupported source locator",
            url: "javascript:alert(1)",
          },
        },
      },
    });

    const markup = renderToStaticMarkup(
      <ProvenancePanel records={[record]} />,
    );

    expect(markup).toContain("Unsupported source locator");
    expect(markup).toContain("javascript:alert(1)");
    expect(markup).not.toContain('href="javascript:alert(1)"');
    expect(markup).toContain("unsupported URL protocol");
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

  it("renders accessible discovery controls with incomplete-record safety disclosure", () => {
    const record = resolveScenarioProvenance({
      id: "missing",
      label: "Unclassified parameter",
      record: {},
      scenario: {},
    });

    const markup = renderToStaticMarkup(
      <ProvenancePanel records={[record]} />,
    );

    expect(markup).toContain('role="search"');
    expect(markup).toContain('type="search"');
    expect(markup).toContain("Search provenance");
    expect(markup).toContain("Evidence type");
    expect(markup).toContain("All evidence");
    expect(markup).toContain(
      "Needs-provenance records always remain visible",
    );
    expect(markup).toContain("1 of 1 records shown");
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
