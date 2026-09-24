import { describe, expect, it } from "vitest";

import {
  canDispatchAppShortcut,
  isGlobalShortcutBlockedTarget,
  planAppKeyboardShortcut,
} from "./appKeyboard";

function target(
  tagName: string,
  options: {
    readonly role?: string;
    readonly href?: string;
    readonly contentEditable?: boolean;
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

describe("app keyboard shortcut policy", () => {
  it("projects playback shortcuts only from non-interactive surfaces", () => {
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
    ).toEqual({ type: "dispatch", action: { type: "step", ticks: 1 } });

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

  it("preserves native keyboard semantics for interactive targets", () => {
    for (const blockedTarget of [
      target("button"),
      target("input"),
      target("textarea"),
      target("select"),
      target("summary"),
      target("a", { href: "https://example.test" }),
      target("div", { contentEditable: true }),
      target("div", { role: "button" }),
      target("div", { role: "slider" }),
      target("div", { role: "spinbutton" }),
      target("div", { role: "textbox" }),
      target("div", { role: "combobox" }),
      target("div", { role: "switch" }),
    ]) {
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

  it("lets an open Sources disclosure own Escape before global pause", () => {
    expect(
      planAppKeyboardShortcut({
        sourcesOpen: true,
        key: "Escape",
        defaultPrevented: false,
        target: target("div"),
      }),
    ).toEqual({ type: "close-sources" });

    expect(
      planAppKeyboardShortcut({
        sourcesOpen: true,
        key: "Escape",
        defaultPrevented: false,
        target: target("input"),
      }),
    ).toEqual({ type: "none" });

    expect(
      planAppKeyboardShortcut({
        sourcesOpen: false,
        key: "Escape",
        defaultPrevented: false,
        target: target("div"),
      }),
    ).toEqual({ type: "dispatch", action: { type: "pause" } });
  });

  it("honors child ownership and ignores unrelated keys", () => {
    expect(
      planAppKeyboardShortcut({
        sourcesOpen: false,
        key: " ",
        defaultPrevented: true,
        target: target("div"),
      }),
    ).toEqual({ type: "none" });

    expect(
      planAppKeyboardShortcut({
        sourcesOpen: false,
        key: "Enter",
        defaultPrevented: false,
        target: target("div"),
      }),
    ).toEqual({ type: "none" });
  });

  it("does not block a plain anchor without an href", () => {
    expect(isGlobalShortcutBlockedTarget(target("a"))).toBe(false);
  });

  it("blocks recognized interactive roles inside fallback-token role lists", () => {
    expect(
      isGlobalShortcutBlockedTarget(target("div", { role: "unknown button" })),
    ).toBe(true);
    expect(
      isGlobalShortcutBlockedTarget(target("div", { role: "switch checkbox" })),
    ).toBe(true);
    expect(
      isGlobalShortcutBlockedTarget(
        target("div", { role: "  TEXTBOX   unknown " }),
      ),
    ).toBe(true);
  });

  it("ignores empty and all-unknown ARIA role tokens", () => {
    expect(
      isGlobalShortcutBlockedTarget(
        target("div", { role: "unknown future-role" }),
      ),
    ).toBe(false);
    expect(isGlobalShortcutBlockedTarget(target("div", { role: "   " }))).toBe(
      false,
    );
  });
});


describe("app keyboard runtime availability", () => {
  const ready = {
    playing: false,
    canTogglePlayback: true,
    canChangeSpeed: true,
    canStep: true,
  };

  it("keeps toggle, speed, and step shortcuts inside the visible runtime gates", () => {
    expect(canDispatchAppShortcut({ type: "toggle-play" }, ready)).toBe(true);
    expect(
      canDispatchAppShortcut(
        { type: "toggle-play" },
        { ...ready, canTogglePlayback: false },
      ),
    ).toBe(false);

    expect(canDispatchAppShortcut({ type: "set-speed", speed: 4 }, ready)).toBe(true);
    expect(
      canDispatchAppShortcut(
        { type: "set-speed", speed: 4 },
        { ...ready, canChangeSpeed: false },
      ),
    ).toBe(false);

    expect(canDispatchAppShortcut({ type: "step", ticks: 1 }, ready)).toBe(true);
    expect(
      canDispatchAppShortcut(
        { type: "step", ticks: 1 },
        { ...ready, canStep: false },
      ),
    ).toBe(false);
  });

  it("allows global pause only while playback is actually running", () => {
    expect(canDispatchAppShortcut({ type: "pause" }, ready)).toBe(false);
    expect(
      canDispatchAppShortcut(
        { type: "pause" },
        { ...ready, playing: true },
      ),
    ).toBe(true);
  });

  it("fails closed for actions that are not global keyboard shortcuts", () => {
    expect(canDispatchAppShortcut({ type: "play" }, ready)).toBe(false);
    expect(canDispatchAppShortcut({ type: "reset" }, ready)).toBe(false);
  });
});
