import { renderToStaticMarkup } from "react-dom/server";
import type { CSSProperties } from "react";
import { describe, expect, it } from "vitest";

import { PetraAction } from "./PetraAction";
import { MOTION } from "./motion/tokens";

describe("PetraAction motion projection", () => {
  it("projects duration and easing from the shared toolPreview token", () => {
    const html = renderToStaticMarkup(
      <PetraAction
        icon="inspect"
        label="Inspect"
        motionPreference="full"
      />,
    );

    const easing = `cubic-bezier(${MOTION.toolPreview.easing.join(", ")})`;
    expect(html).toContain(
      `--petra-action-duration:${MOTION.toolPreview.durationMs}ms`,
    );
    expect(html).toContain(`--petra-action-easing:${easing}`);
  });
  it("preserves caller aria-pressed when selected is not supplied", () => {
    const html = renderToStaticMarkup(
      <PetraAction
        icon="inspect"
        label="Compare"
        motionPreference="full"
        aria-pressed="mixed"
      />,
    );

    expect(html).toContain('aria-pressed="mixed"');
  });

  it("lets explicit selected=false own false toggle semantics", () => {
    const html = renderToStaticMarkup(
      <PetraAction
        icon="inspect"
        label="Compare"
        motionPreference="full"
        selected={false}
        aria-pressed="mixed"
      />,
    );

    expect(html).toContain('aria-pressed="false"');
    expect(html).not.toContain('aria-pressed="mixed"');
  });

  it("preserves unrelated caller styles while Petra motion variables stay authoritative", () => {
    const html = renderToStaticMarkup(
      <PetraAction
        icon="inspect"
        label="Inspect"
        motionPreference="full"
        style={{
          opacity: 0.72,
          "--petra-action-duration": "999ms",
        } as CSSProperties}
      />,
    );

    expect(html).toContain("opacity:0.72");
    expect(html).toContain(
      `--petra-action-duration:${MOTION.toolPreview.durationMs}ms`,
    );
    expect(html).not.toContain("--petra-action-duration:999ms");
  });

});
