import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sources = [
  readFileSync(new URL("./PetraAction.tsx", import.meta.url), "utf8"),
  readFileSync(new URL("./PetraCompactAction.tsx", import.meta.url), "utf8"),
];

function keyHandler(source: string, name: "onKeyDown" | "onKeyUp"): string {
  const start = source.indexOf(`${name}={(event) => {`);
  expect(start).toBeGreaterThanOrEqual(0);
  const nextHandler = source.indexOf("\n      on", start + name.length);
  return source.slice(start, nextHandler < 0 ? source.length : nextHandler);
}

describe("shared action keyboard adapter contract", () => {
  it("forwards caller keydown before deciding Petra press feedback", () => {
    for (const source of sources) {
      const handler = keyHandler(source, "onKeyDown");
      const callerIndex = handler.indexOf("onKeyDown?.(event)");
      const feedbackIndex = handler.indexOf("beginActionKeyboardPress");

      expect(callerIndex).toBeGreaterThanOrEqual(0);
      expect(feedbackIndex).toBeGreaterThan(callerIndex);
      expect(handler).toContain("event.defaultPrevented");
      expect(handler).not.toContain("preventDefault");
      expect(handler).not.toContain(".click(");
    }
  });

  it("always clears matching keyboard state on keyup while forwarding the caller", () => {
    for (const source of sources) {
      const handler = keyHandler(source, "onKeyUp");
      expect(handler).toContain("endActionKeyboardPress");
      expect(handler).toContain("onKeyUp?.(event)");
      expect(handler).not.toContain("preventDefault");
      expect(handler).not.toContain(".click(");
    }
  });

  it("clears transient pointer and keyboard state when an action disables", () => {
    for (const source of sources) {
      expect(source).toContain("setInteraction(clearActionTransientState)");
    }
  });
});
