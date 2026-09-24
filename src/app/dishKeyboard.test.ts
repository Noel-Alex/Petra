import { describe, expect, it } from "vitest";
import {
  dishEscapeAction,
  dishEscapeAllowsFirstRefusal,
} from "./dishKeyboard";

const available = {
  defaultPrevented: false,
  editableTarget: false,
  higherPriorityConsumed: false,
  renderEnabled: true,
} as const;

describe("dish Escape arbitration", () => {
  it("offers plain Escape to a higher-priority owner before camera reset", () => {
    expect(
      dishEscapeAllowsFirstRefusal("Escape", {
        defaultPrevented: false,
        editableTarget: false,
      }),
    ).toBe(true);
  });

  it("does not offer editable, already-consumed, or unrelated keys", () => {
    expect(
      dishEscapeAllowsFirstRefusal("Escape", {
        defaultPrevented: true,
        editableTarget: false,
      }),
    ).toBe(false);
    expect(
      dishEscapeAllowsFirstRefusal("Escape", {
        defaultPrevented: false,
        editableTarget: true,
      }),
    ).toBe(false);
    expect(
      dishEscapeAllowsFirstRefusal("Home", {
        defaultPrevented: false,
        editableTarget: false,
      }),
    ).toBe(false);
  });


  it("resets the camera overview when the dish owns Escape", () => {
    expect(dishEscapeAction("Escape", available)).toBe("reset-overview");
  });

  it("lets a higher-priority active tool consume Escape first", () => {
    expect(
      dishEscapeAction("Escape", {
        ...available,
        higherPriorityConsumed: true,
      }),
    ).toBeNull();
  });

  it("does not override an already prevented Escape event", () => {
    expect(
      dishEscapeAction("Escape", {
        ...available,
        defaultPrevented: true,
      }),
    ).toBeNull();
  });

  it("does not hijack editable controls or an unavailable renderer", () => {
    expect(
      dishEscapeAction("Escape", {
        ...available,
        editableTarget: true,
      }),
    ).toBeNull();

    expect(
      dishEscapeAction("Escape", {
        ...available,
        renderEnabled: false,
      }),
    ).toBeNull();
  });

  it("ignores unrelated keys", () => {
    expect(dishEscapeAction("Home", available)).toBeNull();
  });
});
