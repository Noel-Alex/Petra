import { describe, expect, it } from "vitest";

import rawFlagshipScenario from "../../data/presets/ecoli_ciprofloxacin_v1.json";
import {
  SUPPORTED_CONTENT_MATRIX,
  type SupportedContentMatrix,
} from "../contentSupportMatrix";
import {
  buildProductContentDiscovery,
  listProductContentDiscovery,
} from "./contentDiscovery";
import { listBundledScenarioDiscovery } from "./scenarioDiscovery";

describe("product content discovery", () => {
  it("projects the enabled flagship from exact support + scenario authority", () => {
    const catalog = listProductContentDiscovery();

    expect(catalog.matrixVersion).toBe(SUPPORTED_CONTENT_MATRIX.version);
    expect(catalog.scenarios).toHaveLength(1);

    const flagship = catalog.scenarios[0]!;
    expect(flagship).toMatchObject({
      kind: "scenario",
      supportId: "flagship-ecoli-ciprofloxacin",
      scenarioId: rawFlagshipScenario.id,
      scenarioVersion: rawFlagshipScenario.version,
      title: rawFlagshipScenario.title,
      availability: "enabled-research",
      scienceModeStatus: "not-admitted",
    });
    expect(flagship.scienceMode.admitted).toBe(false);
    expect(flagship.organisms).toEqual([
      {
        scientificName: "Escherichia coli",
        background: "K-12 MG1655 for curated resistance phenotypes",
        microbialGroup: "bacterium",
        presentationIdentityId:
          "ecoli-k12-mg1655-representative-morphology-v1",
      },
    ]);
    expect(flagship.environment).toMatchObject({
      resourceBindingStatus: "unbound",
      resourceRepresentation: "dimensionless_model_resource",
      medium: null,
    });
    expect(flagship.interventions).toEqual([
      {
        id: "ciprofloxacin",
        kind: "antibiotic",
        protocolCommand: "apply-ciprofloxacin",
        concentrationUnit: "mg/L",
        supportedGeometries: ["global", "radial", "stripe", "paint"],
      },
    ]);
    expect(flagship.limitations.length).toBeGreaterThan(0);

    // Product-library support is deliberately not executable-runtime
    // registration authority.
    expect(flagship).not.toHaveProperty("runtimeId");
  });

  it("mirrors future content blockers from the support matrix without inventing biology", () => {
    const catalog = listProductContentDiscovery();

    expect(
      catalog.expansionQueue.map((entry) => ({
        id: entry.supportId,
        kind: entry.queueKind,
        availability: entry.availability,
        issues: entry.issues,
        reason: entry.reason,
      })),
    ).toEqual(
      SUPPORTED_CONTENT_MATRIX.expansionQueue.map((entry) => ({
        id: entry.id,
        kind: entry.kind,
        availability: entry.availability,
        issues: entry.issues,
        reason: entry.reason,
      })),
    );

    for (const entry of catalog.expansionQueue) {
      expect(entry.reason.length).toBeGreaterThan(0);
      expect(entry.issues.length).toBeGreaterThan(0);
      expect(entry).not.toHaveProperty("organisms");
      expect(entry).not.toHaveProperty("interventions");
      expect(entry).not.toHaveProperty("runtimeId");
    }
  });

  it("fails closed if an enabled support row has no exact bundled scenario", () => {
    expect(() =>
      buildProductContentDiscovery({
        matrix: SUPPORTED_CONTENT_MATRIX,
        bundledScenarios: [],
      }),
    ).toThrow(/no exact bundled scenario discovery entry/i);
  });

  it("fails closed on duplicate bundled discovery identity", () => {
    const bundled = listBundledScenarioDiscovery();
    expect(bundled).toHaveLength(1);

    expect(() =>
      buildProductContentDiscovery({
        matrix: SUPPORTED_CONTENT_MATRIX,
        bundledScenarios: [bundled[0]!, bundled[0]!],
      }),
    ).toThrow(/duplicate bundled product discovery identity/i);
  });

  it("refuses support/admission drift rather than upgrading a card", () => {
    const supported = SUPPORTED_CONTENT_MATRIX.supportedScenarios[0]!;
    const drifted: SupportedContentMatrix = {
      ...SUPPORTED_CONTENT_MATRIX,
      supportedScenarios: [
        {
          ...supported,
          scienceModeStatus: "admitted",
        },
      ],
    };

    expect(() =>
      buildProductContentDiscovery({
        matrix: drifted,
        bundledScenarios: listBundledScenarioDiscovery(),
      }),
    ).toThrow(/Science-Mode status disagrees/i);
  });

  it("returns detached frozen presentation records", () => {
    const catalog = listProductContentDiscovery();
    const flagship = catalog.scenarios[0]!;
    const queued = catalog.expansionQueue[0]!;

    expect(Object.isFrozen(catalog)).toBe(true);
    expect(Object.isFrozen(catalog.scenarios)).toBe(true);
    expect(Object.isFrozen(flagship)).toBe(true);
    expect(Object.isFrozen(flagship.organisms)).toBe(true);
    expect(Object.isFrozen(flagship.interventions[0]!.supportedGeometries)).toBe(
      true,
    );
    expect(Object.isFrozen(flagship.scienceMode.reasons)).toBe(true);
    expect(Object.isFrozen(queued.issues)).toBe(true);
  });
});
