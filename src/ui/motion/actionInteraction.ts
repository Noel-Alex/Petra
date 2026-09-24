import type { MicroInteractionState } from "./microInteractions";

export type ActionPointerState = "idle" | "hover" | "press";
export type ActionKeyboardActivation = "enter" | "space";

export interface ActionInteractionState {
  readonly focused: boolean;
  readonly pointer: ActionPointerState;
  readonly keyboardPress: ActionKeyboardActivation | null;
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
  return { focused: false, pointer: "idle", keyboardPress: null };
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
 * Starts presentation-only keyboard press feedback for native button activation
 * keys. Callers retain native activation authority: this helper never prevents
 * default or synthesizes a click.
 */
export function beginActionKeyboardPress(
  state: ActionInteractionState,
  key: string,
  defaultPrevented: boolean,
): ActionInteractionState {
  if (defaultPrevented) return state;
  const activation = actionKeyboardActivationForKey(key);
  if (activation === null || state.keyboardPress === activation) return state;
  return { ...state, keyboardPress: activation };
}

/**
 * Ends only the keyboard press that matches the activation key that started it.
 * Pointer press state is deliberately independent.
 */
export function endActionKeyboardPress(
  state: ActionInteractionState,
  key: string,
): ActionInteractionState {
  const activation = actionKeyboardActivationForKey(key);
  if (activation === null || state.keyboardPress !== activation) return state;
  return { ...state, keyboardPress: null };
}

/**
 * Clears pointer-only interaction state without erasing persistent focus or an
 * independent keyboard press.
 */
export function clearActionPointerState(
  state: ActionInteractionState,
): ActionInteractionState {
  return state.pointer === "idle" ? state : { ...state, pointer: "idle" };
}

export function clearActionKeyboardPress(
  state: ActionInteractionState,
): ActionInteractionState {
  return state.keyboardPress === null
    ? state
    : { ...state, keyboardPress: null };
}

/**
 * Dynamic disabling is a terminal boundary for all transient presentation
 * feedback. Persistent focus remains separate so re-enabling cannot resurrect
 * a stale pointer or keyboard compression.
 */
export function clearActionTransientState(
  state: ActionInteractionState,
): ActionInteractionState {
  const pointerCleared = clearActionPointerState(state);
  return clearActionKeyboardPress(pointerCleared);
}

export function updateActionInteractionState(
  state: ActionInteractionState,
  event: ActionInteractionEvent,
): ActionInteractionState {
  switch (event) {
    case "focus":
      return { ...state, focused: true };
    case "blur":
      return { ...state, focused: false, keyboardPress: null };
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
 * Resolves persistent focus independently from transient input feedback.
 *
 * Precedence is disabled > press > focus > hover > selected > idle. Pointer and
 * keyboard presses are independent transient channels but intentionally share
 * the same semantic press treatment.
 */
export function resolveActionMicroInteractionState(args: {
  readonly interaction: ActionInteractionState;
  readonly disabled: boolean;
  readonly selected: boolean;
}): MicroInteractionState {
  if (args.disabled) return "disabled";
  if (
    args.interaction.pointer === "press" ||
    args.interaction.keyboardPress !== null
  ) {
    return "press";
  }
  if (args.interaction.focused) return "focus";
  if (args.interaction.pointer === "hover") return "hover";
  if (args.selected) return "selected";
  return "idle";
}

function actionKeyboardActivationForKey(
  key: string,
): ActionKeyboardActivation | null {
  if (key === "Enter") return "enter";
  if (key === " " || key === "Spacebar") return "space";
  return null;
}
