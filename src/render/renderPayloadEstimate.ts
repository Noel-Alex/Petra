import type { DishRenderSnapshot } from "./model";

export const DISH_RENDER_PAYLOAD_ESTIMATE_VERSION = 1 as const;

export interface DishRenderPayloadEstimate {
  readonly version: typeof DISH_RENDER_PAYLOAD_ESTIMATE_VERSION;
  readonly gridCellCount: number;
  readonly fieldCount: number;
  readonly lineageCount: number;
  readonly eventCount: number;
  readonly acceptedInterventionFootprintCount: number;
  /** Exact logical bytes of the Uint8 dish-mask view. */
  readonly dishMaskBytes: number;
  /** Exact logical bytes of the aggregate Float32 biomass view. */
  readonly biomassBytes: number;
  /** Exact logical bytes across renderer field-value Float32 views. */
  readonly fieldValueBytes: number;
  /** Exact logical bytes across per-lineage density Float32 views. */
  readonly lineageDensityBytes: number;
  /** Exact sum of the typed scientific/presentation channel view byte lengths. */
  readonly typedArrayBytes: number;
  /**
   * Reproducible UTF-8 byte size of the non-typed-array metadata projected to
   * JSON. This is a metadata-size proxy, not browser structured-clone framing
   * or JavaScript heap usage.
   */
  readonly metadataJsonUtf8Bytes: number;
  /**
   * typedArrayBytes + metadataJsonUtf8Bytes. Use only as an application-payload
   * sizing estimate; it is not measured Worker transport bytes, bandwidth, or
   * receiver deserialization cost.
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
  const dishMaskBytes = snapshot.dishMask.byteLength;
  const biomassBytes = snapshot.biomass.byteLength;
  const fieldValueBytes = snapshot.fields.reduce(
    (total, field) => total + field.values.byteLength,
    0,
  );
  const lineageDensityBytes = snapshot.lineages.reduce(
    (total, lineage) => total + lineage.density.byteLength,
    0,
  );
  const typedArrayBytes =
    dishMaskBytes + biomassBytes + fieldValueBytes + lineageDensityBytes;

  const metadataJsonUtf8Bytes = utf8ByteLength(
    JSON.stringify({
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
      })),
      acceptedInterventionFootprints:
        snapshot.acceptedInterventionFootprints ?? null,
      events: snapshot.events,
    }),
  );

  return Object.freeze({
    version: DISH_RENDER_PAYLOAD_ESTIMATE_VERSION,
    gridCellCount: snapshot.gridWidth * snapshot.gridHeight,
    fieldCount: snapshot.fields.length,
    lineageCount: snapshot.lineages.length,
    eventCount: snapshot.events.length,
    acceptedInterventionFootprintCount:
      snapshot.acceptedInterventionFootprints?.length ?? 0,
    dishMaskBytes,
    biomassBytes,
    fieldValueBytes,
    lineageDensityBytes,
    typedArrayBytes,
    metadataJsonUtf8Bytes,
    estimatedApplicationPayloadBytes:
      typedArrayBytes + metadataJsonUtf8Bytes,
  });
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
