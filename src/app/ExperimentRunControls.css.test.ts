import { describe, expect, it } from "vitest";

// Vite resolves raw modules in Vitest; this project intentionally omits vite/client globals.
// @ts-expect-error Vite raw asset imports are runtime-supported but not declared in tsconfig types.
import css from "./ExperimentRunControls.css?raw";

function ruleBody(selector: string): string {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error("missing CSS rule: " + selector);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  if (open < 0 || close < 0) throw new Error("malformed CSS rule: " + selector);
  return css.slice(open + 1, close);
}

describe("ExperimentRunControls styles", () => {
  it("keeps the seed field on Petra's 44px native-control floor", () => {
    expect(ruleBody(".seed-control input")).toContain("min-height: 2.75rem");
  });

  it("consumes the shared calm visual palette rather than defining another one", () => {
    const input = ruleBody(".seed-control input");
    const focus = ruleBody(".seed-control input:focus-visible");
    const identity = ruleBody(".experiment-run-controls__identity");

    expect(input).toContain("var(--petra-color-ink-soft)");
    expect(input).toContain("var(--petra-color-cream)");
    expect(input).toContain("var(--petra-rgb-cream)");
    expect(focus).toContain("var(--petra-rgb-amber)");
    expect(identity).toContain("var(--petra-color-cream-muted)");
  });
});
