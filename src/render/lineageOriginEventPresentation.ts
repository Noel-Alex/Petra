import type { DishRenderSnapshot, RenderEvent } from "./model";

export const LINEAGE_ORIGIN_EVENT_PRESENTATION_PLAN_VERSION = 1 as const;
export const LINEAGE_ORIGIN_RENDER_EVENT_KIND = "lineage-created" as const;

export interface LineageOriginEventPresentationPolicy {
  /**
   * Presentation-only marker budget. Complete scientific lineage/event history
   * remains outside this plan; this cap bounds drawable point accents.
   */
  readonly maxVisibleMarkers: number;
}

export interface LineageOriginEventPresentationPlan {
  readonly version: typeof LINEAGE_ORIGIN_EVENT_PRESENTATION_PLAN_VERSION;
  readonly snapshotId: string;
  readonly samplingIdentity: string;
  /** All point events carried by the already-admitted dish transaction. */
  readonly sourceEventCount: number;
  /** Source events eligible for this exact lineage-origin presentation. */
  readonly eligibleMarkerCount: number;
  /** Eligible historical markers omitted only from this drawable plan. */
  readonly omittedMarkerCount: number;
  /**
   * Newest eligible lineage-origin markers retained in their original source
   * order. Every record is detached from the source DishRenderSnapshot.
   */
  readonly markers: readonly RenderEvent[];
}

/**
 * Builds a bounded lineage-origin marker plan from an already-admitted dish
 * snapshot.
 *
 * validateRenderSnapshot(...) remains the renderer admission boundary. This
 * helper deliberately does not infer mutation biology or re-read grid/density
 * state: it selects only the exact point-event kind already projected from
 * replay-critical lineage origin authority, applies an explicit history
 * budget, and detaches the retained marker records.
 *
 * Unknown/future point-event kinds are not styled by this plan. They remain in
 * the source transaction for a separately reviewed presentation contract.
 */
export function prepareLineageOriginEventPresentation(
  snapshot: Pick<
    DishRenderSnapshot,
    "snapshotId" | "samplingIdentity" | "events"
  >,
  policy: LineageOriginEventPresentationPolicy,
): LineageOriginEventPresentationPlan {
  assertNonEmptyText("snapshotId", snapshot.snapshotId);
  assertNonEmptyText("samplingIdentity", snapshot.samplingIdentity);
  assertPositiveSafeInteger("maxVisibleMarkers", policy.maxVisibleMarkers);

  const eligible = snapshot.events.filter(
    (event) => event.kind === LINEAGE_ORIGIN_RENDER_EVENT_KIND,
  );
  const firstVisible = Math.max(
    0,
    eligible.length - policy.maxVisibleMarkers,
  );
  const markers = eligible.slice(firstVisible).map(cloneRenderEvent);

  return Object.freeze({
    version: LINEAGE_ORIGIN_EVENT_PRESENTATION_PLAN_VERSION,
    snapshotId: snapshot.snapshotId,
    samplingIdentity: snapshot.samplingIdentity,
    sourceEventCount: snapshot.events.length,
    eligibleMarkerCount: eligible.length,
    omittedMarkerCount: firstVisible,
    markers: Object.freeze(markers),
  });
}

function cloneRenderEvent(event: RenderEvent): RenderEvent {
  return Object.freeze({
    id: event.id,
    kind: event.kind,
    simulationTimeHours: event.simulationTimeHours,
    x: event.x,
    y: event.y,
    ...(event.lineageId === undefined ? {} : { lineageId: event.lineageId }),
    label: event.label,
  });
}

function assertPositiveSafeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(name + " must be a positive safe integer");
  }
}

function assertNonEmptyText(name: string, value: string): void {
  if (value.length === 0) {
    throw new TypeError(name + " must be non-empty text");
  }
}
