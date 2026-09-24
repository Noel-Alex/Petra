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
      return { ...state, pointer: "idle" };
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
