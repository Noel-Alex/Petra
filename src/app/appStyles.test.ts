import { describe, expect, it } from "vitest";

// Vite resolves raw assets in the Vitest runtime; this project intentionally omits vite/client globals.
// @ts-expect-error Vite raw asset import is runtime-supported but not declared in tsconfig types.
import appCss from "./app.css?raw";

function ruleBody(selector: string): string {
  const start = appCss.indexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);

  const bodyStart = appCss.indexOf("{", start) + 1;
  const end = appCss.indexOf("}", bodyStart);
  expect(end).toBeGreaterThan(bodyStart);

  return appCss.slice(bodyStart, end);
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


describe("app shell resolved motion attribute", () => {
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
