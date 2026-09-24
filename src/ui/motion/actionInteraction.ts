import type { MicroInteractionState } from "./microInteractions";

export type ActionPointerState = "idle" | "hover" | "press";

export interface ActionInteractionState {
  readonly focused: boolean;
  readonly pointer: ActionPointerState;
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
  return { focused: false, pointer: "idle" };
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
 * Clears pointer-only interaction state without erasing persistent focus.
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

export function updateActionInteractionState(
  state: ActionInteractionState,
  event: ActionInteractionEvent,
): ActionInteractionState {
  switch (event) {
    case "focus":
      return { ...state, focused: true };
    case "blur":
      return { ...state, focused: false };
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
 * Resolves persistent focus independently from transient pointer feedback.
 *
 * Precedence is disabled > press > focus > hover > selected > idle. A press may
 * temporarily compress a focused control, but pointer movement cannot erase the
 * focused semantic state; focus resumes as soon as the press ends.
 */
export function resolveActionMicroInteractionState(args: {
  readonly interaction: ActionInteractionState;
  readonly disabled: boolean;
  readonly selected: boolean;
}): MicroInteractionState {
  if (args.disabled) return "disabled";
  if (args.interaction.pointer === "press") return "press";
  if (args.interaction.focused) return "focus";
  if (args.interaction.pointer === "hover") return "hover";
  if (args.selected) return "selected";
  return "idle";
}
