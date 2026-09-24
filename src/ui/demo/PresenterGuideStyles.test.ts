import { describe, expect, it } from "vitest";

// Vite resolves raw assets in the Vitest runtime; this project intentionally omits vite/client globals.
// @ts-expect-error Vite raw asset import is runtime-supported but not declared in tsconfig types.
import presenterCss from "./PresenterGuide.css?raw";
// @ts-expect-error Vite raw asset import is runtime-supported but not declared in tsconfig types.
import presenterSource from "./PresenterGuide.tsx?raw";

describe("PresenterGuide presentation contracts", () => {
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

  it("keeps one bounded live region outside the keyed cue visual layer", () => {
    const announcementIndex = presenterSource.indexOf(
      'className="presenter-guide__announcement"',
    );
    const cueLayerIndex = presenterSource.indexOf("key={presentation.cue.id}");

    expect(presenterSource).toContain(
      '<section className="presenter-guide__card">',
    );
    expect(presenterSource).not.toContain(
      '<section className="presenter-guide__card" aria-live="polite">',
    );
    expect(presenterSource.match(/role="status"/g)).toHaveLength(1);
    expect(presenterSource).toContain('aria-live="polite"');
    expect(presenterSource).toContain('aria-atomic="true"');
    expect(presenterSource).toContain('aria-relevant="text"');
    expect(announcementIndex).toBeGreaterThan(-1);
    expect(cueLayerIndex).toBeGreaterThan(announcementIndex);
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

  it("visually hides the bounded presenter announcement without removing it", () => {
    const announcementRule = presenterCss.match(
      /\.presenter-guide__announcement \{([\s\S]*?)\}/,
    )?.[1];

    expect(announcementRule).toBeDefined();
    expect(announcementRule).toContain("position: absolute");
    expect(announcementRule).toContain("inline-size: 1px");
    expect(announcementRule).toContain("block-size: 1px");
    expect(announcementRule).toContain("overflow: hidden");
    expect(announcementRule).toContain("clip: rect(0 0 0 0)");
  });

  it("keeps the native runbook selector at Petra's expo touch target", () => {
    const profileRule = presenterCss.match(
      /\.presenter-guide__profile select \{([\s\S]*?)\}/,
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
