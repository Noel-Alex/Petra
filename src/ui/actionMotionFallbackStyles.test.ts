import { describe, expect, it } from "vitest";

// Vite resolves raw stylesheet imports at test runtime.
// @ts-expect-error Vite raw asset imports are runtime-supported but not in tsconfig globals.
import actionCss from "./petraAction.css?raw";
// @ts-expect-error Vite raw asset imports are runtime-supported but not in tsconfig globals.
import compactActionCss from "./petraCompactAction.css?raw";

function ruleBody(css: string, selector: string): string {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error("missing CSS rule: " + selector);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  if (open < 0 || close < 0) throw new Error("malformed CSS rule: " + selector);
  return css.slice(open + 1, close);
}

describe("shared action CSS motion fallbacks", () => {
  it("keeps PetraAction static until adapter motion variables are projected", () => {
    const rule = ruleBody(actionCss, ".petra-action");

    expect(rule).toContain("--petra-action-duration: 0ms");
    expect(rule).toContain("--petra-action-easing: linear");
    expect(rule).not.toContain("--petra-action-duration: 160ms");
  });

  it("keeps PetraCompactAction static until adapter motion variables are projected", () => {
    const rule = ruleBody(compactActionCss, ".petra-compact-action");

    expect(rule).toContain("--petra-compact-action-duration: 0ms");
    expect(rule).toContain("--petra-compact-action-easing: linear");
  });
});
