import { describe, expect, it } from "vitest";

import { filterProvenanceRecords } from "./filter";
import { resolveScenarioProvenance } from "./scenarioAdapter";

const scenario = {
  citations: {
    measured: { title: "Measured paper", doi: "10.1/measured" },
    transfer: { title: "Transferred paper", doi: "10.1/transfer" },
  },
};

const measured = resolveScenarioProvenance({
  id: "mic",
  label: "Ciprofloxacin MIC",
  record: { classification: "measured", citation: "measured" },
  scenario,
  context: "E. coli reference condition",
});

const transferred = resolveScenarioProvenance({
  id: "drug-shape",
  label: "Drug response shape",
  record: {
    classification: "transferred",
    citation: "transfer",
    transferNote: "Transferred across assay contexts.",
  },
  scenario,
});

const incomplete = resolveScenarioProvenance({
  id: "missing-class",
  label: "Unclassified display parameter",
  record: { citation: "measured" },
  scenario,
});

describe("provenance record discovery", () => {
  it("searches labels, details and source metadata case-insensitively", () => {
    expect(
      filterProvenanceRecords([measured, transferred], {
        query: "REFERENCE CONDITION",
        evidence: "all",
      }).records.map((record) => record.id),
    ).toEqual(["mic"]);

    expect(
      filterProvenanceRecords([measured, transferred], {
        query: "Transferred paper",
        evidence: "all",
      }).records.map((record) => record.id),
    ).toEqual(["drug-shape"]);
  });

  it("filters complete records by explicit presentation badge kind", () => {
    const result = filterProvenanceRecords([measured, transferred], {
      query: "",
      evidence: "transferred",
    });

    expect(result.records.map((record) => record.id)).toEqual(["drug-shape"]);
    expect(result.matchingCompleteCount).toBe(1);
    expect(result.hiddenCompleteCount).toBe(1);
  });

  it("never hides needs-provenance records accidentally", () => {
    const result = filterProvenanceRecords(
      [measured, transferred, incomplete],
      {
        query: "does-not-match-anything",
        evidence: "measured",
      },
    );

    expect(result.records.map((record) => record.id)).toEqual([
      "missing-class",
    ]);
    expect(result.needsProvenanceCount).toBe(1);
    expect(result.pinnedNeedsProvenanceCount).toBe(1);
    expect(result.hiddenCompleteCount).toBe(2);
  });

  it("does not count an incomplete record as pinned when it naturally matches", () => {
    const result = filterProvenanceRecords([incomplete], {
      query: "unclassified",
      evidence: "all",
    });

    expect(result.records).toHaveLength(1);
    expect(result.pinnedNeedsProvenanceCount).toBe(0);
  });
});
