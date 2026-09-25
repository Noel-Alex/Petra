import { describe, expect, it } from "vitest";
import {
  BASELINE_NON_DRUG_LOSS_POLICY_SCHEMA_VERSION,
  EXPLICIT_GENOTYPE_BASELINE_LOSS_RULE,
  type BaselineNonDrugLossPolicy,
} from "./baselineLossPolicy";
import { LineageRegistry } from "./lineage";
import { appendRuntimeLineageOriginV2 } from "./lineageOriginCheckpoint";
import {
  appendExternalInoculationRuntimeLineageEcologyBaseline,
  appendMutationChildRuntimeLineageEcologyBaseline,
  migrateLegacyRuntimeLineageEcologyBaselineAuthority,
  RUNTIME_LINEAGE_ECOLOGY_BASELINE_AUTHORITY_VERSION,
  validateRuntimeLineageEcologyBaselineAuthority,
  type RuntimeLineageEcologySourceDefinition,
} from "./runtimeLineageEcologyBaseline";
import {
  EXTERNAL_INOCULATION_ADMISSION_SCHEMA_VERSION,
  type ExternalInoculationAdmission,
} from "../externalInoculationAdmission";
import { COMPOSED_PARAMETER_SET_BINDING_SCHEMA_VERSION } from "../parameterSetBinding";
import { AUTHORITATIVE_TAXON_IDENTITY_SCHEMA_VERSION } from "../taxonIdentity";

const CONFIGURED: readonly RuntimeLineageEcologySourceDefinition[] = [
  {
    lineageDefinitionId: "source-wt",
    genotypeId: "WT",
    baselineGrowthRateScale: 0.75,
    deathHazardPerHour: 0.01,
  },
];

function lossPolicy(): BaselineNonDrugLossPolicy {
  return {
    schemaVersion: BASELINE_NON_DRUG_LOSS_POLICY_SCHEMA_VERSION,
    id: "fixture-runtime-lineage-loss",
    rule: EXPLICIT_GENOTYPE_BASELINE_LOSS_RULE,
    entries: [
      {
        genotypeId: "WT",
        deathHazardPerHour: 0.01,
        provenance: {
          classification: "engineering",
          sourceKeys: [],
          context: "Fixture founder/external baseline.",
          limitation: "Test-only value.",
        },
      },
      {
        genotypeId: "MUT",
        deathHazardPerHour: 0.02,
        provenance: {
          classification: "engineering",
          sourceKeys: [],
          context: "Fixture mutation-child baseline.",
          limitation: "Test-only value.",
        },
      },
    ],
  };
}

function founderRegistry(): LineageRegistry {
  const registry = new LineageRegistry();
  registry.create({
    parentLineageId: null,
    genotypeId: "WT",
    createdAtHours: 0,
    originCellIndex: null,
    mutationClass: null,
  });
  return registry;
}

function externalAdmission(
  overrides: Partial<
    ExternalInoculationAdmission["lineageDefinition"]
  > = {},
): ExternalInoculationAdmission {
  return {
    schemaVersion: EXTERNAL_INOCULATION_ADMISSION_SCHEMA_VERSION,
    scenarioId: "fixture-scenario",
    scenarioVersion: "1",
    parameterSetBinding: {
      schemaVersion: COMPOSED_PARAMETER_SET_BINDING_SCHEMA_VERSION,
      authority: "provenance",
      parameterSetId: "fixture-parameter-set",
      parameterSetVersion: "1",
      configurationFingerprint: "fixture-configuration",
    },
    lineageDefinition: {
      id: "source-wt",
      genotypeId: "WT",
      taxonId: "fixture-bacterium",
      taxonContentVersion: "1.0.0",
      baselineGrowthRateScale: 0.75,
      deathHazardPerHour: 0.01,
      ...overrides,
    },
    taxon: {
      schemaVersion: AUTHORITATIVE_TAXON_IDENTITY_SCHEMA_VERSION,
      id: "fixture-bacterium",
      contentVersion: "1.0.0",
      scientificName: "Fixture bacterium",
      background: "test strain",
      microbialGroup: "bacterium",
      provenance: {
        sourceKeys: ["fixture:taxon"],
        context: "Test-only taxon.",
        limitation: "Not a scientific Petra content pack.",
      },
    },
  };
}

