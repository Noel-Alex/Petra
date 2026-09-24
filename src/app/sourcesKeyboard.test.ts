import { describe, expect, it } from "vitest";
import { shouldCloseSourcesOnEscape } from "./sourcesKeyboard";

function target(
  tagName: string,
  options: { contentEditable?: boolean; role?: string } = {},
) {
  return {
    tagName,
    isContentEditable: options.contentEditable ?? false,
    getAttribute(name: string) {
      return name === "role" ? options.role ?? null : null;
    },
  };
}

describe("Sources keyboard lifecycle", () => {
  it("closes on Escape while the non-modal disclosure is open", () => {
    expect(
      shouldCloseSourcesOnEscape({
        open: true,
        key: "Escape",
        defaultPrevented: false,
        target: target("button"),
      }),
    ).toBe(true);
  });

  it("does not react while closed or for unrelated keys", () => {
    expect(
      shouldCloseSourcesOnEscape({
        open: false,
        key: "Escape",
        defaultPrevented: false,
        target: target("button"),
      }),
    ).toBe(false);
    expect(
      shouldCloseSourcesOnEscape({
        open: true,
        key: "Enter",
        defaultPrevented: false,
        target: target("button"),
      }),
    ).toBe(false);
  });

  it("respects higher-priority Escape cancellation", () => {
    expect(
      shouldCloseSourcesOnEscape({
        open: true,
        key: "Escape",
        defaultPrevented: true,
        target: target("button"),
      }),
    ).toBe(false);
  });

  it("does not hijack Escape from editable controls", () => {
    for (const editable of [
      target("input"),
      target("textarea"),
      target("select"),
      target("div", { contentEditable: true }),
      target("div", { role: "textbox" }),
    ]) {
      expect(
        shouldCloseSourcesOnEscape({
          open: true,
          key: "Escape",
          defaultPrevented: false,
          target: editable,
        }),
      ).toBe(false);
    }
  });
});
