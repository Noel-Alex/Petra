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
  it("keeps reduced decoration behind data-motion instead of raw OS media queries", () => {
    expect(appCss).toContain(
      '.petra-app[data-motion="reduced"] .dish-stage__halo',
    );
    expect(appCss).not.toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("does not let CSS override an explicit full motion setting", () => {
    expect(appCss).not.toContain(
      '.petra-app[data-motion="full"] .dish-stage__halo',
    );
    expect(appCss).toContain('.petra-app[data-motion="off"] *');
  });
});
