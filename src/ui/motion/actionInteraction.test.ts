import { describe, expect, it } from "vitest";

import {
  beginActionPointerPress,
  clearActionPointerState,
  createActionInteractionState,
  resolveActionMicroInteractionState,
  updateActionInteractionState,
} from "./actionInteraction";

describe("PetraAction interaction precedence", () => {
  it("starts press feedback only for the primary activation button", () => {
    const idle = createActionInteractionState();
    const primary = beginActionPointerPress(idle, 0);

    expect(primary).toEqual({ focused: false, pointer: "press" });
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

    expect(state).toEqual({ focused: true, pointer: "idle" });
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
