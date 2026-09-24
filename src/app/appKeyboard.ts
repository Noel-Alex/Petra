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

const BLOCKED_ROLES = new Set([
  "button",
  "slider",
  "spinbutton",
  "textbox",
  "combobox",
  "listbox",
  "menuitem",
  "option",
  "switch",
  "tab",
]);

/**
 * Resolve an app-level keyboard event without stealing keys from focused
 * controls. Child surfaces may consume/prevent an event before it reaches
 * this planner.
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

/**
 * Global playback shortcuts are allowed only from non-interactive surfaces.
 * This deliberately protects more than text editing: native controls and
 * ARIA widgets keep their own keyboard semantics.
 */
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

  if (
    tagName === "a" &&
    candidate.getAttribute?.("href") !== null &&
    candidate.getAttribute?.("href") !== undefined
  ) {
    return true;
  }

  const role =
    candidate.getAttribute?.("role")?.trim().toLowerCase() ?? "";

  return BLOCKED_ROLES.has(role);
}
