import { describe, expect, it } from "vitest";

import {
  FLAGSHIP_ECOLI_ORGANISM_PRESENTATION,
} from "../render/organismPresentationIdentity";
import {
  createAuthoritativeTaxonRegistry,
} from "../sim/taxonIdentity";
import { buildDefaultFlagshipRun } from "./flagshipRunPreset";
import {
  createFlagshipDishOrganismPresentationAuthority,
} from "./flagshipOrganismPresentationAuthority";

describe("flagship organism presentation authority", () => {
  it("binds the reviewed rod presentation to the exact simulation-owned MG1655 taxon revision", () => {
    const run = buildDefaultFlagshipRun();
    const authority = run.organismPresentationAuthority;

    expect(authority.taxonRegistry).toBe(run.plan.config.taxonRegistry);
    expect(authority.presentationCatalog.bindings).toHaveLength(1);
    expect(authority.presentationCatalog.bindings[0]).toMatchObject({
      taxonId: "ecoli-k12-mg1655",
      taxonContentVersion: "1.0.0",
      presentation: {
        id: FLAGSHIP_ECOLI_ORGANISM_PRESENTATION.id,
        morphology: "rod",
        organismKind: "bacterium",
      },
    });
    expect(Object.isFrozen(authority)).toBe(true);
  });

  it("fails closed if the flagship taxon revision drifts without matching presentation evidence", () => {
    const run = buildDefaultFlagshipRun();
    const currentRegistry = run.plan.config.taxonRegistry;
    if (currentRegistry === undefined) {
      throw new Error("fixture requires flagship taxon authority");
    }
    const driftedRegistry = createAuthoritativeTaxonRegistry(
      currentRegistry.taxa.map((taxon) => ({
        ...taxon,
        contentVersion: "1.0.1",
        provenance: {
          ...taxon.provenance,
          context: "Test-only revised biological content identity.",
        },
      })),
    );

    expect(() =>
      createFlagshipDishOrganismPresentationAuthority({
        ...run.plan,
        config: {
          ...run.plan.config,
          taxonRegistry: driftedRegistry,
        },
      }),
    ).toThrow(/exact scenario-owned taxon revision/);
  });

  it("refuses presentation authority for a foreign runtime scenario identity", () => {
    const run = buildDefaultFlagshipRun();

    expect(() =>
      createFlagshipDishOrganismPresentationAuthority({
        ...run.plan,
        identity: {
          ...run.plan.identity,
          scenarioVersion: "foreign-scenario-version",
        },
      }),
    ).toThrow(/exact bundled scenario identity/);
  });
});
