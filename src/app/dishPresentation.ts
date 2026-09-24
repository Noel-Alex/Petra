import type { DishRenderSnapshot, RenderField } from "../render/model";

export function defaultDishOverlayId(
  snapshot: DishRenderSnapshot,
): string | null {
  return (
    snapshot.fields.find((field) => field.kind === "antibiotic")?.id ??
    snapshot.fields[0]?.id ??
    null
  );
}

export function resolveDishOverlay(
  snapshot: DishRenderSnapshot,
  requestedId: string | null,
): RenderField | null {
  if (requestedId !== null) {
    const requested = snapshot.fields.find((field) => field.id === requestedId);
    if (requested !== undefined) return requested;
  }

  const fallbackId = defaultDishOverlayId(snapshot);
  if (fallbackId === null) return null;
  return snapshot.fields.find((field) => field.id === fallbackId) ?? null;
}


export type DishOverlaySelection =
  | Readonly<{ readonly mode: "automatic" }>
  | Readonly<{ readonly mode: "none" }>
  | Readonly<{ readonly mode: "field"; readonly fieldId: string }>;

export interface ResolvedDishOverlaySelection {
  readonly selection: DishOverlaySelection;
  readonly field: RenderField | null;
  /** Exact value to send across the React -> Pixi presentation transaction. */
  readonly rendererOverlayId: string | null;
}

export const AUTOMATIC_DISH_OVERLAY: DishOverlaySelection = Object.freeze({
  mode: "automatic",
});

export const NO_DISH_OVERLAY: DishOverlaySelection = Object.freeze({
  mode: "none",
});

export function dishOverlayFieldSelection(fieldId: string): DishOverlaySelection {
  const normalized = fieldId.trim();
  if (normalized.length === 0) {
    throw new Error("dish overlay field id must be non-empty");
  }
  if (normalized !== fieldId) {
    throw new Error("dish overlay field id must be trimmed");
  }
  return Object.freeze({ mode: "field", fieldId: normalized });
}

/**
 * Reconciles user presentation intent with a new immutable render snapshot.
 *
 * Explicit none is sticky. Automatic remains automatic. A specifically selected
 * field that disappears falls back to automatic rather than becoming an
 * ambiguous null/no-overlay state. If that old field later reappears it is not
 * silently re-selected; the user is now in automatic mode.
 */
export function reconcileDishOverlaySelection(
  snapshot: DishRenderSnapshot,
  selection: DishOverlaySelection,
): DishOverlaySelection {
  switch (selection.mode) {
    case "automatic":
      return AUTOMATIC_DISH_OVERLAY;
    case "none":
      return NO_DISH_OVERLAY;
    case "field": {
      const normalized = dishOverlayFieldSelection(selection.fieldId);
      return snapshot.fields.some((field) => field.id === normalized.fieldId)
        ? normalized
        : AUTOMATIC_DISH_OVERLAY;
    }
  }
}

/**
 * Resolves one unambiguous overlay selection for both DOM presentation and Pixi.
 * Automatic may resolve to null only when the snapshot has no fields;
 * explicit none always resolves to null even when fields exist.
 */
export function resolveDishOverlaySelection(
  snapshot: DishRenderSnapshot,
  selection: DishOverlaySelection,
): ResolvedDishOverlaySelection {
  const reconciled = reconcileDishOverlaySelection(snapshot, selection);

  if (reconciled.mode === "none") {
    return {
      selection: reconciled,
      field: null,
      rendererOverlayId: null,
    };
  }

  const fieldId =
    reconciled.mode === "automatic"
      ? defaultDishOverlayId(snapshot)
      : reconciled.fieldId;
  const field =
    fieldId === null
      ? null
      : snapshot.fields.find((candidate) => candidate.id === fieldId) ?? null;

  return {
    selection: reconciled,
    field,
    rendererOverlayId: field?.id ?? null,
  };
}
