import { describe, expect, it } from "vitest";

import {
  listBundledScenarioDiscovery,
  listGroundedScienceModeScenarios,
} from "../../src/app/scenarioDiscovery";

describe("scenario discovery Science Mode admission", () => {
  it("keeps experimental packs discoverable without presenting them as grounded Science Mode", () => {
    const entries = listBundledScenarioDiscovery();

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      id: "ecoli-ciprofloxacin-spatial",
      version: "1.5.0-research",
      catalogStatus: "research",
      scienceMode: {
        maturity: "experimental",
        admitted: false,
      },
    });
    expect(entries[1]).toMatchObject({
      id: "ecoli-bsubtilis-shared-resource",
      version: "1.0.0-experimental",
      catalogStatus: "experimental",
      scienceMode: {
        maturity: "experimental",
        admitted: false,
      },
    });
    expect(entries[0]?.scienceMode.reasons.length).toBeGreaterThan(0);
    expect(entries[1]?.scienceMode.reasons.length).toBeGreaterThan(0);
  });

  it("exposes no grounded Science Mode scenario until the flagship admission blockers are resolved", () => {
    expect(listGroundedScienceModeScenarios()).toEqual([]);
  });
});
