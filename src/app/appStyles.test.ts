import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Vite resolves raw assets in the Vitest runtime; this project intentionally omits vite/client globals.
// @ts-expect-error Vite raw asset import is runtime-supported but not declared in tsconfig types.
import appCss from "./app.css?raw";
// @ts-expect-error Vite raw asset import is runtime-supported but not declared in tsconfig types.
import timelineHistoryCss from "./timelineHistory.css?raw";
// @ts-expect-error Vite raw asset import is runtime-supported but not declared in tsconfig types.
import analysisSurfaceCss from "./analysisSurface.css?raw";

const appSource = readFileSync(fileURLToPath(new URL("./App.tsx", import.meta.url)), "utf8");

function ruleBody(selector: string, css = appCss): string {
  const start = css.indexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);

  const bodyStart = css.indexOf("{", start) + 1;
  const end = css.indexOf("}", bodyStart);
  expect(end).toBeGreaterThan(bodyStart);

  return css.slice(bodyStart, end);
}

describe("app shell keyboard focus styling", () => {
  it("keeps hover visually separate from keyboard focus", () => {
    const hover = ruleBody("button:hover");
    const focus = ruleBody(":where(button, select):focus-visible");

    expect(hover).not.toContain("outline:");
    expect(focus).toContain("outline: 3px solid var(--petra-focus-ring)");
    expect(focus).toContain("outline-offset: 3px");
    expect(focus).toContain("box-shadow:");
    expect(appCss).not.toContain("outline: none");
  });

  it("keeps focus visibility independent of motion and disabled states explicit", () => {
    const focus = ruleBody(":where(button, select):focus-visible");
    const disabled = appCss.slice(
      appCss.indexOf(':where(button, select):disabled,'),
      appCss.indexOf(".petra-app {"),
    );

    expect(focus).not.toContain("transition");
    expect(focus).not.toContain("animation");
    expect(disabled).toContain('aria-disabled="true"');
    expect(disabled).toContain("cursor: not-allowed");
  });
});


describe("app shell native select touch targets", () => {
  it("keeps the persisted motion selector at Petra's 44px expo floor", () => {
    const rule = ruleBody(".motion-control select");

    expect(rule).toContain("min-height: 2.75rem;");
    expect(rule).not.toContain("width:");
    expect(rule).not.toContain("min-width:");
  });

  it("keeps the dish overlay selector touch-sized while preserving fluid width", () => {
    const rule = ruleBody(".dish-overlay-control select");

    expect(rule).toContain("min-height: 2.75rem;");
    expect(rule).toContain("min-width: 0;");
    expect(rule).not.toMatch(/(^|\n)\s*width\s*:/);
  });
});


describe("timeline history shared visual theme", () => {
  it("derives chrome from Petra's shared calm visual tokens", () => {
    expect(timelineHistoryCss).toContain(
      "border: 1px solid rgb(var(--petra-rgb-cream-muted) / 0.1);",
    );
    expect(timelineHistoryCss).toContain("color: var(--petra-color-cream);");
    expect(timelineHistoryCss).toContain(
      "background: rgb(var(--petra-rgb-teal) / 0.07);",
    );
    expect(timelineHistoryCss).not.toMatch(/\brgba?\(\s*\d/);
    expect(timelineHistoryCss).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});

describe("timeline history touch target", () => {
  it("keeps the native Full history disclosure at Petra's 44px floor without constraining inline width", () => {
    const rule = ruleBody(".timeline-history > summary", timelineHistoryCss);

    expect(rule).toContain("min-height: 2.75rem;");
    expect(rule).not.toMatch(/(^|\n)\s*width\s*:/);
    expect(rule).not.toMatch(/(^|\n)\s*min-width\s*:/);
  });
});

describe("app shell resolved motion attribute", () => {
  it("fails static when resolved panel motion is not projected", () => {
    const appRoot = ruleBody(".petra-app");

    expect(appRoot).toContain("--panel-motion-ms: 0ms;");
    expect(appRoot).toContain("--panel-motion-easing: linear;");
    expect(appSource).toContain('"--panel-motion-ms": panelMotion.duration');
    expect(appSource).toContain('"--panel-motion-easing": panelMotion.easing');
  });

  it("animates dish ambience only when the motion adapter admits a loop", () => {
    const animated = ruleBody(
      '.dish-stage__halo[data-ambient-motion="animate"]',
    );

    expect(animated).toContain("animation: petra-dish-halo-breathe");
    expect(animated).toContain("var(--dish-ambient-ms)");
    expect(animated).toContain("var(--dish-ambient-easing)");
    expect(appCss).toContain("@keyframes petra-dish-halo-breathe");
    expect(appCss).toContain("@keyframes petra-dish-halo-drift");
  });

  it("keeps reduced/off ambience static without deleting dish hero depth", () => {
    expect(appCss).not.toContain(
      '.petra-app[data-motion="reduced"] .dish-stage__halo',
    );
    expect(appCss).toContain('.petra-app[data-motion="off"] *');
    expect(appCss).toContain("animation: none !important");
    expect(appCss).not.toContain("@media (prefers-reduced-motion: reduce)");
  });
});


describe("localized placement motion authority", () => {
  it("fails static by default and never restores the abandoned bespoke loop timing", () => {
    const overlay = ruleBody(".dish-placement-overlay");
    const animated = ruleBody(
      '.dish-placement-overlay[data-transition-treatment="animate"] .dish-placement-target',
    );

    expect(overlay).toContain("--placement-motion-ms: 0ms;");
    expect(overlay).toContain("--placement-motion-easing: linear;");
    expect(animated).toContain("var(--placement-motion-ms)");
    expect(animated).toContain("var(--placement-motion-easing)");
    expect(appCss).toContain("@keyframes petra-placement-target-reveal");
    expect(appCss).not.toContain("petra-placement-ring-drift");
    expect(appCss).not.toContain("4.8s linear infinite");
  });
});

describe("Analysis shell shared visual theme", () => {
  it("derives stable wrapper chrome from Petra visual tokens without a local palette", () => {
    expect(analysisSurfaceCss).toContain(
      "rgb(var(--petra-rgb-ink-deep) / 0.78)",
    );
    expect(analysisSurfaceCss).toContain(
      "rgb(var(--petra-rgb-cream-muted) / 0.16)",
    );
    expect(analysisSurfaceCss).toContain("var(--petra-color-cream-muted)");
    expect(analysisSurfaceCss).toContain(
      "rgb(var(--petra-rgb-teal) / 0.08)",
    );
    expect(analysisSurfaceCss).not.toMatch(/\brgba?\(\s*\d/);
    expect(analysisSurfaceCss).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it("preserves native disclosure touch and keyboard-focus geometry", () => {
    const summary = ruleBody(
      ".analysis-surface--available > summary",
      analysisSurfaceCss,
    );
    const focus = ruleBody(
      ".analysis-surface--available > summary:focus-visible",
      analysisSurfaceCss,
    );
    const panel = ruleBody(
      ".analysis-surface--available .analysis-panel",
      analysisSurfaceCss,
    );

    expect(summary).toContain("min-height: 4.25rem;");
    expect(summary).toContain("cursor: pointer;");
    expect(focus).toContain("outline: 3px solid var(--petra-focus-ring);");
    expect(focus).toContain("outline-offset: 3px;");
    expect(panel).toContain("border: 0;");
    expect(panel).toContain("border-radius: 0 0 20px 20px;");
    expect(analysisSurfaceCss).not.toContain("transition:");
    expect(analysisSurfaceCss).not.toContain("animation:");
  });
});
