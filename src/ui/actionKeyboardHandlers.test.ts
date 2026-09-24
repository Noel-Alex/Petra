import { describe, expect, it } from "vitest";

// Vite raw imports let us lock the thin React adapter contract without a DOM
// test environment or synthetic click implementation.
// @ts-expect-error Vite raw source import is runtime-supported but not in tsconfig types.
import actionSource from "./PetraAction.tsx?raw";
// @ts-expect-error Vite raw source import is runtime-supported but not in tsconfig types.
import compactActionSource from "./PetraCompactAction.tsx?raw";

describe("shared action keyboard adapter contract", () => {
  for (const [name, source] of [
    ["PetraAction", actionSource],
    ["PetraCompactAction", compactActionSource],
  ] as const) {
    it(`${name} forwards caller keyboard handlers and never synthesizes activation`, () => {
      expect(source).toContain("onKeyDown?.(event);");
      expect(source).toContain("onKeyUp?.(event);");
      expect(source).toContain("beginActionKeyboardPress");
      expect(source).toContain("finishActionKeyboardPress");
      expect(source).toContain("event.defaultPrevented");
      expect(source).not.toContain("event.preventDefault()");
      expect(source).not.toContain(".click()");
    });

    it(`${name} lets caller keydown prevention veto decorative press feedback`, () => {
      const callerIndex = source.indexOf("onKeyDown?.(event);");
      const preventionIndex = source.indexOf("!event.defaultPrevented");
      const beginIndex = source.lastIndexOf("beginActionKeyboardPress");

      expect(callerIndex).toBeGreaterThan(-1);
      expect(preventionIndex).toBeGreaterThan(callerIndex);
      expect(beginIndex).toBeGreaterThan(preventionIndex);
    });

    it(`${name} clears both transient input channels when disabled`, () => {
      expect(source).toContain(
        "clearActionKeyboardPress(clearActionPointerState(current))",
      );
    });
  }
});
