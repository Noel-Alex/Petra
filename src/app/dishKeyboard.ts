export type DishEscapeAction = "cancel-tool" | "reset-overview";

export interface DishEscapeContext {
  readonly editableTarget: boolean;
  readonly dishOwnsFocus: boolean;
  readonly interventionToolCanCancel: boolean;
}

/**
 * Escape priority local to the dish surface.
 *
 * Active intervention tools get first refusal. The dish may reset its
 * presentation-only camera only while it owns keyboard focus. Global playback
 * Escape semantics remain untouched outside this surface.
 */
export function dishEscapeActionForKey(
  key: string,
  context: DishEscapeContext,
): DishEscapeAction | null {
  if (key !== "Escape" || context.editableTarget) return null;
  if (context.interventionToolCanCancel) return "cancel-tool";
  if (context.dishOwnsFocus) return "reset-overview";
  return null;
}
