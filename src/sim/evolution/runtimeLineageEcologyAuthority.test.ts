import { describe, expect, it } from "vitest";
import type { AdmittedExternalInoculationLineageDefinition } from "../externalInoculationAdmission";
import {
  BASELINE_NON_DRUG_LOSS_POLICY_SCHEMA_VERSION,
  EXPLICIT_GENOTYPE_BASELINE_LOSS_RULE,
  type BaselineNonDrugLossPolicy,
} from "./baselineLossPolicy";
import { LineageRegistry } from "./lineage";
import {
  appendRuntimeLineageOriginV2,
  migrateLineageRegistryCheckpointV1ToOriginV2,
} from "./lineageOriginCheckpoint";
import {
  appendExternalInoculationRuntimeLineageEcologyAuthorityV1,
  appendMutationChildRuntimeLineageEcologyAuthorityV1,
  migrateLegacyRuntimeLineageEcologyAuthorityV1,
  validateRuntimeLineageEcologyAuthorityV1,
  type ConfiguredLineageEcologyDefinition,
} from "./runtimeLineageEcologyAuthority";

const DEFINITIONS: readonly ConfiguredLineageEcologyDefinition[] = [
  {
    id: "ecoli-founder",
    genotypeId: "WT",
    deathHazardPerHour: 0,
  },
  {
    id: "bacillus-founder",
    genotypeId: "BS168",
    baselineGrowthRateScale: 0.8,
    deathHazardPerHour: 0.05,
  },
];

function lossPolicy(): BaselineNonDrugLossPolicy {
  return {
    schemaVersion: BASELINE_NON_DRUG_LOSS_POLICY_SCHEMA_VERSION,
    id: "fixture-lineage-loss-v1",
    rule: EXPLICIT_GENOTYPE_BASELINE_LOSS_RULE,
    entries: [
      {
        genotypeId: "BS168-mut",
        deathHazardPerHour: 0.2,
        provenance: {
          classification: "engineering",
          sourceKeys: [],
          context: "Fixture mutation-child loss authority.",
          limitation: "Test only.",
        },
      },
    ],
  };
}

function founderOriginCheckpoint() {
  const registry = new LineageRegistry();
  registry.create({
    parentLineageId: null,
    genotypeId: "WT",
    createdAtHours: 0,
    originCellIndex: null,
    mutationClass: null,
  });
  registry.create({
    parentLineageId: null,
    genotypeId: "BS168",
    createdAtHours: 0,
    originCellIndex: null,
    mutationClass: null,
  });
  return migrateLineageRegistryCheckpointV1ToOriginV2({
    checkpoint: registry.checkpoint(),
    configuredFounderCount: 2,
  });
}

function admittedBacillus(
  overrides: Partial<AdmittedExternalInoculationLineageDefinition> = {},
): AdmittedExternalInoculationLineageDefinition {
  return {
    id: "bacillus-founder",
    genotypeId: "BS168",
    taxonId: "bacillus-subtilis-168-sige-minus",
    taxonContentVersion: "1.0.0",
    baselineGrowthRateScale: 0.8,
    deathHazardPerHour: 0.05,
    ...overrides,
  };
}

