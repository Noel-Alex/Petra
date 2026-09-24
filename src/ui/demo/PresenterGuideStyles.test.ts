import { describe, expect, it } from "vitest";

// Vite resolves raw assets in the Vitest runtime; this project intentionally omits vite/client globals.
// @ts-expect-error Vite raw asset import is runtime-supported but not declared in tsconfig types.
import presenterCss from "./PresenterGuide.css?raw";
// @ts-expect-error Vite raw asset import is runtime-supported but not declared in tsconfig types.
import presenterSource from "./PresenterGuide.tsx?raw";

describe("PresenterGuide resolved motion CSS", () => {
  it("fails static when adapter-projected motion variables are absent", () => {
    expect(presenterCss).toContain("--presenter-motion-ms: 0ms;");
    expect(presenterCss).toContain("--presenter-ease: linear;");
    expect(presenterCss).not.toContain("--presenter-motion-ms: 220ms;");
  });

  it("uses resolved motion attributes without a second OS motion authority", () => {
    expect(presenterCss).not.toContain("@media (prefers-reduced-motion: reduce)");
    expect(presenterCss).toContain(
      '.presenter-guide[data-motion="full"] .presenter-guide__card-content {',
    );
    expect(presenterCss).toContain(
      '.presenter-guide[data-motion="reduced"] .presenter-guide__card-content {',
    );
    expect(presenterCss).toContain('.presenter-guide[data-motion="off"] *');
    expect(presenterCss).not.toContain(
      '.presenter-guide[data-motion="full"] .presenter-guide__card {',
    );
    expect(presenterCss).not.toContain(
      '.presenter-guide[data-motion="reduced"] .presenter-guide__card {',
    );
  });

  it("keys only the cue visual layer while keeping the polite live region stable", () => {
    expect(presenterSource).toContain(
      '<section className="presenter-guide__card" aria-live="polite">',
    );
    expect(presenterSource).toContain("key={presentation.cue.id}");
    expect(presenterSource).toContain(
      'className="presenter-guide__card-content"',
    );
    expect(presenterSource).toContain(
      "data-cue-id={presentation.cue.id}",
    );
    expect(presenterSource).not.toContain(
      '<section key={presentation.cue.id}',
    );
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
