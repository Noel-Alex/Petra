export interface DishEscapeFirstRefusalContext {
  readonly defaultPrevented: boolean;
  readonly editableTarget: boolean;
}

export interface DishEscapeContext {
  readonly defaultPrevented: boolean;
  readonly editableTarget: boolean;
  readonly higherPriorityConsumed: boolean;
  readonly renderEnabled: boolean;
}

export type DishEscapeAction = "reset-overview";

/**
 * Determines whether plain Escape may be offered to a higher-priority
 * presentation owner before the dish camera fallback is considered.
 *
 * Renderer availability is deliberately not part of this decision: an active
 * tool or shell disclosure may still own Escape while the dish is unavailable.
 */
export function dishEscapeAllowsFirstRefusal(
  key: string,
  context: DishEscapeFirstRefusalContext,
): boolean {
  if (key !== "Escape") return false;
  if (context.defaultPrevented) return false;
  if (context.editableTarget) return false;
  return true;
}

/**
 * Resolve Escape only for the dish presentation layer.
 *
 * Active tools and editable controls get first refusal. This planner never
 * emits simulator commands; it only decides whether the camera may reset.
 */
export function dishEscapeAction(
  key: string,
  context: DishEscapeContext,
): DishEscapeAction | null {
  if (key !== "Escape") return null;
  if (!context.renderEnabled) return null;
  if (context.higherPriorityConsumed) return null;
  if (context.defaultPrevented) return null;
  if (context.editableTarget) return null;
  return "reset-overview";
}
