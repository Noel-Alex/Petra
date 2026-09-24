import { describe, expect, it } from "vitest";

import {
  adaptAuthoritativeProvenance,
  adaptAuthoritativeProvenanceList,
  type AuthoritativeProvenanceRecord,
} from "./authoritative";

describe("authoritative provenance adapter", () => {
  it("refuses to infer evidence class from a legacy tier or DOI", () => {
    const adapted = adaptAuthoritativeProvenance({
      id: "psi-max",
      label: "Reference PD psi max",
      evidenceTier: "A",
      sources: [
        {
          id: "regoes-2004",
          label: "Regoes et al. 2004",
          locator: "10.1128/AAC.48.10.3670-3676.2004",
        },
      ],
    });

    expect(adapted.kind).toBe("needs-classification");
    if (adapted.kind === "needs-classification") {
      expect(adapted.evidenceTier).toBe("A");
      expect(adapted.message).toContain("explicit evidence class");
    }
  });

  it("preserves transferred + mechanistic composition as two meanings", () => {
    const adapted = adaptAuthoritativeProvenance({
      id: "cipro-loss",
      label: "Ciprofloxacin loss composition",
      evidenceClass: "transferred_mechanistic_approximation",
      value: "reference PD decrement",
      context: "CAB1 PD shape composed with MG1655 genotype MICs",
      sources: [
        {
          id: "regoes",
          label: "Regoes et al. 2004",
          locator: "10.1128/AAC.48.10.3670-3676.2004",
        },
        {
          id: "marcusson",
          label: "Marcusson et al. 2009",
          locator: "10.1371/journal.ppat.1000541",
        },
      ],
      transferNote: "Reference PD and genotype table come from different systems.",
      limitation: "Stationary-phase interaction is not source-matched calibration.",
    });

    expect(adapted.kind).toBe("presentation");
    if (adapted.kind === "presentation") {
      expect(adapted.presentation.badges.map((badge) => badge.kind)).toEqual([
        "transferred",
        "approximation",
      ]);
      expect(adapted.presentation.status).toBe("complete");
      expect(
        adapted.presentation.details.filter((row) => row.label === "Source"),
      ).toHaveLength(2);
    }
  });

  it("keeps valid but incomplete records visibly incomplete", () => {
    const adapted = adaptAuthoritativeProvenance({
      id: "transferred-mic",
      label: "Transferred MIC",
      evidenceClass: "transferred",
      value: 0.38,
      units: "mg/L",
    });

    expect(adapted.kind).toBe("presentation");
    if (adapted.kind === "presentation") {
      expect(adapted.presentation.status).toBe("needs-provenance");
      expect(adapted.presentation.disclosures.join(" ")).toContain(
        "source is required",
      );
      expect(adapted.presentation.disclosures.join(" ")).toContain(
        "transfer note",
      );
    }
  });

  it("rejects unsupported explicit class instead of guessing", () => {
    const adapted = adaptAuthoritativeProvenance({
      id: "mystery",
      label: "Mystery parameter",
      evidenceClass: "peer-reviewed-high-confidence",
      evidenceTier: "A",
    });

    expect(adapted.kind).toBe("needs-classification");
    if (adapted.kind === "needs-classification") {
      expect(adapted.rawEvidenceClass).toBe("peer-reviewed-high-confidence");
    }
  });

  it("requires unique record ids for stable selection", () => {
    const record: AuthoritativeProvenanceRecord = {
      id: "same",
      label: "Same",
      evidenceClass: "engineering",
    };

    expect(() => adaptAuthoritativeProvenanceList([record, record])).toThrow(
      /duplicate provenance record id/,
    );
  });
});
