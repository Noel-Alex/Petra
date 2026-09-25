import { describe, expect, it } from "vitest";

import {
  createComposedState,
} from "../authoritative";
import { buildFlagshipComposedRunPlan } from "../flagshipComposition";
import { buildTwoBacteriumSharedResourceRunPlan } from "../twoBacteriumComposition";
import {
  T4_FLAGSHIP_MG1655_HOST_ADMISSION,
  resolveAdmittedPhageHostLineages,
  validatePhageHostAdmissionAuthority,
  type PhageHostAdmissionAuthority,
} from "./hostAdmission";

function flagship() {
  const plan = buildFlagshipComposedRunPlan({
    seed: 20260925,
    initialResourceLevel: 1,
    inocula: [{ lineageId: "founder-wt", x: 80, y: 80, biomass: 1 }],
  });
  const state = createComposedState(plan.config);
  if (
    plan.config.taxonRegistry === undefined ||
    state.lineageTaxonMap === undefined
  ) {
    throw new Error("flagship must expose exact taxon authority");
  }
  return { plan, state };
}

describe("T4/MG1655 runtime host admission", () => {
  it("admits only the exact flagship MG1655@1.0.0 WT lineage", () => {
    const { plan, state } = flagship();

    const admitted = resolveAdmittedPhageHostLineages({
      taxonRegistry: plan.config.taxonRegistry!,
      lineageTaxonMap: state.lineageTaxonMap!,
      lineageIds: state.lineageIds,
      genotypeIds: state.genotypeIds,
    });

    expect(state.lineageIds).toEqual(["L1"]);
    expect(state.genotypeIds).toEqual(["WT"]);
    expect(admitted).toEqual([
      {
        lineageId: "L1",
        lineageIndex: 0,
        genotypeId: "WT",
        taxonId: "ecoli-k12-mg1655",
        taxonContentVersion: "1.0.0",
      },
    ]);
    expect(Object.isFrozen(admitted)).toBe(true);
    expect(Object.isFrozen(admitted[0])).toBe(true);
  });

  it("fails closed for a resistance-derived genotype on the same taxon revision", () => {
    const { plan, state } = flagship();

    const admitted = resolveAdmittedPhageHostLineages({
      taxonRegistry: plan.config.taxonRegistry!,
      lineageTaxonMap: state.lineageTaxonMap!,
      lineageIds: state.lineageIds,
      genotypeIds: ["A"],
    });

    expect(admitted).toEqual([]);
  });

  it("does not treat another MG1655 content revision or Bacillus as an admitted host", () => {
    const plan = buildTwoBacteriumSharedResourceRunPlan({
      seed: 20260925,
      initialResourceLevel: 1,
      inocula: [
        { lineageId: "ecoli-founder", x: 76, y: 80, biomass: 1 },
        { lineageId: "bsubtilis-founder", x: 84, y: 80, biomass: 1 },
      ],
    });
    const state = createComposedState(plan.config);
    if (
      plan.config.taxonRegistry === undefined ||
      state.lineageTaxonMap === undefined
    ) {
      throw new Error("two-bacterium run must expose exact taxon authority");
    }

    expect(() =>
      resolveAdmittedPhageHostLineages({
        taxonRegistry: plan.config.taxonRegistry!,
        lineageTaxonMap: state.lineageTaxonMap!,
        lineageIds: state.lineageIds,
        genotypeIds: state.genotypeIds,
      }),
    ).toThrow(/runtime taxon identity does not match reviewed authority/);
  });

  it("rejects source host or phage identity drift from canonical Nabergoj evidence", () => {
    const drifted: PhageHostAdmissionAuthority = {
      ...T4_FLAGSHIP_MG1655_HOST_ADMISSION,
      phage: {
        ...T4_FLAGSHIP_MG1655_HOST_ADMISSION.phage,
        collectionId: "invented-phage",
      },
    };

    expect(() => validatePhageHostAdmissionAuthority(drifted)).toThrow(
      /canonical T4\/MG1655 life-history host and phage identities/,
    );
  });

  it("rejects semantic drift hidden behind the same taxon id and content version", () => {
    const { plan, state } = flagship();
    const registry = {
      ...plan.config.taxonRegistry!,
      taxa: plan.config.taxonRegistry!.taxa.map((taxon) => ({
        ...taxon,
        background: "K-12 different background",
      })),
    };

    expect(() =>
      resolveAdmittedPhageHostLineages({
        taxonRegistry: registry,
        lineageTaxonMap: state.lineageTaxonMap!,
        lineageIds: state.lineageIds,
        genotypeIds: state.genotypeIds,
      }),
    ).toThrow(/runtime taxon identity does not match reviewed authority/);
  });

  it("rejects lineage/genotype channel-length drift before admission", () => {
    const { plan, state } = flagship();

    expect(() =>
      resolveAdmittedPhageHostLineages({
        taxonRegistry: plan.config.taxonRegistry!,
        lineageTaxonMap: state.lineageTaxonMap!,
        lineageIds: state.lineageIds,
        genotypeIds: [],
      }),
    ).toThrow(/identical lengths/);
  });
});
