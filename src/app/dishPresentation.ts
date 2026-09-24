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
