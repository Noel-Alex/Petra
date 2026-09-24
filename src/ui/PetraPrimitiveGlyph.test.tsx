import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  PetraPrimitiveGlyph,
  type PetraPrimitiveGlyphId,
  type PetraPrimitiveGlyphState,
} from "./PetraPrimitiveGlyph";

describe("PetraPrimitiveGlyph", () => {
  it("renders shared normalized cluster geometry without claiming scientific authority", () => {
    const html = renderToStaticMarkup(
      <PetraPrimitiveGlyph
        primitive="round-colony-cluster"
        motionPreference="full"
        decorative
      />,
    );

    expect(html).toContain('data-primitive="round-colony-cluster"');
    expect(html).toContain('data-semantic-boundary="presentation-only"');
    expect(html).toContain('data-requires="authoritative-organism-kind"');
    expect(html.match(/<circle/g)).toHaveLength(3);
    expect(html).toContain('aria-hidden="true"');
  });

  it("renders every reusable component state explicitly", () => {
    const states: readonly PetraPrimitiveGlyphState[] = [
      "idle",
      "hover",
      "selected",
      "disabled",
      "loading",
      "active",
    ];

    for (const state of states) {
      const html = renderToStaticMarkup(
        <PetraPrimitiveGlyph
          primitive="rounded-bacterial-rod"
          state={state}
          tone="mint"
          motionPreference="full"
          decorative
        />,
      );

      expect(html).toContain(`data-state="${state}"`);
      expect(html).toContain("--petra-primitive-color:var(--petra-color-mint)");
    }
  });

  it("uses shared motion policy so Reduced and Off never keep loading loops", () => {
    const full = renderToStaticMarkup(
      <PetraPrimitiveGlyph
        primitive="selection-ring"
        state="loading"
        motionPreference="full"
        decorative
      />,
    );
    expect(full).toContain('data-motion-treatment="animate"');
    expect(full).toContain('data-loop="true"');
    expect(full).toContain("--petra-primitive-duration:160ms");

    for (const preference of ["reduced", "off"] as const) {
      const html = renderToStaticMarkup(
        <PetraPrimitiveGlyph
          primitive="selection-ring"
          state="loading"
          motionPreference={preference}
          decorative
        />,
      );
      expect(html).toContain('data-loop="false"');
      expect(html).toContain("--petra-primitive-duration:0ms");
    }
  });

  it("requires an accessible label when the glyph is not decorative", () => {
    expect(() =>
      renderToStaticMarkup(
        <PetraPrimitiveGlyph
          primitive="intervention-marker"
          motionPreference="off"
          decorative={false}
        />,
      ),
    ).toThrow(/accessible label/);

    const html = renderToStaticMarkup(
      <PetraPrimitiveGlyph
        primitive="intervention-marker"
        motionPreference="off"
        decorative={false}
        label="Intervention location"
      />,
    );
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Intervention location"');
  });

  it("fails closed instead of inventing specialized path geometry", () => {
    expect(() =>
      renderToStaticMarkup(
        <PetraPrimitiveGlyph
          primitive={"hyphal-path" as PetraPrimitiveGlyphId}
          motionPreference="full"
          decorative
        />,
      ),
    ).toThrow(/does not render geometry kind path/);
  });

  it("rejects invalid presentation sizes", () => {
    expect(() =>
      renderToStaticMarkup(
        <PetraPrimitiveGlyph
          primitive="selection-ring"
          motionPreference="full"
          size={0}
          decorative
        />,
      ),
    ).toThrow(/finite positive/);
  });
});
