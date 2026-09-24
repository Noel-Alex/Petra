import {
  validateRenderSnapshot,
  type DishRenderSnapshot,
} from "../model";

export interface SnapshotOverlayState {
  readonly snapshot: DishRenderSnapshot | null;
  readonly overlayId: string | null;
}

export interface ResolvedSnapshotOverlayUpdate {
  readonly snapshot: DishRenderSnapshot;
  readonly overlayId: string | null;
}

/**
 * Resolve one coherent snapshot + overlay presentation transaction.
 *
 * Overlay validity is checked against the incoming snapshot. A selection that
 * was valid in the current snapshot but disappears in the incoming snapshot is
 * cleared; a genuinely unknown requested overlay remains an explicit error.
 */
export function resolveSnapshotOverlayUpdate(
  current: SnapshotOverlayState,
  nextSnapshot: DishRenderSnapshot,
  requestedOverlayId: string | null,
): ResolvedSnapshotOverlayUpdate {
  validateRenderSnapshot(nextSnapshot);

  if (
    requestedOverlayId === null ||
    nextSnapshot.fields.some((field) => field.id === requestedOverlayId)
  ) {
    return { snapshot: nextSnapshot, overlayId: requestedOverlayId };
  }

  const previousSelectionDisappeared =
    current.snapshot !== null &&
    current.overlayId === requestedOverlayId &&
    current.snapshot.fields.some((field) => field.id === requestedOverlayId);

  if (previousSelectionDisappeared) {
    return { snapshot: nextSnapshot, overlayId: null };
  }

  throw new RangeError(`unknown render overlay: ${requestedOverlayId}`);
}
