import { describe, expect, it } from "vitest";

import flagshipPresentation from "../../data/presentation/ecoli_k12_mg1655_render_identity_v1.json";
import {
  organismPresentationIdentityKey,
  parseOrganismPresentationIdentity,
} from "./organismPresentationIdentity";

describe("organism presentation identity", () => {
  it("parses the bundled E. coli representative morphology as transferred presentation evidence", () => {
    const identity = parseOrganismPresentationIdentity(flagshipPresentation);

    expect(identity).toMatchObject({
      schemaVersion: 1,
      id: "ecoli-k12-mg1655-representative-morphology",
      version: "1.0.0",
      scientificName: "Escherichia coli",
      background: "K-12 MG1655",
      organismKind: "bacterium",
      morphology: "rod",
      scope: "representative-cell",
      provenance: {
        classification: "transferred",
        sourceKey: "nanninga_1998_ecoli_morphogenesis",
        doi: "10.1128/MMBR.62.1.110-129.1998",
      },
    });
    expect(identity.provenance.transferNote).toMatch(/presentation evidence/i);
    expect(identity.provenance.limitation).toMatch(/literal cell counts/i);
    expect(organismPresentationIdentityKey(identity)).toBe(
      "ecoli-k12-mg1655-representative-morphology@1.0.0",
    );
    expect(Object.isFrozen(identity)).toBe(true);
    expect(Object.isFrozen(identity.provenance)).toBe(true);
  });

  it("fails closed instead of inferring unsupported organism kinds or morphologies", () => {
    expect(() =>
      parseOrganismPresentationIdentity({
        ...flagshipPresentation,
        organismKind: "fungus",
      }),
    ).toThrow(/organismKind is unsupported/);

    expect(() =>
      parseOrganismPresentationIdentity({
        ...flagshipPresentation,
        morphology: "coccus",
      }),
    ).toThrow(/morphology is unsupported/);
  });

  it("requires explicit transferred provenance, source DOI, transfer note, and limitation", () => {
    expect(() =>
      parseOrganismPresentationIdentity({
        ...flagshipPresentation,
        provenance: {
          ...flagshipPresentation.provenance,
          classification: "measured",
        },
      }),
    ).toThrow(/classification must be transferred/);

    expect(() =>
      parseOrganismPresentationIdentity({
        ...flagshipPresentation,
        provenance: {
          ...flagshipPresentation.provenance,
          doi: "not-a-doi",
        },
      }),
    ).toThrow(/must be a canonical DOI/);

    const { transferNote: _transferNote, ...withoutTransfer } =
      flagshipPresentation.provenance;
    expect(() =>
      parseOrganismPresentationIdentity({
        ...flagshipPresentation,
        provenance: withoutTransfer,
      }),
    ).toThrow(/transferNote must be a non-empty string/);

    const { limitation: _limitation, ...withoutLimitation } =
      flagshipPresentation.provenance;
    expect(() =>
      parseOrganismPresentationIdentity({
        ...flagshipPresentation,
        provenance: withoutLimitation,
      }),
    ).toThrow(/limitation must be a non-empty string/);
  });

  it("rejects physical geometry or other future semantics instead of silently erasing them", () => {
    expect(() =>
      parseOrganismPresentationIdentity({
        ...flagshipPresentation,
        cellLengthMicrometers: 2,
      }),
    ).toThrow(/unsupported field: cellLengthMicrometers/);

    expect(() =>
      parseOrganismPresentationIdentity({
        ...flagshipPresentation,
        provenance: {
          ...flagshipPresentation.provenance,
          confidenceScore: 0.9,
        },
      }),
    ).toThrow(/unsupported field: confidenceScore/);
  });

  it("rejects malformed schema and non-canonical identity text", () => {
    expect(() =>
      parseOrganismPresentationIdentity({
        ...flagshipPresentation,
        schemaVersion: 2,
      }),
    ).toThrow(/unsupported organism presentation identity schema version/);

    expect(() =>
      parseOrganismPresentationIdentity({
        ...flagshipPresentation,
        background: " K-12 MG1655 ",
      }),
    ).toThrow(/must be trimmed/);
  });
});
