import { describe, expect, it } from "vitest";

import {
  FLAGSHIP_ECOLI_ORGANISM_PRESENTATION,
  ASPERGILLUS_NO10_ORGANISM_PRESENTATION,
} from "../organismPresentationIdentity";
import type { RenderLineage } from "../model";
import {
  indexLineageGlyphPresentations,
  lineageGlyphPresentationContractEqual,
  organismPresentationIdentityEqual,
} from "./lineagePresentation";

function lineage(
  id: string,
  organismPresentation?: RenderLineage["organismPresentation"],
): RenderLineage {
  return {
    id,
    label: id,
    appearanceToken: "lineage-cyan",
    patternToken: "solid-ring",
    ...(organismPresentation === undefined
      ? {}
      : { organismPresentation }),
    density: new Float32Array([1]),
  };
}

describe("lineage-local representative glyph presentation", () => {
  it("preserves the legacy run-wide presentation only when every lineage omits the carrier", () => {
    const indexed = indexLineageGlyphPresentations(
      [lineage("L1"), lineage("L2")],
      FLAGSHIP_ECOLI_ORGANISM_PRESENTATION,
    );

    expect(indexed.perLineageMode).toBe(false);
    expect(indexed.hasAnyPresentation).toBe(true);
    expect(indexed.hasAnySupportedDishGlyphPresentation).toBe(true);
    expect(indexed.byLineageId.get("L1")?.presentation).toBe(
      FLAGSHIP_ECOLI_ORGANISM_PRESENTATION,
    );
    expect(indexed.byLineageId.get("L2")?.presentation).toBe(
      FLAGSHIP_ECOLI_ORGANISM_PRESENTATION,
    );
  });

  it("resolves each lineage independently once per-lineage mode is active", () => {
    const indexed = indexLineageGlyphPresentations(
      [
        lineage("L1", FLAGSHIP_ECOLI_ORGANISM_PRESENTATION),
        lineage("L2", ASPERGILLUS_NO10_ORGANISM_PRESENTATION),
      ],
      FLAGSHIP_ECOLI_ORGANISM_PRESENTATION,
    );

    expect(indexed.perLineageMode).toBe(true);
    expect(indexed.byLineageId.get("L1")?.presentation?.morphology).toBe("rod");
    expect(indexed.byLineageId.get("L2")?.presentation?.morphology).toBe(
      "filamentous-hyphal",
    );
  });

  it("keeps explicit null or omitted peers neutral instead of leaking the legacy global record", () => {
    const explicitNull = indexLineageGlyphPresentations(
      [
        lineage("L1", FLAGSHIP_ECOLI_ORGANISM_PRESENTATION),
        lineage("L2", null),
      ],
      FLAGSHIP_ECOLI_ORGANISM_PRESENTATION,
    );
    expect(explicitNull.byLineageId.get("L2")?.presentation).toBeNull();

    const omittedPeer = indexLineageGlyphPresentations(
      [
        lineage("L1", FLAGSHIP_ECOLI_ORGANISM_PRESENTATION),
        lineage("L2"),
      ],
      FLAGSHIP_ECOLI_ORGANISM_PRESENTATION,
    );
    expect(omittedPeer.perLineageMode).toBe(true);
    expect(omittedPeer.byLineageId.get("L2")?.presentation).toBeNull();
  });

  it("distinguishes omitted legacy mode from explicit neutral per-lineage mode", () => {
    expect(
      lineageGlyphPresentationContractEqual(
        [lineage("L1")],
        [lineage("L1", null)],
      ),
    ).toBe(false);
  });

  it("compares validated presentation metadata semantically instead of by object identity", () => {
    const clone = structuredClone(FLAGSHIP_ECOLI_ORGANISM_PRESENTATION);
    expect(
      organismPresentationIdentityEqual(
        FLAGSHIP_ECOLI_ORGANISM_PRESENTATION,
        clone,
      ),
    ).toBe(true);
    expect(
      lineageGlyphPresentationContractEqual(
        [lineage("L1", FLAGSHIP_ECOLI_ORGANISM_PRESENTATION)],
        [lineage("L1", clone)],
      ),
    ).toBe(true);

    const changed = {
      ...clone,
      id: clone.id + "-changed",
    };
    expect(
      organismPresentationIdentityEqual(
        FLAGSHIP_ECOLI_ORGANISM_PRESENTATION,
        changed,
      ),
    ).toBe(false);
  });

  it("does not treat unsupported hyphal evidence as authorization for the current rod overview glyph", () => {
    const indexed = indexLineageGlyphPresentations(
      [lineage("L1", ASPERGILLUS_NO10_ORGANISM_PRESENTATION)],
      null,
    );

    expect(indexed.hasAnyPresentation).toBe(true);
    expect(indexed.hasAnySupportedDishGlyphPresentation).toBe(false);
  });

  it("does not enable dish-level morphology merely because a legacy record exists in per-lineage neutral mode", () => {
    const indexed = indexLineageGlyphPresentations(
      [lineage("L1", null), lineage("L2", null)],
      FLAGSHIP_ECOLI_ORGANISM_PRESENTATION,
    );

    expect(indexed.perLineageMode).toBe(true);
    expect(indexed.hasAnyPresentation).toBe(false);
    expect(indexed.hasAnySupportedDishGlyphPresentation).toBe(false);
  });
});
