import { describe, expect, it } from "vitest";

// Vite resolves raw assets in the Vitest runtime; this project intentionally omits vite/client globals.
// @ts-expect-error Vite raw asset import is runtime-supported but not declared in tsconfig types.
import presenterCss from "./PresenterGuide.css?raw";

describe("PresenterGuide resolved motion CSS", () => {
  it("fails static when adapter-projected motion variables are absent", () => {
    expect(presenterCss).toContain("--presenter-motion-ms: 0ms;");
    expect(presenterCss).toContain("--presenter-ease: linear;");
    expect(presenterCss).not.toContain("--presenter-motion-ms: 220ms;");
  });

  it("uses resolved motion attributes without a second OS motion authority", () => {
    expect(presenterCss).not.toContain("@media (prefers-reduced-motion: reduce)");
    expect(presenterCss).toContain(
      '.presenter-guide[data-motion="full"] .presenter-guide__card',
    );
    expect(presenterCss).toContain(
      '.presenter-guide[data-motion="reduced"] .presenter-guide__card',
    );
    expect(presenterCss).toContain('.presenter-guide[data-motion="off"] *');
  });

  it("keeps the native runbook selector at Petra's expo touch target", () => {
    const profileRule = presenterCss.match(
      /\\.presenter-guide__profile select \\{([\\s\\S]*?)\\}/,
    )?.[1];

    expect(profileRule).toBeDefined();
    expect(profileRule).toContain("min-height: 2.75rem;");
    expect(profileRule).not.toContain("min-width");
  });

  it("does not shrink the shared compact-action touch target locally", () => {
    const actionRule = presenterCss.match(
      /\.presenter-guide__actions button \{([\s\S]*?)\}/,
    )?.[1];

    expect(actionRule).toBeDefined();
    expect(actionRule).not.toContain("min-height");
  });

  it("keeps reduced motion fade-only while consuming the projected easing", () => {
    expect(presenterCss).toContain(
      "animation: presenter-card-fade var(--presenter-motion-ms) var(--presenter-ease) both;",
    );
    expect(presenterCss).not.toContain(
      "animation: presenter-card-fade var(--presenter-motion-ms) ease both;",
    );
    expect(presenterCss).toContain(
      "animation: presenter-card-enter var(--presenter-motion-ms) var(--presenter-ease) both;",
    );
  });
});