describe("runtime lineage ecology authority v1 target", () => {
  it("migrates configured founders while preserving omitted versus explicit growth authority", () => {
    const origins = founderOriginCheckpoint();
    const authority = migrateLegacyRuntimeLineageEcologyAuthorityV1({
      originCheckpoint: origins,
      configuredLineages: DEFINITIONS,
      legacyBaselineDeathHazardPerHour: [0, 0.05],
      dynamicLossPolicy: null,
    });

    expect(authority.records).toEqual([
      {
        lineageId: "L1",
        genotypeId: "WT",
        originKind: "configured-founder",
        sourceLineageDefinitionId: "ecoli-founder",
        declaredBaselineGrowthRateScale: null,
        baselineGrowthRateScale: 1,
        baselineDeathHazardPerHour: 0,
      },
      {
        lineageId: "L2",
        genotypeId: "BS168",
        originKind: "configured-founder",
        sourceLineageDefinitionId: "bacillus-founder",
        declaredBaselineGrowthRateScale: 0.8,
        baselineGrowthRateScale: 0.8,
        baselineDeathHazardPerHour: 0.05,
      },
    ]);
  });

  it("appends an admitted external root and lets later mutation children inherit its organism growth authority", () => {
    const founders = founderOriginCheckpoint();
    const founderAuthority = migrateLegacyRuntimeLineageEcologyAuthorityV1({
      originCheckpoint: founders,
      configuredLineages: DEFINITIONS,
      legacyBaselineDeathHazardPerHour: [0, 0.05],
      dynamicLossPolicy: null,
    });

    const externalOrigin = appendRuntimeLineageOriginV2(founders, {
      originKind: "external-inoculation",
      parentLineageId: null,
      genotypeId: "BS168",
      createdAtHours: 1,
      originCellIndex: 7,
      mutationClass: null,
    }).checkpoint;
    const withExternal =
      appendExternalInoculationRuntimeLineageEcologyAuthorityV1({
        authority: founderAuthority,
        originCheckpoint: externalOrigin,
        configuredLineages: DEFINITIONS,
        dynamicLossPolicy: null,
        admittedLineageDefinition: admittedBacillus(),
      });

    expect(withExternal.records[2]).toEqual({
      lineageId: "L3",
      genotypeId: "BS168",
      originKind: "external-inoculation",
      sourceLineageDefinitionId: "bacillus-founder",
      declaredBaselineGrowthRateScale: 0.8,
      baselineGrowthRateScale: 0.8,
      baselineDeathHazardPerHour: 0.05,
    });

    const mutationOrigin = appendRuntimeLineageOriginV2(externalOrigin, {
      originKind: "mutation-child",
      parentLineageId: "L3",
      genotypeId: "BS168-mut",
      createdAtHours: 1.25,
      originCellIndex: 7,
      mutationClass: "fixture-target",
    }).checkpoint;
    const withMutation =
      appendMutationChildRuntimeLineageEcologyAuthorityV1({
        authority: withExternal,
        originCheckpoint: mutationOrigin,
        configuredLineages: DEFINITIONS,
        dynamicLossPolicy: lossPolicy(),
      });

    expect(withMutation.records[3]).toEqual({
      lineageId: "L4",
      genotypeId: "BS168-mut",
      originKind: "mutation-child",
      sourceLineageDefinitionId: "bacillus-founder",
      declaredBaselineGrowthRateScale: 0.8,
      baselineGrowthRateScale: 0.8,
      baselineDeathHazardPerHour: 0.2,
    });
  });

  it("migrates existing mutation children from persisted loss plus exact parent growth authority", () => {
    const registry = new LineageRegistry();
    registry.create({
      parentLineageId: null,
      genotypeId: "WT",
      createdAtHours: 0,
      originCellIndex: null,
      mutationClass: null,
    });
    registry.create({
      parentLineageId: null,
      genotypeId: "BS168",
      createdAtHours: 0,
      originCellIndex: null,
      mutationClass: null,
    });
    registry.create({
      parentLineageId: "L2",
      genotypeId: "BS168-mut",
      createdAtHours: 0.5,
      originCellIndex: 4,
      mutationClass: "fixture-target",
    });
    const origins = migrateLineageRegistryCheckpointV1ToOriginV2({
      checkpoint: registry.checkpoint(),
      configuredFounderCount: 2,
    });

    const authority = migrateLegacyRuntimeLineageEcologyAuthorityV1({
      originCheckpoint: origins,
      configuredLineages: DEFINITIONS,
      legacyBaselineDeathHazardPerHour: [0, 0.05, 0.2],
      dynamicLossPolicy: lossPolicy(),
    });

    expect(authority.records[2]).toMatchObject({
      sourceLineageDefinitionId: "bacillus-founder",
      baselineGrowthRateScale: 0.8,
      baselineDeathHazardPerHour: 0.2,
    });
  });

  it("refuses external source drift instead of assigning a convenient growth scale", () => {
    const founders = founderOriginCheckpoint();
    const founderAuthority = migrateLegacyRuntimeLineageEcologyAuthorityV1({
      originCheckpoint: founders,
      configuredLineages: DEFINITIONS,
      legacyBaselineDeathHazardPerHour: [0, 0.05],
      dynamicLossPolicy: null,
    });
    const externalOrigin = appendRuntimeLineageOriginV2(founders, {
      originKind: "external-inoculation",
      parentLineageId: null,
      genotypeId: "BS168",
      createdAtHours: 1,
      originCellIndex: 7,
      mutationClass: null,
    }).checkpoint;

    expect(() =>
      appendExternalInoculationRuntimeLineageEcologyAuthorityV1({
        authority: founderAuthority,
        originCheckpoint: externalOrigin,
        configuredLineages: DEFINITIONS,
        dynamicLossPolicy: null,
        admittedLineageDefinition: admittedBacillus({
          baselineGrowthRateScale: 0.9,
        }),
      }),
    ).toThrow(/growth scale does not match configured source definition/);
  });

  it("fails closed on mutation loss-policy absence and serialized growth drift", () => {
    const founders = founderOriginCheckpoint();
    const founderAuthority = migrateLegacyRuntimeLineageEcologyAuthorityV1({
      originCheckpoint: founders,
      configuredLineages: DEFINITIONS,
      legacyBaselineDeathHazardPerHour: [0, 0.05],
      dynamicLossPolicy: null,
    });
    const mutationOrigin = appendRuntimeLineageOriginV2(founders, {
      originKind: "mutation-child",
      parentLineageId: "L2",
      genotypeId: "BS168-mut",
      createdAtHours: 0.5,
      originCellIndex: 4,
      mutationClass: "fixture-target",
    }).checkpoint;

    expect(() =>
      appendMutationChildRuntimeLineageEcologyAuthorityV1({
        authority: founderAuthority,
        originCheckpoint: mutationOrigin,
        configuredLineages: DEFINITIONS,
        dynamicLossPolicy: null,
      }),
    ).toThrow(/requires explicit baseline non-drug loss policy/);

    const valid = appendMutationChildRuntimeLineageEcologyAuthorityV1({
      authority: founderAuthority,
      originCheckpoint: mutationOrigin,
      configuredLineages: DEFINITIONS,
      dynamicLossPolicy: lossPolicy(),
    });
    const drifted = {
      ...valid,
      records: valid.records.map((record, index) =>
        index === 2 ? { ...record, baselineGrowthRateScale: 1 } : record,
      ),
    };

    expect(() =>
      validateRuntimeLineageEcologyAuthorityV1({
        authority: drifted,
        originCheckpoint: mutationOrigin,
        configuredLineages: DEFINITIONS,
        dynamicLossPolicy: lossPolicy(),
      }),
    ).toThrow(/resolved growth scale does not match source definition/);
  });

  it("preserves the existing deliberate zero-growth configured semantics", () => {
    const origins = founderOriginCheckpoint();
    const zeroGrowthDefinitions = [
      DEFINITIONS[0]!,
      {
        ...DEFINITIONS[1]!,
        baselineGrowthRateScale: 0,
      },
    ] as const;

    const authority = migrateLegacyRuntimeLineageEcologyAuthorityV1({
      originCheckpoint: origins,
      configuredLineages: zeroGrowthDefinitions,
      legacyBaselineDeathHazardPerHour: [0, 0.05],
      dynamicLossPolicy: null,
    });

    expect(authority.records[1]).toMatchObject({
      declaredBaselineGrowthRateScale: 0,
      baselineGrowthRateScale: 0,
    });
  });
});
