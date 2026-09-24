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
 * Resolves one coherent presentation transaction against the incoming snapshot.
 *
 * A newly requested overlay must exist on the incoming snapshot. If the caller
 * is merely carrying forward the renderer's previous valid selection and that
 * field disappears in the new snapshot, the selection clears rather than
 * turning an ordinary snapshot transition into an exception.
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
