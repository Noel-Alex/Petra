import { describe, expect, it } from "vitest";

import { composedConfigurationFingerprint } from "../sim/authoritative";
import { ComposedSimulationEngine } from "../sim/composedEngine";
import { buildTwoBacteriumSharedResourceRunPlan } from "../sim/twoBacteriumComposition";
import { projectAuthoritativeComposedDishSnapshot } from "./composedDishProjection";
import { createTwoBacteriumDishOrganismPresentationAuthority } from "./twoBacteriumPresentationAuthority";

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
  it("binds exact E. coli and Bacillus revisions without changing scientific render channels", () => {
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
      createTwoBacteriumDishOrganismPresentationAuthority(plan),
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

  it("fails closed when exact-looking run identity is paired with drifted composed config authority", () => {
    const plan = mixedPlan();
    const driftedConfig = {
      ...plan.config,
      growth: {
        ...plan.config.growth,
        localCapacity: plan.config.growth.localCapacity + 1,
      },
    };

    expect(() =>
      createTwoBacteriumDishOrganismPresentationAuthority({
        ...plan,
        config: driftedConfig,
      }),
    ).toThrow(/configuration fingerprint does not match parameter-set binding/i);

    expect(() =>
      createTwoBacteriumDishOrganismPresentationAuthority({
        ...plan,
        parameterSetBinding: {
          ...plan.parameterSetBinding,
          configurationFingerprint: "foreign-configuration-fingerprint",
        },
      }),
    ).toThrow(/plan parameter-set binding to match run identity/i);
  });

  it("fails closed on foreign run identity or a taxon revision that has not been rebound", () => {
    const plan = mixedPlan();
    const foreign = {
      ...plan,
      identity: {
        ...plan.identity,
        scenarioVersion: plan.identity.scenarioVersion + ":foreign",
      },
    };
    expect(() =>
      createTwoBacteriumDishOrganismPresentationAuthority(foreign),
    ).toThrow(/exact bundled run identity/i);

    const staleTaxonRegistry = {
      ...plan.config.taxonRegistry!,
      taxa: plan.config.taxonRegistry!.taxa.map((taxon) =>
        taxon.id === "bsubtilis-168-trp-plus-sige-minus"
          ? {
              ...taxon,
              contentVersion: taxon.contentVersion + ":stale",
            }
          : taxon,
      ),
    };
    const staleConfig = {
      ...plan.config,
      taxonRegistry: staleTaxonRegistry,
    };
    const staleParameterSetBinding = {
      ...plan.parameterSetBinding,
      configurationFingerprint: composedConfigurationFingerprint(staleConfig),
    };
    const stale = {
      ...plan,
      config: staleConfig,
      parameterSetBinding: staleParameterSetBinding,
      identity: {
        ...plan.identity,
        parameterSetBinding: staleParameterSetBinding,
      },
    };

    expect(() =>
      createTwoBacteriumDishOrganismPresentationAuthority(stale),
    ).toThrow(/content version mismatch/i);
  });
});
