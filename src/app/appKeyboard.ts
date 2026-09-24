import type { ExperimentControlAction } from "../ui/experimentControls";
import { actionForShortcut } from "../ui/keyboard";
import { shouldCloseSourcesOnEscape } from "./sourcesKeyboard";

export interface AppKeyboardRequest {
  readonly sourcesOpen: boolean;
  readonly key: string;
  readonly defaultPrevented: boolean;
  readonly target: unknown;
}

export type AppKeyboardPlan =
  | { readonly type: "none" }
  | { readonly type: "close-sources" }
  | {
      readonly type: "dispatch";
      readonly action: ExperimentControlAction;
    };

export interface AppShortcutAvailability {
  readonly playing: boolean;
  readonly canTogglePlayback: boolean;
  readonly canChangeSpeed: boolean;
  readonly canStep: boolean;
}

/**
 * Keep global shortcuts inside the same runtime-availability envelope as the
 * visible controls. Keyboard input must not become a second permission path.
 */
export function canDispatchAppShortcut(
  action: ExperimentControlAction,
  availability: AppShortcutAvailability,
): boolean {
  switch (action.type) {
    case "toggle-play":
      return availability.canTogglePlayback;
    case "pause":
      return availability.playing;
    case "set-speed":
      return availability.canChangeSpeed;
    case "step":
      return availability.canStep;
    default:
      return false;
  }
}

const BLOCKED_ROLES = new Set([
  "button",
  "checkbox",
  "combobox",
  "link",
  "listbox",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "radio",
  "slider",
  "spinbutton",
  "switch",
  "tab",
  "textbox",
  "treeitem",
]);

/**
 * App-level keyboard planner.
 *
 * Child surfaces keep first refusal through defaultPrevented/propagation.
 * The Sources disclosure owns Escape before global playback. Other playback
 * shortcuts are admitted only from non-interactive presentation surfaces.
 */
export function planAppKeyboardShortcut(
  request: AppKeyboardRequest,
): AppKeyboardPlan {
  if (request.defaultPrevented) {
    return { type: "none" };
  }

  if (
    shouldCloseSourcesOnEscape({
      open: request.sourcesOpen,
      key: request.key,
      defaultPrevented: false,
      target: request.target,
    })
  ) {
    return { type: "close-sources" };
  }

  if (isGlobalShortcutBlockedTarget(request.target)) {
    return { type: "none" };
  }

  const action = actionForShortcut(request.key, {
    editableTarget: false,
  });

  return action === null
    ? { type: "none" }
    : { type: "dispatch", action };
}

export function isGlobalShortcutBlockedTarget(target: unknown): boolean {
  if (target === null || typeof target !== "object") {
    return false;
  }

  const candidate = target as {
    readonly tagName?: unknown;
    readonly isContentEditable?: unknown;
    getAttribute?(name: string): string | null;
  };

  if (candidate.isContentEditable === true) {
    return true;
  }

  const tagName =
    typeof candidate.tagName === "string"
      ? candidate.tagName.toLowerCase()
      : "";

  if (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    tagName === "button" ||
    tagName === "summary"
  ) {
    return true;
  }

  const href = candidate.getAttribute?.("href");
  if (tagName === "a" && href !== null && href !== undefined) {
    return true;
  }

  const roles =
    candidate.getAttribute?.("role")?.trim().toLowerCase().split(/\s+/) ?? [];
  return roles.some((role) => BLOCKED_ROLES.has(role));
}
