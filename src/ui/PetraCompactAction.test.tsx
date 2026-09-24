import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PetraCompactAction } from "./PetraCompactAction";
import { MOTION } from "./motion/tokens";

describe("PetraCompactAction motion projection", () => {
  it("projects the shared full-motion token and selected semantics", () => {
    const html = renderToStaticMarkup(
      <PetraCompactAction motionPreference="full" selected>
        2×
      </PetraCompactAction>,
    );

    expect(html).toContain('data-emphasis="selected"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain(
      `--petra-compact-action-duration:${MOTION.toolPreview.durationMs}ms`,
    );
    expect(html).toContain("--petra-compact-action-y:-0.08rem");
  });

  it("keeps reduced selected meaning without spatial movement", () => {
    const html = renderToStaticMarkup(
      <PetraCompactAction motionPreference="reduced" selected>
        2×
      </PetraCompactAction>,
    );

    expect(html).toContain('data-emphasis="selected"');
    expect(html).toContain("--petra-compact-action-duration:0ms");
    expect(html).toContain("--petra-compact-action-y:0rem");
    expect(html).toContain("--petra-compact-action-scale:1");
  });

  it("makes off-mode controls static while preserving disabled state", () => {
    const html = renderToStaticMarkup(
      <PetraCompactAction motionPreference="off" disabled>
        Play
      </PetraCompactAction>,
    );

    expect(html).toContain('data-emphasis="disabled"');
    expect(html).toContain('data-motion="off"');
    expect(html).toContain("--petra-compact-action-duration:0ms");
  });
});
