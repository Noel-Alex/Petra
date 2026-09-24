import { describe, expect, it } from "vitest";

import { buildFlagshipProvenanceView } from "../../src/app/flagshipProvenance";

describe("flagship provenance presentation projection", () => {
  it("carries the authoritative flagship identity into presentation", () => {
    const view = buildFlagshipProvenanceView();

    expect(view.scenario).toEqual({
      id: "ecoli-ciprofloxacin-spatial",
      version: "1.4.0-research",
      title: "E. coli / ciprofloxacin spatial evolution",
    });
  });

  it("resolves every exposed flagship record without inventing fallback evidence", () => {
    const view = buildFlagshipProvenanceView();

    expect(view.records.length).toBeGreaterThan(1);
    expect(view.records.every((record) => record.status === "complete")).toBe(true);
    expect(view.records.every((record) => record.rawClassification !== null)).toBe(true);
  });

  it("exposes the baseline composed parameter set as engineering authority", () => {
    const view = buildFlagshipProvenanceView();
    const parameterSet = view.records.find((record) =>
      record.id.startsWith("composed-parameter-set:"),
    );

    expect(parameterSet?.status).toBe("complete");
    expect(parameterSet?.rawClassification).toBe("engineering");
    expect(parameterSet?.sourceKeys).toEqual([]);
    expect(parameterSet?.presentation?.limitation).toContain(
      "not a physical culture calibration",
    );
  });

  it("exposes the runnable ecology profile as engineering rather than measured science", () => {
    const view = buildFlagshipProvenanceView();
    const profile = view.records.find((record) =>
      record.id.startsWith("execution-profile:"),
    );

    expect(profile?.status).toBe("complete");
    expect(profile?.rawClassification).toBe("engineering");
    expect(profile?.sourceKeys).toEqual([]);
    expect(profile?.presentation?.limitation).toContain(
      "Science-Mode physical growth parameters remain UNBOUND",
    );
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
