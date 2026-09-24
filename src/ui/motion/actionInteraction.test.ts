import { describe, expect, it } from "vitest";

import {
  beginActionKeyboardPress,
  beginActionPointerPress,
  clearActionKeyboardPress,
  clearActionPointerState,
  finishActionKeyboardPress,
  createActionInteractionState,
  resolveActionMicroInteractionState,
  updateActionInteractionState,
} from "./actionInteraction";

describe("PetraAction interaction precedence", () => {
  it("starts press feedback only for the primary activation button", () => {
    const idle = createActionInteractionState();
    const primary = beginActionPointerPress(idle, 0);

    expect(primary).toEqual({
      focused: false,
      pointer: "press",
      keyboardPress: "idle",
    });
    for (const button of [1, 2, 3, 4, -1]) {
      expect(beginActionPointerPress(idle, button)).toBe(idle);
    }
  });

  it("keeps focus and selection semantics intact on a secondary pointer press", () => {
    const focused = updateActionInteractionState(
      createActionInteractionState(),
      "focus",
    );
    const afterSecondary = beginActionPointerPress(focused, 2);

    expect(afterSecondary).toBe(focused);
    expect(
      resolveActionMicroInteractionState({
        interaction: afterSecondary,
        disabled: false,
        selected: true,
      }),
    ).toBe("focus");
  });

  it("keeps focus authoritative across hover enter and leave", () => {
    let state = createActionInteractionState();
    state = updateActionInteractionState(state, "focus");
    expect(
      resolveActionMicroInteractionState({
        interaction: state,
        disabled: false,
        selected: false,
      }),
    ).toBe("focus");

    state = updateActionInteractionState(state, "pointer-enter");
    expect(
      resolveActionMicroInteractionState({
        interaction: state,
        disabled: false,
        selected: false,
      }),
    ).toBe("focus");

    state = updateActionInteractionState(state, "pointer-leave");
    expect(
      resolveActionMicroInteractionState({
        interaction: state,
        disabled: false,
        selected: false,
      }),
    ).toBe("focus");
  });

  it("allows transient press feedback then restores focus", () => {
    let state = updateActionInteractionState(
      createActionInteractionState(),
      "focus",
    );
    state = updateActionInteractionState(state, "pointer-down");
    expect(
      resolveActionMicroInteractionState({
        interaction: state,
        disabled: false,
        selected: true,
      }),
    ).toBe("press");

    state = updateActionInteractionState(state, "pointer-up");
    expect(
      resolveActionMicroInteractionState({
        interaction: state,
        disabled: false,
        selected: true,
      }),
    ).toBe("focus");
  });

  it("restores hover after blur while the pointer remains over the control", () => {
    let state = createActionInteractionState();
    state = updateActionInteractionState(state, "pointer-enter");
    state = updateActionInteractionState(state, "focus");
    state = updateActionInteractionState(state, "blur");

    expect(
      resolveActionMicroInteractionState({
        interaction: state,
        disabled: false,
        selected: false,
      }),
    ).toBe("hover");
  });

  it("restores selected after pointer leave and blur", () => {
    let state = createActionInteractionState();
    state = updateActionInteractionState(state, "pointer-enter");
    state = updateActionInteractionState(state, "focus");
    state = updateActionInteractionState(state, "pointer-leave");
    state = updateActionInteractionState(state, "blur");

    expect(
      resolveActionMicroInteractionState({
        interaction: state,
        disabled: false,
        selected: true,
      }),
    ).toBe("selected");
  });

  it("clears an unfocused press when the pointer is cancelled", () => {
    let state = updateActionInteractionState(
      createActionInteractionState(),
      "pointer-down",
    );
    state = updateActionInteractionState(state, "pointer-cancel");

    expect(
      resolveActionMicroInteractionState({
        interaction: state,
        disabled: false,
        selected: false,
      }),
    ).toBe("idle");
  });

  it("restores persistent focus after a cancelled press", () => {
    let state = updateActionInteractionState(
      createActionInteractionState(),
      "focus",
    );
    state = updateActionInteractionState(state, "pointer-down");
    state = updateActionInteractionState(state, "pointer-cancel");

    expect(
      resolveActionMicroInteractionState({
        interaction: state,
        disabled: false,
        selected: true,
      }),
    ).toBe("focus");
  });

  it("restores selected state after a cancelled unfocused press", () => {
    let state = updateActionInteractionState(
      createActionInteractionState(),
      "pointer-down",
    );
    state = updateActionInteractionState(state, "pointer-cancel");

    expect(
      resolveActionMicroInteractionState({
        interaction: state,
        disabled: false,
        selected: true,
      }),
    ).toBe("selected");
  });

  it("keeps disabled authoritative after pointer cancellation", () => {
    let state = updateActionInteractionState(
      createActionInteractionState(),
      "pointer-down",
    );
    state = updateActionInteractionState(state, "pointer-cancel");

    expect(
      resolveActionMicroInteractionState({
        interaction: state,
        disabled: true,
        selected: true,
      }),
    ).toBe("disabled");
  });

  it("clears a press proactively when the control disables mid-gesture", () => {
    let state = updateActionInteractionState(
      createActionInteractionState(),
      "focus",
    );
    state = beginActionPointerPress(state, 0);

    expect(
      resolveActionMicroInteractionState({
        interaction: state,
        disabled: true,
        selected: true,
      }),
    ).toBe("disabled");

    state = clearActionPointerState(state);

    expect(state).toEqual({
      focused: true,
      pointer: "idle",
      keyboardPress: "idle",
    });
    expect(
      resolveActionMicroInteractionState({
        interaction: state,
        disabled: false,
        selected: true,
      }),
    ).toBe("focus");
  });

  it("treats pointer-up as terminal cleanup before a later re-enable", () => {
    let state = beginActionPointerPress(createActionInteractionState(), 0);
    state = updateActionInteractionState(state, "pointer-up");

    expect(state.pointer).toBe("hover");
    expect(
      resolveActionMicroInteractionState({
        interaction: state,
        disabled: false,
        selected: true,
      }),
    ).toBe("hover");
  });

  it("starts keyboard press feedback only for native activation keys", () => {
    const focused = updateActionInteractionState(
      createActionInteractionState(),
      "focus",
    );

    for (const key of ["Enter", " ", "Spacebar"]) {
      const pressed = beginActionKeyboardPress(focused, key, false);
      expect(pressed.keyboardPress).not.toBe("idle");
      expect(
        resolveActionMicroInteractionState({
          interaction: pressed,
          disabled: false,
          selected: true,
        }),
      ).toBe("press");
    }

    for (const key of ["Escape", "a", ".", "ArrowRight"]) {
      expect(beginActionKeyboardPress(focused, key, false)).toBe(focused);
    }
  });

  it("does not start keyboard feedback when activation was default-prevented", () => {
    const focused = updateActionInteractionState(
      createActionInteractionState(),
      "focus",
    );

    expect(beginActionKeyboardPress(focused, "Enter", true)).toBe(focused);
    expect(beginActionKeyboardPress(focused, " ", true)).toBe(focused);
  });

  it("finishes only the matching keyboard activation key", () => {
    let state = updateActionInteractionState(
      createActionInteractionState(),
      "focus",
    );
    state = beginActionKeyboardPress(state, "Enter", false);

    expect(finishActionKeyboardPress(state, " ")).toBe(state);

    state = finishActionKeyboardPress(state, "Enter");
    expect(state.keyboardPress).toBe("idle");
    expect(
      resolveActionMicroInteractionState({
        interaction: state,
        disabled: false,
        selected: true,
      }),
    ).toBe("focus");
  });

  it("treats legacy Spacebar and modern Space as the same held key", () => {
    let state = beginActionKeyboardPress(
      createActionInteractionState(),
      "Spacebar",
      false,
    );

    expect(state.keyboardPress).toBe("space");
    state = finishActionKeyboardPress(state, " ");
    expect(state.keyboardPress).toBe("idle");
  });

  it("does not let a second activation key replace the held keyboard owner", () => {
    const enter = beginActionKeyboardPress(
      createActionInteractionState(),
      "Enter",
      false,
    );

    const second = beginActionKeyboardPress(enter, " ", false);
    expect(second).toBe(enter);
    expect(second.keyboardPress).toBe("enter");
  });

  it("clears keyboard press on blur while preserving pointer hover", () => {
    let state = updateActionInteractionState(
      createActionInteractionState(),
      "pointer-enter",
    );
    state = updateActionInteractionState(state, "focus");
    state = beginActionKeyboardPress(state, " ", false);
    state = updateActionInteractionState(state, "blur");

    expect(state).toEqual({
      focused: false,
      pointer: "hover",
      keyboardPress: "idle",
    });
    expect(
      resolveActionMicroInteractionState({
        interaction: state,
        disabled: false,
        selected: false,
      }),
    ).toBe("hover");
  });

  it("keeps pointer and keyboard press channels independent", () => {
    let state = beginActionPointerPress(createActionInteractionState(), 0);
    state = beginActionKeyboardPress(state, "Enter", false);

    state = updateActionInteractionState(state, "pointer-cancel");
    expect(state.pointer).toBe("idle");
    expect(state.keyboardPress).toBe("enter");
    expect(
      resolveActionMicroInteractionState({
        interaction: state,
        disabled: false,
        selected: false,
      }),
    ).toBe("press");

    state = finishActionKeyboardPress(state, "Enter");
    expect(
      resolveActionMicroInteractionState({
        interaction: state,
        disabled: false,
        selected: false,
      }),
    ).toBe("idle");
  });

  it("clears keyboard feedback proactively across dynamic disable", () => {
    let state = updateActionInteractionState(
      createActionInteractionState(),
      "focus",
    );
    state = beginActionKeyboardPress(state, "Enter", false);

    state = clearActionKeyboardPress(state);
    expect(state.keyboardPress).toBe("idle");
    expect(
      resolveActionMicroInteractionState({
        interaction: state,
        disabled: false,
        selected: true,
      }),
    ).toBe("focus");
  });

  it("keeps disabled authoritative over all transient state", () => {
    let state = createActionInteractionState();
    state = updateActionInteractionState(state, "focus");
    state = updateActionInteractionState(state, "pointer-down");

    expect(
      resolveActionMicroInteractionState({
        interaction: state,
        disabled: true,
        selected: true,
      }),
    ).toBe("disabled");
  });
});
