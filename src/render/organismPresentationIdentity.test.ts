import { describe, expect, it } from "vitest";

import rawFlagshipIdentity from "../../data/presentation/ecoli_k12_mg1655_v1.json";
import {
  FLAGSHIP_ECOLI_ORGANISM_PRESENTATION,
  parseOrganismPresentationIdentity,
} from "./organismPresentationIdentity";

function cloneRecord(): Record<string, unknown> {
  return structuredClone(rawFlagshipIdentity) as Record<string, unknown>;
}

describe("organism presentation identity", () => {
  it("promotes the bundled flagship record as presentation-only bacterium + rod evidence", () => {
    const identity = FLAGSHIP_ECOLI_ORGANISM_PRESENTATION;

    expect(identity).toMatchObject({
      kind: "petra-organism-presentation-identity",
      schemaVersion: 1,
      scientificName: "Escherichia coli",
      background: "K-12 MG1655 for curated resistance phenotypes",
      organismKind: "bacterium",
      morphology: "rod",
      provenance: {
        classification: "transferred",
      },
    });
    expect(identity.provenance.sources.map((source) => source.doi)).toEqual([
      "10.1128/MMBR.62.1.110-129.1998",
      "10.12688/f1000research.12663.1",
    ]);
    expect(identity.provenance.limitation).toMatch(/does not authorize physical cell/i);
    expect(Object.isFrozen(identity)).toBe(true);
    expect(Object.isFrozen(identity.provenance)).toBe(true);
    expect(Object.isFrozen(identity.provenance.sources)).toBe(true);
    expect(identity.provenance.sources.every(Object.isFrozen)).toBe(true);
  });

  it("rejects unsupported morphology and organism-kind claims instead of inferring them", () => {
    const wrongMorphology = cloneRecord();
    wrongMorphology.morphology = "hyphal";
    expect(() => parseOrganismPresentationIdentity(wrongMorphology)).toThrow(
      /unsupported organism presentation morphology/,
    );

    const wrongKind = cloneRecord();
    wrongKind.organismKind = "fungus";
    expect(() => parseOrganismPresentationIdentity(wrongKind)).toThrow(
      /unsupported organism presentation kind/,
    );
  });

  it("requires exact provenance shape, source identity and limitations", () => {
    const extraField = cloneRecord();
    extraField.hiddenCellLengthMicrometers = 2;
    expect(() => parseOrganismPresentationIdentity(extraField)).toThrow(
      /unexpected shape/,
    );

    const missingLimitation = cloneRecord();
    const provenance = missingLimitation.provenance as Record<string, unknown>;
    delete provenance.limitation;
    expect(() => parseOrganismPresentationIdentity(missingLimitation)).toThrow(
      /unexpected shape/,
    );

    const duplicateSource = cloneRecord();
    const duplicateProvenance =
      duplicateSource.provenance as Record<string, unknown>;
    const sources = duplicateProvenance.sources as Array<Record<string, unknown>>;
    sources[1]!.key = sources[0]!.key;
    expect(() => parseOrganismPresentationIdentity(duplicateSource)).toThrow(
      /source keys must be unique/,
    );
  });

  it("rejects sparse source arrays at the parser boundary", () => {
    const sparse = cloneRecord();
    const provenance = sparse.provenance as Record<string, unknown>;
    const sources = provenance.sources as Array<Record<string, unknown>>;
    delete sources[0];
    expect(() => parseOrganismPresentationIdentity(sparse)).toThrow(
      /sources must be dense/,
    );
  });

  it("requires canonical source DOIs and canonical strings", () => {
    const badDoi = cloneRecord();
    const provenance = badDoi.provenance as Record<string, unknown>;
    const sources = provenance.sources as Array<Record<string, unknown>>;
    sources[0]!.doi = "Nanninga 1998";
    expect(() => parseOrganismPresentationIdentity(badDoi)).toThrow(
      /canonical DOI/,
    );

    const paddedName = cloneRecord();
    paddedName.scientificName = " Escherichia coli";
    expect(() => parseOrganismPresentationIdentity(paddedName)).toThrow(
      /canonical non-empty string/,
    );
  });
});
