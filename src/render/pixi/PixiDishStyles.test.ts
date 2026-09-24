import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const PIXI_DISH_CSS = readFileSync(
  new URL("./PixiDish.css", import.meta.url),
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
