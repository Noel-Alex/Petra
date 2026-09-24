import { describe, expect, it } from "vitest";

import {
  buildProvenancePresentation,
  normalizeEvidenceClass,
} from "./model";

describe("provenance presentation", () => {
  it("renders transferred mechanistic composition as two explicit meanings", () => {
    const presentation = buildProvenancePresentation({
      id: "drug-policy",
      label: "Resource × ciprofloxacin loss policy",
      evidenceClass: "transferred-mechanistic-approximation",
      sources: [
        { id: "regoes-2004", label: "Regoes et al. 2004" },
        { id: "marcusson-2009", label: "Marcusson et al. 2009" },
      ],
      transferNote: "Reference pharmacodynamics and genotype MICs come from different experimental systems.",
      limitation: "Stationary-phase interaction is not source-matched calibration.",
    });

    expect(presentation.status).toBe("complete");
    expect(presentation.badges.map((badge) => badge.label)).toEqual([
      "Transferred",
      "Model approximation",
    ]);
    expect(presentation.ariaLabel).toContain("Transferred, Model approximation");
  });

  it("preserves an explicitly resolved actionable source href in detail rows", () => {
    const presentation = buildProvenancePresentation({
      id: "source-link",
      label: "Source link",
      evidenceClass: "measured",
      sources: [
        {
          id: "paper",
          label: "Paper",
          locator: "DOI: 10.1000/example",
          href: "https://doi.org/10.1000/example",
        },
      ],
    });

    expect(presentation.details).toContainEqual({
      label: "Source",
      value: "Paper · DOI: 10.1000/example",
      href: "https://doi.org/10.1000/example",
    });
  });

  it("flags missing measured sources rather than inferring provenance from confidence", () => {
    const presentation = buildProvenancePresentation({
      id: "mic",
      label: "Ciprofloxacin MIC",
      evidenceClass: "measured",
      valueText: "0.016",
      units: "µg/mL",
    });

    expect(presentation.status).toBe("needs-provenance");
    expect(presentation.disclosures).toContain(
      "Provenance incomplete: a source is required for this evidence class.",
    );
  });

  it("requires transformation metadata for derived evidence", () => {
    const presentation = buildProvenancePresentation({
      id: "loss-hazard",
      label: "Drug loss hazard",
      evidenceClass: "derived",
      sources: [{ id: "pd-source", label: "Reference PD source" }],
    });

    expect(presentation.status).toBe("needs-provenance");
    expect(presentation.disclosures).toContain(
      "Provenance incomplete: derived evidence requires a documented transformation.",
    );
  });

  it("keeps engineering and visual-only classes visibly non-biological", () => {
    const engineering = buildProvenancePresentation({
      id: "lod",
      label: "Representative glyph budget",
      evidenceClass: "engineering",
      valueText: "400",
    });
    const visual = buildProvenancePresentation({
      id: "spark-radius",
      label: "Mutation spark radius",
      evidenceClass: "visual-only",
      valueText: "8 px",
    });

    expect(engineering.status).toBe("complete");
    expect(engineering.disclosures[0]).toContain("not present this value as a real bacterial constant");
    expect(visual.status).toBe("complete");
    expect(visual.disclosures[0]).toContain("cannot change simulation outcomes");
  });

  it("never relies on color alone for a badge", () => {
    for (const evidenceClass of [
      "measured",
      "derived",
      "transferred",
      "calibrated",
      "mechanistic-approximation",
      "engineering",
      "visual-only",
      "hypothesis-experimental",
      "transferred-mechanistic-approximation",
    ] as const) {
      const presentation = buildProvenancePresentation({
        id: evidenceClass,
        label: evidenceClass,
        evidenceClass,
        sources:
          evidenceClass === "engineering" ||
          evidenceClass === "visual-only" ||
          evidenceClass === "calibrated" ||
          evidenceClass === "hypothesis-experimental"
            ? undefined
            : [{ id: "source", label: "Source" }],
        transferNote:
          evidenceClass === "transferred" ||
          evidenceClass === "transferred-mechanistic-approximation"
            ? "Transfer disclosed."
            : undefined,
        calibrationNote:
          evidenceClass === "calibrated" ? "Calibrated to a declared scenario target." : undefined,
        limitation:
          evidenceClass === "mechanistic-approximation" ||
          evidenceClass === "transferred-mechanistic-approximation"
            ? "Approximation limitation disclosed."
            : undefined,
        transformation:
          evidenceClass === "derived" ? "Documented equation." : undefined,
      });

      for (const badge of presentation.badges) {
        expect(badge.label.length).toBeGreaterThan(0);
        expect(badge.iconToken.length).toBeGreaterThan(0);
        expect(badge.patternToken.length).toBeGreaterThan(0);
      }
    }
  });

  it("normalizes explicit aliases but refuses to infer from evidence tiers", () => {
    expect(normalizeEvidenceClass("transferred_mechanistic_approximation")).toBe(
      "transferred-mechanistic-approximation",
    );
    expect(normalizeEvidenceClass("approximation")).toBe(
      "mechanistic-approximation",
    );
    expect(normalizeEvidenceClass("experimental")).toBe(
      "hypothesis-experimental",
    );
    expect(normalizeEvidenceClass("A")).toBeNull();
    expect(normalizeEvidenceClass("peer-reviewed")).toBeNull();
  });
});
