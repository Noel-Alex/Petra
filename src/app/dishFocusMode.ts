import type { RuntimeUiStatus } from "./runtimeView";

export type DishFocusMode = "ambient" | "focused";

export interface DishFocusModeInput {
  readonly status: RuntimeUiStatus;
  readonly playing: boolean;
}

/**
 * Presentation-only focus policy for the experiment shell.
 *
 * Focus mode follows explicit playback intent rather than request phase so the
 * dish does not expand/collapse at the worker cadence while a running request
 * alternates between ready and pending. Errors/unavailable runtime always
 * return to ambient chrome.
 */
export function resolveDishFocusMode({
  status,
  playing,
}: DishFocusModeInput): DishFocusMode {
  if (!playing) return "ambient";
  return status === "ready" || status === "pending" ? "focused" : "ambient";
}
