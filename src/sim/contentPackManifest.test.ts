import { describe, expect, it } from "vitest";

import {
  biologicalContentPackManifestIdentity,
  parseBiologicalContentPackManifest,
} from "./contentPackManifest";

function manifestFixture(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    id: "ecoli-cipro-core",
    version: "1.0.0",
    maturity: "experimental",
    limitations: [
      "Resource authority remains model-unit and must not be presented as a physical concentration.",
    ],
    references: {
      organisms: [{ id: "ecoli-k12-mg1655", version: "1.0.0" }],
      antimicrobials: [{ id: "ciprofloxacin-regoes", version: "1.0.0" }],
      genotypeGraphs: [{ id: "mg1655-cipro-evolution", version: "1.0.0" }],
      environments: [{ id: "flagship-model-resource", version: "1.0.0" }],
      phageHostPairs: [],
      scenarios: [{ id: "ecoli-ciprofloxacin-spatial", version: "1.0.0" }],
      mechanisms: [
        { id: "consumer-resource-ecology", version: "1" },
        { id: "ciprofloxacin-reference-pd", version: "1" },
      ],
      presentationRecords: [
        { id: "ecoli-k12-mg1655-organism", version: "1.0.0" },
      ],
      citationKeys: ["marcusson_2009", "regoes_2004"],
    },
  };
}

describe("biological content pack manifest", () => {
  it("parses and detaches an inert exact-reference manifest", () => {
    const input = manifestFixture();
    const parsed = parseBiologicalContentPackManifest(input);

    expect(parsed).toEqual(input);
    expect(parsed).not.toBe(input);
    expect(parsed.references).not.toBe(input.references);
    expect(parsed.references.organisms).not.toBe(
      (input.references as Record<string, unknown>).organisms,
    );
  });

  it("produces order-independent identity for manifest reference sets", () => {
    const left = manifestFixture();
    const right = manifestFixture();
    const references = right.references as Record<string, unknown>;
    references.mechanisms = [
      { id: "ciprofloxacin-reference-pd", version: "1" },
      { id: "consumer-resource-ecology", version: "1" },
    ];
    references.citationKeys = ["regoes_2004", "marcusson_2009"];

    expect(biologicalContentPackManifestIdentity(left)).toBe(
      biologicalContentPackManifestIdentity(right),
    );
  });

  it("keeps exact selected versions and maturity in manifest identity", () => {
    const baseline = manifestFixture();
    const changedVersion = manifestFixture();
    (
      (changedVersion.references as Record<string, unknown>)
        .organisms as Array<Record<string, unknown>>
    )[0]!.version = "1.0.1";
    const changedMaturity = manifestFixture();
    changedMaturity.maturity = "validated-educational";

    expect(biologicalContentPackManifestIdentity(changedVersion)).not.toBe(
      biologicalContentPackManifestIdentity(baseline),
    );
    expect(biologicalContentPackManifestIdentity(changedMaturity)).not.toBe(
      biologicalContentPackManifestIdentity(baseline),
    );
  });

  it("fails closed on code-bearing or otherwise unknown fields", () => {
    const fixture = manifestFixture();
    fixture.script = "run-some-pack-code.js";

    expect(() => parseBiologicalContentPackManifest(fixture)).toThrow(
      /unsupported field "script"/,
    );

    const nested = manifestFixture();
    (
      (nested.references as Record<string, unknown>)
        .organisms as Array<Record<string, unknown>>
    )[0]!.parameters = { growthRate: 99 };

    expect(() => parseBiologicalContentPackManifest(nested)).toThrow(
      /unsupported field "parameters"/,
    );
  });

  it("rejects canonicalization aliases, duplicate references, and duplicate citations", () => {
    const whitespaceAlias = manifestFixture();
    whitespaceAlias.id = " ecoli-cipro-core";
    expect(() => parseBiologicalContentPackManifest(whitespaceAlias)).toThrow(
      /surrounding whitespace/,
    );

    const duplicateReference = manifestFixture();
    (duplicateReference.references as Record<string, unknown>).organisms = [
      { id: "ecoli-k12-mg1655", version: "1.0.0" },
      { id: "ecoli-k12-mg1655", version: "2.0.0" },
    ];
    expect(() => parseBiologicalContentPackManifest(duplicateReference)).toThrow(
      /selects both/,
    );

    const duplicateCitation = manifestFixture();
    (duplicateCitation.references as Record<string, unknown>).citationKeys = [
      "regoes_2004",
      "regoes_2004",
    ];
    expect(() => parseBiologicalContentPackManifest(duplicateCitation)).toThrow(
      /duplicate identifier/,
    );
  });

  it("requires declared provenance locators and an explicit limitation", () => {
    const noCitations = manifestFixture();
    (noCitations.references as Record<string, unknown>).citationKeys = [];
    expect(() => parseBiologicalContentPackManifest(noCitations)).toThrow(
      /citationKeys must not be empty/,
    );

    const noLimitations = manifestFixture();
    noLimitations.limitations = [];
    expect(() => parseBiologicalContentPackManifest(noLimitations)).toThrow(
      /limitations must not be empty/,
    );
  });

  it("does not accept product/science admission metadata as manifest authority", () => {
    const fixture = manifestFixture();
    fixture.supported = true;
    expect(() => parseBiologicalContentPackManifest(fixture)).toThrow(
      /unsupported field "supported"/,
    );

    const science = manifestFixture();
    science.scienceModeAdmitted = true;
    expect(() => parseBiologicalContentPackManifest(science)).toThrow(
      /unsupported field "scienceModeAdmitted"/,
    );
  });
});
