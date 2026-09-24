import { describe, expect, it } from "vitest";
import {
  isGlobalShortcutBlockedTarget,
  planAppKeyboardShortcut,
} from "./appKeyboard";

function target(
  tagName: string,
  options: {
    contentEditable?: boolean;
    role?: string;
    href?: string;
  } = {},
) {
  return {
    tagName,
    isContentEditable: options.contentEditable ?? false,
    getAttribute(name: string) {
      if (name === "role") return options.role ?? null;
      if (name === "href") return options.href ?? null;
      return null;
    },
  };
}

describe("app keyboard shortcut planning", () => {
  it("maps playback shortcuts from non-interactive surfaces", () => {
    expect(
      planAppKeyboardShortcut({
        sourcesOpen: false,
        key: " ",
        defaultPrevented: false,
        target: target("div"),
      }),
    ).toEqual({ type: "dispatch", action: { type: "toggle-play" } });

    expect(
      planAppKeyboardShortcut({
        sourcesOpen: false,
        key: ".",
        defaultPrevented: false,
        target: target("main"),
      }),
    ).toEqual({
      type: "dispatch",
      action: { type: "step", ticks: 1 },
    });

    expect(
      ["1", "2", "3"].map((key) =>
        planAppKeyboardShortcut({
          sourcesOpen: false,
          key,
          defaultPrevented: false,
          target: target("section"),
        }),
      ),
    ).toEqual([
      { type: "dispatch", action: { type: "set-speed", speed: 1 } },
      { type: "dispatch", action: { type: "set-speed", speed: 4 } },
      { type: "dispatch", action: { type: "set-speed", speed: 16 } },
    ]);
  });

  it("preserves native and ARIA widget keyboard ownership", () => {
    const blockedTargets = [
      target("input"),
      target("textarea"),
      target("select"),
      target("button"),
      target("summary"),
      target("div", { contentEditable: true }),
      target("a", { href: "/sources" }),
      target("div", { role: "button" }),
      target("div", { role: "slider" }),
      target("div", { role: "spinbutton" }),
      target("div", { role: "textbox" }),
      target("div", { role: "combobox" }),
      target("div", { role: "listbox" }),
      target("div", { role: "menuitem" }),
      target("div", { role: "option" }),
      target("div", { role: "switch" }),
      target("div", { role: "tab" }),
    ];

    for (const blockedTarget of blockedTargets) {
      expect(isGlobalShortcutBlockedTarget(blockedTarget)).toBe(true);
      expect(
        planAppKeyboardShortcut({
          sourcesOpen: false,
          key: " ",
          defaultPrevented: false,
          target: blockedTarget,
        }),
      ).toEqual({ type: "none" });
    }
  });

  it("does not block inert anchors or ordinary surfaces", () => {
    expect(isGlobalShortcutBlockedTarget(target("a"))).toBe(false);
    expect(isGlobalShortcutBlockedTarget(target("div"))).toBe(false);
    expect(isGlobalShortcutBlockedTarget(null)).toBe(false);
  });

  it("gives an open Sources disclosure precedence over global Escape", () => {
    expect(
      planAppKeyboardShortcut({
        sourcesOpen: true,
        key: "Escape",
        defaultPrevented: false,
        target: target("div"),
      }),
    ).toEqual({ type: "close-sources" });
  });

  it("does not take Sources Escape from editable controls", () => {
    expect(
      planAppKeyboardShortcut({
        sourcesOpen: true,
        key: "Escape",
        defaultPrevented: false,
        target: target("input"),
      }),
    ).toEqual({ type: "none" });
  });

  it("maps otherwise-unconsumed Escape to pause", () => {
    expect(
      planAppKeyboardShortcut({
        sourcesOpen: false,
        key: "Escape",
        defaultPrevented: false,
        target: target("div"),
      }),
    ).toEqual({ type: "dispatch", action: { type: "pause" } });
  });

  it("ignores events already consumed by a child owner", () => {
    expect(
      planAppKeyboardShortcut({
        sourcesOpen: true,
        key: "Escape",
        defaultPrevented: true,
        target: target("div"),
      }),
    ).toEqual({ type: "none" });
  });

  it("ignores unrelated keys", () => {
    expect(
      planAppKeyboardShortcut({
        sourcesOpen: false,
        key: "Enter",
        defaultPrevented: false,
        target: target("div"),
      }),
    ).toEqual({ type: "none" });
  });
});
