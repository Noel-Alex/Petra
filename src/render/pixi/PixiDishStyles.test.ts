import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const PIXI_DISH_CSS = readFileSync(
  new URL("./PixiDish.css", import.meta.url),
  "utf8",
);
const PIXI_DISH_SOURCE = readFileSync(
  new URL("./PixiDish.tsx", import.meta.url),
  "utf8",
);
const COMPACT_ACTION_CSS = readFileSync(
  new URL("../../ui/petraCompactAction.css", import.meta.url),
  "utf8",
);

function ruleBody(css: string, selector: string): string {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error("missing CSS rule: " + selector);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  if (open < 0 || close < 0) throw new Error("unterminated CSS rule: " + selector);
  return css.slice(open + 1, close);
}

describe("Pixi renderer recovery action styles", () => {
  it("inherits PetraCompactAction's 2.75rem touch floor instead of shrinking it locally", () => {
    const retry = ruleBody(PIXI_DISH_CSS, ".pixi-dish__retry-action");
    const shared = ruleBody(COMPACT_ACTION_CSS, ".petra-compact-action");

    expect(shared).toContain("min-height: 2.75rem");
    expect(retry).not.toMatch(/min-height\s*:/);
    expect(retry).not.toMatch(/min-width\s*:/);
  });

  it("keeps renderer-local visual tone without defining interaction timing", () => {
    const retry = ruleBody(PIXI_DISH_CSS, ".pixi-dish__retry-action");

    expect(retry).toContain("border:");
    expect(retry).toContain("background:");
    expect(retry).toContain("color:");
    expect(retry).not.toMatch(/transition\s*:/);
    expect(retry).not.toMatch(/animation\s*:/);
  });
});


describe("Pixi renderer status chrome theme ownership", () => {
  it("uses shared Petra visual variables instead of an independent numeric palette", () => {
    for (const token of [
      "--petra-color-cream",
      "--petra-color-cream-muted",
      "--petra-color-amber",
      "--petra-rgb-ink-deep",
      "--petra-rgb-teal",
    ]) {
      expect(PIXI_DISH_CSS).toContain(token);
    }

    expect(PIXI_DISH_CSS).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(PIXI_DISH_CSS).not.toMatch(/\brgba?\(\s*\d/i);
    expect(PIXI_DISH_SOURCE).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(PIXI_DISH_SOURCE).not.toMatch(/\brgba?\(\s*\d/i);
  });

  it("keeps waiting, demo, and failure disclosure class-driven and semantically explicit", () => {
    expect(PIXI_DISH_SOURCE).toContain('className="pixi-dish__empty"');
    expect(PIXI_DISH_SOURCE).toContain(
      'className="pixi-dish__demo-disclosure"',
    );
    expect(PIXI_DISH_SOURCE).toContain('className="pixi-dish__fallback"');
    expect(PIXI_DISH_SOURCE).toContain(
      'className="pixi-dish__fallback-card"',
    );
    expect(PIXI_DISH_SOURCE).toContain("Visual demo — not simulation data");
    expect(PIXI_DISH_SOURCE).toContain(
      "Petra has not substituted demonstration biology or changed the simulation state.",
    );
  });

  it("maps demo warning and recovery chrome to shared reinforcement tokens", () => {
    const demo = ruleBody(PIXI_DISH_CSS, ".pixi-dish__demo-disclosure");
    const retry = ruleBody(PIXI_DISH_CSS, ".pixi-dish__retry-action");

    expect(demo).toContain("--petra-rgb-amber");
    expect(demo).toContain("--petra-color-amber");
    expect(retry).toContain("--petra-rgb-teal");
    expect(retry).toContain("--petra-color-cream");
  });
});
