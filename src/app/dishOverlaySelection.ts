import type { DishRenderSnapshot, RenderField } from "../render/model";
import { defaultDishOverlayId } from "./dishPresentation";

export type DishOverlaySelection =
  | Readonly<{ mode: "automatic" }>
  | Readonly<{ mode: "none" }>
  | Readonly<{ mode: "field"; fieldId: string }>;

export type DishOverlayResolutionReason =
  | "automatic"
  | "none"
  | "field"
  | "field-missing";

export interface DishOverlayResolution {
  /** The selection requested by presentation state before snapshot reconciliation. */
  readonly requested: DishOverlaySelection;
  /**
   * The selection identity callers should persist after reconciliation.
   *
   * A missing explicit field becomes automatic so a later field reappearance
   * cannot silently resurrect an old selection. Explicit none remains none.
   */
  readonly effective: DishOverlaySelection;
  readonly field: RenderField | null;
  readonly reason: DishOverlayResolutionReason;
}

export const AUTOMATIC_DISH_OVERLAY: DishOverlaySelection = Object.freeze({
  mode: "automatic",
});

export const NO_DISH_OVERLAY: DishOverlaySelection = Object.freeze({
  mode: "none",
});

export function selectDishOverlayField(fieldId: string): DishOverlaySelection {
  const normalized = requireFieldId(fieldId);
  return { mode: "field", fieldId: normalized };
}

/**
 * Resolves presentation-only overlay selection without changing scientific data.
 *
 * Automatic and none intentionally remain different identities:
 * - automatic follows Petra's deterministic default field policy;
 * - none means the user explicitly requested no field overlay.
 *
 * If a specifically selected field disappears, the selection reconciles to
 * automatic. Callers should retain effective, not the stale request.
 */
export function resolveDishOverlaySelection(
  snapshot: DishRenderSnapshot,
  requested: DishOverlaySelection,
): DishOverlayResolution {
  if (requested.mode === "none") {
    return {
      requested,
      effective: NO_DISH_OVERLAY,
      field: null,
      reason: "none",
    };
  }

  if (requested.mode === "field") {
    const fieldId = requireFieldId(requested.fieldId);
    const field = snapshot.fields.find((candidate) => candidate.id === fieldId);
    if (field !== undefined) {
      const effective = selectDishOverlayField(fieldId);
      return {
        requested,
        effective,
        field,
        reason: "field",
      };
    }

    return automaticResolution(snapshot, requested, "field-missing");
  }

  return automaticResolution(snapshot, requested, "automatic");
}

function automaticResolution(
  snapshot: DishRenderSnapshot,
  requested: DishOverlaySelection,
  reason: "automatic" | "field-missing",
): DishOverlayResolution {
  const defaultId = defaultDishOverlayId(snapshot);
  const field =
    defaultId === null
      ? null
      : snapshot.fields.find((candidate) => candidate.id === defaultId) ?? null;

  return {
    requested,
    effective: AUTOMATIC_DISH_OVERLAY,
    field,
    reason,
  };
}

function requireFieldId(fieldId: string): string {
  const normalized = fieldId.trim();
  if (normalized.length === 0) {
    throw new RangeError("dish overlay field id must be non-empty");
  }
  return normalized;
}
