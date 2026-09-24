import { describe, expect, it } from "vitest";
import { dishEscapeActionForKey } from "./dishKeyboard";

describe("dish Escape arbitration", () => {
  it("lets an active intervention tool cancel before camera reset", () => {
    expect(
      dishEscapeActionForKey("Escape", {
        editableTarget: false,
        dishOwnsFocus: true,
        interventionToolCanCancel: true,
      }),
    ).toBe("cancel-tool");
  });

  it("resets camera overview when the dish owns focus and no tool owns Escape", () => {
    expect(
      dishEscapeActionForKey("Escape", {
        editableTarget: false,
        dishOwnsFocus: true,
        interventionToolCanCancel: false,
      }),
    ).toBe("reset-overview");
  });

  it("does not hijack editable or out-of-surface Escape handling", () => {
    expect(
      dishEscapeActionForKey("Escape", {
        editableTarget: true,
        dishOwnsFocus: true,
        interventionToolCanCancel: false,
      }),
    ).toBeNull();

    expect(
      dishEscapeActionForKey("Escape", {
        editableTarget: false,
        dishOwnsFocus: false,
        interventionToolCanCancel: false,
      }),
    ).toBeNull();

    expect(
      dishEscapeActionForKey("Home", {
        editableTarget: false,
        dishOwnsFocus: true,
        interventionToolCanCancel: false,
      }),
    ).toBeNull();
  });
});
