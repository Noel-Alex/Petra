import { describe, expect, it } from "vitest";

import { ComposedSimulationEngine } from "../sim/composedEngine";
import { buildTwoBacteriumSharedResourceRunPlan } from "../sim/twoBacteriumComposition";
import { projectAuthoritativeComposedDishSnapshot } from "./composedDishProjection";
import { buildTwoBacteriumDishOrganismPresentationAuthority } from "./twoBacteriumPresentationAuthority";

function mixedPlan() {
  return buildTwoBacteriumSharedResourceRunPlan({
    seed: 20260925,
    initialResourceLevel: 1,
    inocula: [
      { lineageId: "ecoli-founder", x: 76, y: 80, biomass: 1 },
      { lineageId: "bsubtilis-founder", x: 84, y: 80, biomass: 1 },
    ],
  });
}

describe("two-bacterium organism presentation authority", () => {
  it("binds the exact E. coli and Bacillus taxon revisions without changing scientific render channels", () => {
    const plan = mixedPlan();
    const engine = new ComposedSimulationEngine(plan.identity, plan.config);
    const snapshot = engine.snapshot();
    if (snapshot.checkpoint.authority !== "composed") {
      throw new Error("expected composed two-bacterium snapshot");
    }

    const neutral = projectAuthoritativeComposedDishSnapshot(
      snapshot,
      "two-bacterium-presentation-parity",
    );
    const resolved = projectAuthoritativeComposedDishSnapshot(
      snapshot,
      "two-bacterium-presentation-parity",
      null,
      buildTwoBacteriumDishOrganismPresentationAuthority(plan),
    );

    expect(
      resolved.lineages.map(
        (lineage) => lineage.organismPresentation?.id ?? null,
      ),
    ).toEqual([
      "ecoli-k12-mg1655-representative-morphology-v1",
      "bacillus-subtilis-168-trpplus-sige-representative-morphology-v1",
    ]);

    expect([...resolved.dishMask]).toEqual([...neutral.dishMask]);
    expect([...resolved.biomass]).toEqual([...neutral.biomass]);
    expect(
      resolved.lineages.map((lineage) => [...lineage.density]),
    ).toEqual(neutral.lineages.map((lineage) => [...lineage.density]));
    expect(
      resolved.fields.map((field) => [
        field.id,
        field.unit,
        field.minimum,
        field.maximum,
        [...field.values],
      ]),
    ).toEqual(
      neutral.fields.map((field) => [
        field.id,
        field.unit,
        field.minimum,
        field.maximum,
        [...field.values],
      ]),
    );
  });

  it("fails closed when the biological content revision changes without a reviewed presentation rebind", () => {
    const plan = mixedPlan();
    const staleTaxonRegistry = {
      ...plan.taxonRegistry,
      taxa: plan.taxonRegistry.taxa.map((taxon) =>
        taxon.id === "bsubtilis-168-trp-plus-sige-minus"
          ? {
              ...taxon,
              contentVersion: taxon.contentVersion + ":stale",
            }
          : taxon,
      ),
    };

    expect(() =>
      buildTwoBacteriumDishOrganismPresentationAuthority({
        taxonRegistry: staleTaxonRegistry,
      }),
    ).toThrow(/content version mismatch/i);
  });
});
