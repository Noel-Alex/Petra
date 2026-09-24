import { describe, expect, it } from "vitest";

import { discoverBundledScenarios } from "./registry";

describe("bundled scenario discovery", () => {
  it("uses the shared Science Mode admission result for product discovery", () => {
    const scenarios = discoverBundledScenarios();

    expect(scenarios).toHaveLength(1);
    expect(scenarios[0]).toMatchObject({
      id: "ecoli-ciprofloxacin-spatial",
      version: "1.4.0-research",
      educationalScienceSelectable: true,
      referenceScienceModeSelectable: false,
      scienceAdmission: {
        maturity: "validated-educational",
        availability: "educational-only",
        referenceEligible: false,
      },
    });
  });
});
