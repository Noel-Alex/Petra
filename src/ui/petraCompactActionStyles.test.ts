import { describe, expect, it } from "vitest";

// Vite resolves raw stylesheet imports at test runtime.
// @ts-expect-error Vite raw asset imports are runtime-supported but not in tsconfig globals.
import compactActionCss from "./petraCompactAction.css?raw";

function compactActionRule(): string {
  const match = compactActionCss.match(/\.petra-compact-action\s*\{([\s\S]*?)\}/);
  if (match === null) throw new Error("missing Petra compact action rule");
  return match[1]!;
}

describe("PetraCompactAction touch target styles", () => {
  it("owns a 2.75rem minimum touch height independent of caller padding", () => {
    expect(compactActionRule()).toContain("min-height: 2.75rem");
  });

  it("keeps compact action width content-driven", () => {
    const rule = compactActionRule();
    expect(rule).not.toMatch(/\bmin-width\s*:/);
    expect(rule).not.toMatch(/\bwidth\s*:/);
  });

  it("retains touch manipulation semantics", () => {
    expect(compactActionRule()).toContain("touch-action: manipulation");
  });
});
