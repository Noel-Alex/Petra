import { renderToStaticMarkup } from "react-dom/server";
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
});