describe("runtime lineage ecology baseline authority", () => {
  it("migrates configured founders and mutation children without ancestry inference", () => {
    const registry = founderRegistry();
    registry.create({
      parentLineageId: "L1",
      genotypeId: "MUT",
      createdAtHours: 1,
      originCellIndex: 7,
      mutationClass: "target-site",
    });

    const migrated = migrateLegacyRuntimeLineageEcologyBaselineAuthority({
      lineageRegistry: registry.checkpoint(),
      configuredLineages: CONFIGURED,
      dynamicLossPolicy: lossPolicy(),
    });

    expect(migrated.ecologyBaselines.version).toBe(
      RUNTIME_LINEAGE_ECOLOGY_BASELINE_AUTHORITY_VERSION,
    );
    expect(migrated.ecologyBaselines.entries).toEqual([
      {
        lineageId: "L1",
        originKind: "configured-founder",
        sourceLineageDefinitionId: "source-wt",
        baselineGrowthRateScale: 0.75,
        baselineDeathHazardPerHour: 0.01,
      },
      {
        lineageId: "L2",
        originKind: "mutation-child",
        sourceLineageDefinitionId: "source-wt",
        baselineGrowthRateScale: 0.75,
        baselineDeathHazardPerHour: 0.02,
      },
    ]);
  });

  it("persists exact admitted ecology authority for an external root and its mutation child", () => {
    const migrated = migrateLegacyRuntimeLineageEcologyBaselineAuthority({
      lineageRegistry: founderRegistry().checkpoint(),
      configuredLineages: CONFIGURED,
      dynamicLossPolicy: lossPolicy(),
    });

    const externalOrigin = appendRuntimeLineageOriginV2(
      migrated.lineageOrigins,
      {
        originKind: "external-inoculation",
        parentLineageId: null,
        genotypeId: "WT",
        createdAtHours: 1,
        originCellIndex: 9,
        mutationClass: null,
      },
    );
    const withExternal =
      appendExternalInoculationRuntimeLineageEcologyBaseline({
        current: migrated.ecologyBaselines,
        currentLineageOrigins: migrated.lineageOrigins,
        nextLineageOrigins: externalOrigin.checkpoint,
        configuredLineages: CONFIGURED,
        dynamicLossPolicy: lossPolicy(),
        admission: externalAdmission(),
      });

    expect(withExternal.entries[1]).toEqual({
      lineageId: "L2",
      originKind: "external-inoculation",
      sourceLineageDefinitionId: "source-wt",
      baselineGrowthRateScale: 0.75,
      baselineDeathHazardPerHour: 0.01,
    });

    const childOrigin = appendRuntimeLineageOriginV2(
      externalOrigin.checkpoint,
      {
        originKind: "mutation-child",
        parentLineageId: "L2",
        genotypeId: "MUT",
        createdAtHours: 1.5,
        originCellIndex: 10,
        mutationClass: "target-site",
      },
    );
    const withChild = appendMutationChildRuntimeLineageEcologyBaseline({
      current: withExternal,
      currentLineageOrigins: externalOrigin.checkpoint,
      nextLineageOrigins: childOrigin.checkpoint,
      configuredLineages: CONFIGURED,
      dynamicLossPolicy: lossPolicy(),
    });

    expect(withChild.entries[2]).toEqual({
      lineageId: "L3",
      originKind: "mutation-child",
      sourceLineageDefinitionId: "source-wt",
      baselineGrowthRateScale: 0.75,
      baselineDeathHazardPerHour: 0.02,
    });
    expect(() =>
      validateRuntimeLineageEcologyBaselineAuthority({
        authority: withChild,
        lineageOrigins: childOrigin.checkpoint,
        configuredLineages: CONFIGURED,
        dynamicLossPolicy: lossPolicy(),
      }),
    ).not.toThrow();
  });

  it("refuses external admission drift instead of inferring or defaulting biology", () => {
    const migrated = migrateLegacyRuntimeLineageEcologyBaselineAuthority({
      lineageRegistry: founderRegistry().checkpoint(),
      configuredLineages: CONFIGURED,
      dynamicLossPolicy: lossPolicy(),
    });
    const externalOrigin = appendRuntimeLineageOriginV2(
      migrated.lineageOrigins,
      {
        originKind: "external-inoculation",
        parentLineageId: null,
        genotypeId: "WT",
        createdAtHours: 1,
        originCellIndex: 9,
        mutationClass: null,
      },
    );

    expect(() =>
      appendExternalInoculationRuntimeLineageEcologyBaseline({
        current: migrated.ecologyBaselines,
        currentLineageOrigins: migrated.lineageOrigins,
        nextLineageOrigins: externalOrigin.checkpoint,
        configuredLineages: CONFIGURED,
        dynamicLossPolicy: lossPolicy(),
        admission: externalAdmission({ baselineGrowthRateScale: 0.8 }),
      }),
    ).toThrow(/drift from configured source authority/);

    expect(() =>
      appendExternalInoculationRuntimeLineageEcologyBaseline({
        current: migrated.ecologyBaselines,
        currentLineageOrigins: migrated.lineageOrigins,
        nextLineageOrigins: externalOrigin.checkpoint,
        configuredLineages: CONFIGURED,
        dynamicLossPolicy: lossPolicy(),
        admission: externalAdmission({ id: "unknown-source" }),
      }),
    ).toThrow(/source definition is not configured/);
  });

  it("refuses ambiguous legacy parentless runtime roots", () => {
    const registry = founderRegistry();
    registry.create({
      parentLineageId: null,
      genotypeId: "WT",
      createdAtHours: 1,
      originCellIndex: 12,
      mutationClass: null,
    });

    expect(() =>
      migrateLegacyRuntimeLineageEcologyBaselineAuthority({
        lineageRegistry: registry.checkpoint(),
        configuredLineages: CONFIGURED,
        dynamicLossPolicy: lossPolicy(),
      }),
    ).toThrow(/explicit origin authority is required/);
  });

  it("fails closed on persisted lineage-order or growth-authority drift", () => {
    const migrated = migrateLegacyRuntimeLineageEcologyBaselineAuthority({
      lineageRegistry: founderRegistry().checkpoint(),
      configuredLineages: CONFIGURED,
      dynamicLossPolicy: lossPolicy(),
    });

    expect(() =>
      validateRuntimeLineageEcologyBaselineAuthority({
        authority: {
          ...migrated.ecologyBaselines,
          entries: [
            {
              ...migrated.ecologyBaselines.entries[0]!,
              baselineGrowthRateScale: 0.8,
            },
          ],
        },
        lineageOrigins: migrated.lineageOrigins,
        configuredLineages: CONFIGURED,
        dynamicLossPolicy: lossPolicy(),
      }),
    ).toThrow(/configured source definition/);
  });
});
