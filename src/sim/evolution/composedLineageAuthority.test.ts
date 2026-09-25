import { describe, expect, it } from "vitest";
import {
  BASELINE_NON_DRUG_LOSS_POLICY_SCHEMA_VERSION,
  EXPLICIT_GENOTYPE_BASELINE_LOSS_RULE,
  type BaselineNonDrugLossPolicy,
} from "./baselineLossPolicy";
import {
  appendMaterializedMutationLineagesToAuthority,
  initializeDynamicLineageAuthority,
  validateDynamicLineageAuthorityState,
  type ComposedFounderLineageAuthority,
  type DynamicLineageAuthorityState,
} from "./composedLineageAuthority";
import { LineageRegistry } from "./lineage";
import {
  CHILD_LINEAGE_MATERIALIZATION_VERSION,
  type ChildLineageMaterializationResult,
} from "./materializeMutationLineages";
import {
  AUTHORITATIVE_TAXON_IDENTITY_SCHEMA_VERSION,
  createAuthoritativeTaxonRegistry,
} from "../taxonIdentity";

const FOUNDERS: readonly ComposedFounderLineageAuthority[] = [
  {
    founderId: "founder-wt",
    genotypeId: "WT",
    deathHazardPerHour: 0,
  },
];

const TAXON_REGISTRY = createAuthoritativeTaxonRegistry([
  {
    schemaVersion: AUTHORITATIVE_TAXON_IDENTITY_SCHEMA_VERSION,
    id: "fixture-bacterium",
    contentVersion: "1.0.0",
    scientificName: "Fixture bacterium",
    background: "test strain",
    microbialGroup: "bacterium",
    provenance: {
      sourceKeys: ["fixture:taxon"],
      context: "Test-only composed taxon authority.",
      limitation: "Not a scientific Petra content pack.",
    },
  },
]);
const TAXON_FOUNDERS: readonly ComposedFounderLineageAuthority[] = [
  {
    ...FOUNDERS[0]!,
    taxonId: "fixture-bacterium",
    taxonContentVersion: "1.0.0",
  },
];

function policy(
  includeMutant = true,
): BaselineNonDrugLossPolicy {
  return {
    schemaVersion: BASELINE_NON_DRUG_LOSS_POLICY_SCHEMA_VERSION,
    id: "fixture-dynamic-lineage-loss-v1",
    rule: EXPLICIT_GENOTYPE_BASELINE_LOSS_RULE,
    entries: [
      {
        genotypeId: "WT",
        deathHazardPerHour: 0,
        provenance: {
          classification: "engineering",
          sourceKeys: [],
          context: "Test founder baseline.",
          limitation: "Fixture only.",
        },
      },
      ...(includeMutant
        ? [
            {
              genotypeId: "MUT",
              deathHazardPerHour: 0.2,
              provenance: {
                classification: "engineering" as const,
                sourceKeys: [],
                context: "Test mutation-child baseline.",
                limitation: "Fixture only; not a measured death rate.",
              },
            },
          ]
        : []),
    ],
  };
}

function oneChildMaterialization(
  state: DynamicLineageAuthorityState,
): ChildLineageMaterializationResult {
  const registry = LineageRegistry.restore(state.lineageRegistry);
  const record = registry.create({
    parentLineageId: "L1",
    genotypeId: "MUT",
    createdAtHours: 0.25,
    originCellIndex: 7,
    mutationClass: "target-site",
  });

  return {
    version: CHILD_LINEAGE_MATERIALIZATION_VERSION,
    populationConfigurationIdentity: "fixture-static-population-authority",
    populationRevision: 3,
    samplingPolicyIdentity: "fixture-sampling-policy",
    createdAtHours: 0.25,
    children: [
      {
        lineageId: record.lineageId,
        parentLineageId: "L1",
        sourceGenotypeId: "WT",
        targetGenotypeId: "MUT",
        originCellIndex: 7,
        createdAtHours: 0.25,
        mutationClass: "target-site",
        citationKey: "fixture-mutation-source",
        birthOrdinal: 0,
      },
    ],
    lineageCheckpoint: registry.checkpoint(),
  };
}

