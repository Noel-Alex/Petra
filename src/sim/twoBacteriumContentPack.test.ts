import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  biologicalContentPackManifestIdentity,
  parseBiologicalContentPackManifest,
} from "./contentPackManifest";

function loadJson(relativeUrl: string): unknown {
  return JSON.parse(
    readFileSync(new URL(relativeUrl, import.meta.url), "utf8"),
  ) as unknown;
}

describe("two-bacterium inert content pack", () => {
  it("binds only exact versioned authority already owned by the named scenario", () => {
    const rawManifest = loadJson(
      "../../data/content_packs/ecoli_bsubtilis_shared_resource_v1.json",
    );
    const scenario = loadJson(
      "../../data/presets/ecoli_bsubtilis_shared_resource_v1.json",
    ) as Record<string, any>;
    const manifest = parseBiologicalContentPackManifest(rawManifest);

    expect({
      id: manifest.id,
      version: manifest.version,
      maturity: manifest.maturity,
    }).toEqual({
      id: "ecoli-bsubtilis-shared-resource-pack",
      version: "1.0.0",
      maturity: "experimental",
    });

    expect(manifest.references.organisms).toEqual(
      scenario.taxa.map((taxon: Record<string, unknown>) => ({
        id: taxon.id,
        version: taxon.contentVersion,
      })),
    );
    expect(manifest.references.scenarios).toEqual([
      { id: scenario.id, version: scenario.version },
    ]);
    expect(manifest.references.mechanisms).toEqual([
      {
        id: scenario.executionProfile.id,
        version: scenario.executionProfile.version,
      },
      {
        id: scenario.composedParameterSet.id,
        version: scenario.composedParameterSet.version,
      },
    ]);

    expect(manifest.references.antimicrobials).toEqual([]);
    expect(manifest.references.genotypeGraphs).toEqual([]);
    expect(manifest.references.environments).toEqual([]);
    expect(manifest.references.phageHostPairs).toEqual([]);
    expect(manifest.references.presentationRecords).toEqual([]);
  });

  it("keeps its citation keys traceable to the exact source locators in the scenario", () => {
    const manifest = parseBiologicalContentPackManifest(
      loadJson("../../data/content_packs/ecoli_bsubtilis_shared_resource_v1.json"),
    );
    const scenario = loadJson(
      "../../data/presets/ecoli_bsubtilis_shared_resource_v1.json",
    ) as Record<string, any>;

    const citationLocators = new Map<string, string>([
      ["lacroix_2015_mg1655_growth", "doi:10.1128/AEM.02246-14"],
      [
        "tannler_decasper_sauer_2008_bsubtilis_sige",
        "doi:10.1186/1475-2859-7-19",
      ],
    ]);
    expect(manifest.references.citationKeys).toEqual([
      "lacroix_2015_mg1655_growth",
      "tannler_decasper_sauer_2008_bsubtilis_sige",
    ]);

    const scenarioSourceLocators = new Set<string>([
      ...scenario.taxa.flatMap(
        (taxon: Record<string, any>) => taxon.provenance.sourceKeys,
      ),
      ...scenario.composedParameterSet.growthCalibration.targets.map(
        (target: Record<string, any>) => target.citation,
      ),
    ]);

    for (const key of manifest.references.citationKeys) {
      expect(scenarioSourceLocators.has(citationLocators.get(key)!)).toBe(true);
    }
  });

  it("keeps unsupported physical, pairwise, drug, evolution, and presentation claims explicit", () => {
    const manifest = parseBiologicalContentPackManifest(
      loadJson("../../data/content_packs/ecoli_bsubtilis_shared_resource_v1.json"),
    );
    const limitations = manifest.limitations.join("\n");

    expect(limitations).toMatch(/model-resource.*model-biomass/i);
    expect(limitations).toMatch(/not a measured co-culture/i);
    expect(limitations).toMatch(/direct antagonism.*cross-feeding/i);
    expect(limitations).toMatch(/ciprofloxacin.*evolution.*sporulation/i);
    expect(limitations).toMatch(/presentation-record.*no independent record version/i);
    expect(limitations).toMatch(/does not make.*product-selectable/i);

    const identity = JSON.parse(
      biologicalContentPackManifestIdentity(manifest),
    ) as Record<string, any>;
    expect(identity.id).toBe("ecoli-bsubtilis-shared-resource-pack");
    expect(identity.references.scenarios).toEqual([
      {
        id: "ecoli-bsubtilis-shared-resource",
        version: "1.0.0-experimental",
      },
    ]);
  });
});
