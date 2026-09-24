import { describe, expect, it } from "vitest";

import { buildFlagshipProvenanceView } from "../../src/app/flagshipProvenance";

describe("flagship provenance presentation projection", () => {
  it("resolves every exposed flagship record without inventing fallback evidence", () => {
    const view = buildFlagshipProvenanceView();

    expect(view.records.length).toBeGreaterThan(1);
    expect(view.records.every((record) => record.status === "complete")).toBe(true);
    expect(view.records.every((record) => record.rawClassification !== null)).toBe(true);
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
