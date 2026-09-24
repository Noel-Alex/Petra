import type { MicroInteractionState } from "./microInteractions";

export type ActionPointerState = "idle" | "hover" | "press";
export type ActionKeyboardPressState = "idle" | "enter" | "space";

export interface ActionInteractionState {
  readonly focused: boolean;
  readonly pointer: ActionPointerState;
  readonly keyboardPress: ActionKeyboardPressState;
}

export type ActionInteractionEvent =
  | "focus"
  | "blur"
  | "pointer-enter"
  | "pointer-leave"
  | "pointer-down"
  | "pointer-up"
  | "pointer-cancel";

export function createActionInteractionState(): ActionInteractionState {
  return { focused: false, pointer: "idle", keyboardPress: "idle" };
}

/**
 * Starts native-style pointer press feedback only for the primary activation
 * button. Returning the original state for secondary/auxiliary buttons keeps
 * right-click/context-menu input outside Petra's decorative press authority.
 */
export function beginActionPointerPress(
  state: ActionInteractionState,
  button: number,
): ActionInteractionState {
  if (button !== 0) return state;
  return updateActionInteractionState(state, "pointer-down");
}

/**
 * Starts keyboard press feedback for native button activation keys only.
 *
 * This helper is presentation-only: callers/native DOM activation remain
 * authoritative. A default-prevented keydown never enters Petra press feedback,
 * and an already-held activation key cannot be replaced by a second key.
 */
export function beginActionKeyboardPress(
  state: ActionInteractionState,
  key: string,
  defaultPrevented: boolean,
): ActionInteractionState {
  if (defaultPrevented) return state;

  const keyboardPress = keyboardPressForKey(key);
  if (keyboardPress === null) return state;
  if (state.keyboardPress !== "idle") return state;

  return { ...state, keyboardPress };
}

/**
 * Finishes only the keyboard press that owns the active presentation.
 * Unrelated keyup events cannot cancel another held activation key.
 */
export function finishActionKeyboardPress(
  state: ActionInteractionState,
  key: string,
): ActionInteractionState {
  const keyboardPress = keyboardPressForKey(key);
  if (
    keyboardPress === null ||
    state.keyboardPress === "idle" ||
    state.keyboardPress !== keyboardPress
  ) {
    return state;
  }

  return { ...state, keyboardPress: "idle" };
}

/**
 * Clears pointer-only interaction state without erasing persistent focus or
 * keyboard press state.
 *
 * Dynamic disable paths use this proactively because a native disabled control
 * is not guaranteed to deliver the pointer-up that would otherwise finish a
 * press sequence.
 */
export function clearActionPointerState(
  state: ActionInteractionState,
): ActionInteractionState {
  return state.pointer === "idle" ? state : { ...state, pointer: "idle" };
}

/**
 * Clears keyboard-only press feedback without disturbing pointer/focus state.
 * Blur and dynamic disable paths use this so a held key cannot leave a stale
 * compression cue behind.
 */
export function clearActionKeyboardPress(
  state: ActionInteractionState,
): ActionInteractionState {
  return state.keyboardPress === "idle"
    ? state
    : { ...state, keyboardPress: "idle" };
}

export function updateActionInteractionState(
  state: ActionInteractionState,
  event: ActionInteractionEvent,
): ActionInteractionState {
  switch (event) {
    case "focus":
      return { ...state, focused: true };
    case "blur":
      return clearActionKeyboardPress({ ...state, focused: false });
    case "pointer-enter":
      return { ...state, pointer: "hover" };
    case "pointer-leave":
    case "pointer-cancel":
      return clearActionPointerState(state);
    case "pointer-down":
      return { ...state, pointer: "press" };
    case "pointer-up":
      return { ...state, pointer: "hover" };
  }
}

/**
 * Resolves persistent focus independently from transient pointer/keyboard
 * feedback.
 *
 * Precedence is disabled > press > focus > hover > selected > idle. Pointer and
 * keyboard presses share the same semantic presentation without sharing input
 * ownership, so cancelling one channel cannot erase the other.
 */
export function resolveActionMicroInteractionState(args: {
  readonly interaction: ActionInteractionState;
  readonly disabled: boolean;
  readonly selected: boolean;
}): MicroInteractionState {
  if (args.disabled) return "disabled";
  if (
    args.interaction.pointer === "press" ||
    args.interaction.keyboardPress !== "idle"
  ) {
    return "press";
  }
  if (args.interaction.focused) return "focus";
  if (args.interaction.pointer === "hover") return "hover";
  if (args.selected) return "selected";
  return "idle";
}

function keyboardPressForKey(
  key: string,
): Exclude<ActionKeyboardPressState, "idle"> | null {
  if (key === "Enter") return "enter";
  if (key === " " || key === "Spacebar") return "space";
  return null;
}