describe("composed dynamic lineage authority", () => {
  it("initializes configured founders as registry-owned runtime lineage identity", () => {
    const state = initializeDynamicLineageAuthority(FOUNDERS);

    expect(state.lineageIds).toEqual(["L1"]);
    expect(state.genotypeIds).toEqual(["WT"]);
    expect(state.baselineDeathHazardPerHour).toEqual([0]);
    expect(state.lineageRegistry.nextId).toBe(2);
    expect(state.lineageRegistry.records[0]).toMatchObject({
      lineageId: "L1",
      parentLineageId: null,
      genotypeId: "WT",
      createdAtHours: 0,
      mutationClass: null,
    });
    expect(() =>
      validateDynamicLineageAuthorityState(state, FOUNDERS, null),
    ).not.toThrow();
  });

  it("appends materialized mutation children without mutating prior authority", () => {
    const initial = initializeDynamicLineageAuthority(FOUNDERS);
    const before = structuredClone(initial);
    const materialized = oneChildMaterialization(initial);

    const next = appendMaterializedMutationLineagesToAuthority(
      initial,
      FOUNDERS,
      policy(),
      materialized,
    );

    expect(initial).toEqual(before);
    expect(next.lineageIds).toEqual(["L1", "L2"]);
    expect(next.genotypeIds).toEqual(["WT", "MUT"]);
    expect(next.baselineDeathHazardPerHour).toEqual([0, 0.2]);
    expect(next.lineageRegistry.nextId).toBe(3);
    expect(next.lineageRegistry.records[1]).toMatchObject({
      lineageId: "L2",
      parentLineageId: "L1",
      genotypeId: "MUT",
      createdAtHours: 0.25,
      originCellIndex: 7,
      mutationClass: "target-site",
    });
  });

  it("fails closed when child baseline-loss authority is absent", () => {
    const initial = initializeDynamicLineageAuthority(FOUNDERS);
    const before = structuredClone(initial);
    const materialized = oneChildMaterialization(initial);

    expect(() =>
      appendMaterializedMutationLineagesToAuthority(
        initial,
        FOUNDERS,
        policy(false),
        materialized,
      ),
    ).toThrow(/no authority for genotype MUT/);
    expect(initial).toEqual(before);

    expect(() =>
      appendMaterializedMutationLineagesToAuthority(
        initial,
        FOUNDERS,
        null,
        materialized,
      ),
    ).toThrow(/requires explicit baseline non-drug loss policy/);
    expect(initial).toEqual(before);
  });

  it("rejects materialization provenance that disagrees with registry parent identity", () => {
    const initial = initializeDynamicLineageAuthority(FOUNDERS);
    const materialized = oneChildMaterialization(initial);
    const forged: ChildLineageMaterializationResult = {
      ...materialized,
      children: [
        {
          ...materialized.children[0]!,
          sourceGenotypeId: "FORGED",
        },
      ],
    };

    expect(() =>
      appendMaterializedMutationLineagesToAuthority(
        initial,
        FOUNDERS,
        policy(),
        forged,
      ),
    ).toThrow(/source genotype does not match registry parent/);
  });

  it("rejects materialization that rewrites prior registry history", () => {
    const initial = initializeDynamicLineageAuthority(FOUNDERS);
    const registry = LineageRegistry.restore(initial.lineageRegistry);
    registry.markExtinct("L1", 0.25);
    const child = registry.create({
      parentLineageId: "L1",
      genotypeId: "MUT",
      createdAtHours: 0.25,
      originCellIndex: 7,
      mutationClass: "target-site",
    });

    const forged: ChildLineageMaterializationResult = {
      ...oneChildMaterialization(initial),
      children: [
        {
          ...oneChildMaterialization(initial).children[0]!,
          lineageId: child.lineageId,
        },
      ],
      lineageCheckpoint: registry.checkpoint(),
    };

    expect(() =>
      appendMaterializedMutationLineagesToAuthority(
        initial,
        FOUNDERS,
        policy(),
        forged,
      ),
    ).toThrow(/checkpoint event count|preserve prior registry history/);
  });

  it("binds exact founder taxon authority and inherits it atomically to mutation children", () => {
    const initial = initializeDynamicLineageAuthority(
      TAXON_FOUNDERS,
      TAXON_REGISTRY,
    );
    expect(initial.lineageTaxonMap).toMatchObject({
      lineageIds: ["L1"],
      taxonIds: ["fixture-bacterium"],
      taxonContentVersions: ["1.0.0"],
    });

    const next = appendMaterializedMutationLineagesToAuthority(
      initial,
      TAXON_FOUNDERS,
      policy(),
      oneChildMaterialization(initial),
      TAXON_REGISTRY,
    );
    expect(next.lineageTaxonMap).toMatchObject({
      lineageIds: ["L1", "L2"],
      taxonIds: ["fixture-bacterium", "fixture-bacterium"],
      taxonContentVersions: ["1.0.0", "1.0.0"],
    });
    expect(() =>
      validateDynamicLineageAuthorityState(
        next,
        TAXON_FOUNDERS,
        policy(),
        TAXON_REGISTRY,
      ),
    ).not.toThrow();

    const staleFounders = [
      { ...TAXON_FOUNDERS[0]!, taxonContentVersion: "2.0.0" },
    ];
    expect(() =>
      initializeDynamicLineageAuthority(staleFounders, TAXON_REGISTRY),
    ).toThrow(/content version does not match authoritative registry/);
  });

  it("rejects extra runtime roots and persisted hazard drift", () => {
    const initial = initializeDynamicLineageAuthority(FOUNDERS);
    const registry = LineageRegistry.restore(initial.lineageRegistry);
    const extraRoot = registry.create({
      parentLineageId: null,
      genotypeId: "MUT",
      createdAtHours: 0.25,
      originCellIndex: null,
      mutationClass: null,
    });
    const badRoot: DynamicLineageAuthorityState = {
      lineageIds: [...initial.lineageIds, extraRoot.lineageId],
      genotypeIds: [...initial.genotypeIds, extraRoot.genotypeId],
      baselineDeathHazardPerHour: [0, 0.2],
      lineageRegistry: registry.checkpoint(),
    };

    expect(() =>
      validateDynamicLineageAuthorityState(badRoot, FOUNDERS, policy()),
    ).toThrow(/runtime-created lineage must have a parent/);

    const valid = appendMaterializedMutationLineagesToAuthority(
      initial,
      FOUNDERS,
      policy(),
      oneChildMaterialization(initial),
    );
    const drifted: DynamicLineageAuthorityState = {
      ...valid,
      baselineDeathHazardPerHour: [0, 0.3],
    };
    expect(() =>
      validateDynamicLineageAuthorityState(drifted, FOUNDERS, policy()),
    ).toThrow(/baseline loss does not match policy authority/);
  });
});
