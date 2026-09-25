import type { DishRenderSnapshot } from "./model";

export const DISH_RENDER_PAYLOAD_ESTIMATE_VERSION = 2 as const;

export interface DishRenderPayloadEstimate {
  readonly version: typeof DISH_RENDER_PAYLOAD_ESTIMATE_VERSION;
  readonly gridCellCount: number;
  readonly fieldCount: number;
  readonly lineageCount: number;
  readonly eventCount: number;
  readonly acceptedInterventionFootprintCount: number;
  /** Exact logical bytes of the Uint8 dish-mask view. */
  readonly dishMaskViewBytes: number;
  /** Exact logical bytes of the aggregate Float32 biomass view. */
  readonly biomassViewBytes: number;
  /** Exact logical bytes across renderer field-value Float32 references. */
  readonly fieldValueReferenceBytes: number;
  /** Exact logical bytes across per-lineage density Float32 references. */
  readonly lineageDensityReferenceBytes: number;
  /**
   * Exact sum of typed-array view byte lengths at every snapshot property.
   * If the same view is referenced twice (for example aggregate biomass is
   * also exposed as a biomass overlay field), this intentionally counts both
   * logical channel references.
   */
  readonly typedArrayReferenceBytes: number;
  /** Exact logical bytes across distinct typed-array view objects. */
  readonly uniqueTypedArrayViewBytes: number;
  /**
   * Exact byteLength sum across distinct backing buffers reachable from the
   * typed-array views. This captures aliasing and subarray backing capacity,
   * but still is not browser structured-clone framing or transfer cost.
   */
  readonly uniqueBackingBufferBytes: number;
  /**
   * Reproducible UTF-8 byte size of the non-typed-array metadata projected to
   * JSON. This is a metadata-size proxy, not browser structured-clone framing
   * or JavaScript heap usage.
   */
  readonly metadataJsonUtf8Bytes: number;
  /**
   * uniqueBackingBufferBytes + metadataJsonUtf8Bytes. Use only as an
   * application-payload sizing estimate; it is not measured Worker transport
   * bytes, bandwidth, receiver deserialization cost, or GPU memory.
   */
  readonly estimatedApplicationPayloadBytes: number;
}

/**
 * Estimate the detached renderer-facing application payload without traversing
 * every scalar value. The snapshot is expected to have passed the normal render
 * admission gate already; this helper deliberately avoids re-validating arrays
 * so profiling does not add O(cells × channels) scientific-frame work.
 */
export function estimateDishRenderSnapshotPayload(
  snapshot: DishRenderSnapshot,
): DishRenderPayloadEstimate {
  const views = collectTypedArrayViews(snapshot);
  const dishMaskViewBytes = snapshot.dishMask.byteLength;
  const biomassViewBytes = snapshot.biomass.byteLength;
  const fieldValueReferenceBytes = snapshot.fields.reduce(
    (total, field) => total + field.values.byteLength,
    0,
  );
  const lineageDensityReferenceBytes = snapshot.lineages.reduce(
    (total, lineage) => total + lineage.density.byteLength,
    0,
  );
  const typedArrayReferenceBytes =
    dishMaskViewBytes +
    biomassViewBytes +
    fieldValueReferenceBytes +
    lineageDensityReferenceBytes;

  const uniqueViews = new Set<ArrayBufferView>();
  const uniqueBuffers = new Set<ArrayBufferLike>();
  let uniqueTypedArrayViewBytes = 0;
  let uniqueBackingBufferBytes = 0;
  for (const view of views) {
    if (!uniqueViews.has(view)) {
      uniqueViews.add(view);
      uniqueTypedArrayViewBytes += view.byteLength;
    }
    if (!uniqueBuffers.has(view.buffer)) {
      uniqueBuffers.add(view.buffer);
      uniqueBackingBufferBytes += view.buffer.byteLength;
    }
  }

  const metadataJson = JSON.stringify({
    snapshotId: snapshot.snapshotId,
    samplingIdentity: snapshot.samplingIdentity,
    simulationTimeHours: snapshot.simulationTimeHours,
    gridWidth: snapshot.gridWidth,
    gridHeight: snapshot.gridHeight,
    fields: snapshot.fields.map((field) => ({
      id: field.id,
      kind: field.kind,
      label: field.label,
      unit: field.unit,
      width: field.width,
      height: field.height,
      rangeMode: field.rangeMode ?? null,
      minimum: field.minimum,
      maximum: field.maximum,
    })),
    lineages: snapshot.lineages.map((lineage) => ({
      id: lineage.id,
      label: lineage.label,
      appearanceToken: lineage.appearanceToken,
      patternToken: lineage.patternToken,
      organismPresentation: lineage.organismPresentation ?? null,
    })),
    acceptedInterventionFootprints:
      snapshot.acceptedInterventionFootprints ?? null,
    events: snapshot.events,
  });
  if (metadataJson === undefined) {
    throw new TypeError("render payload metadata must be JSON serializable");
  }
  const metadataJsonUtf8Bytes = utf8ByteLength(metadataJson);

  return Object.freeze({
    version: DISH_RENDER_PAYLOAD_ESTIMATE_VERSION,
    gridCellCount: snapshot.gridWidth * snapshot.gridHeight,
    fieldCount: snapshot.fields.length,
    lineageCount: snapshot.lineages.length,
    eventCount: snapshot.events.length,
    acceptedInterventionFootprintCount:
      snapshot.acceptedInterventionFootprints?.length ?? 0,
    dishMaskViewBytes,
    biomassViewBytes,
    fieldValueReferenceBytes,
    lineageDensityReferenceBytes,
    typedArrayReferenceBytes,
    uniqueTypedArrayViewBytes,
    uniqueBackingBufferBytes,
    metadataJsonUtf8Bytes,
    estimatedApplicationPayloadBytes:
      uniqueBackingBufferBytes + metadataJsonUtf8Bytes,
  });
}

function collectTypedArrayViews(
  snapshot: DishRenderSnapshot,
): readonly ArrayBufferView[] {
  return [
    snapshot.dishMask,
    snapshot.biomass,
    ...snapshot.fields.map((field) => field.values),
    ...snapshot.lineages.map((lineage) => lineage.density),
  ];
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
