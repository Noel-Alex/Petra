import { describe, expect, it } from "vitest";
import type { DishRenderSnapshot } from "./model";
import { estimateDishRenderSnapshotPayload } from "./renderPayloadEstimate";

function fixtureSnapshot(): DishRenderSnapshot {
  return {
    snapshotId: "snapshot-1",
    samplingIdentity: "branch-1",
    simulationTimeHours: 2,
    gridWidth: 2,
    gridHeight: 2,
    dishMask: new Uint8Array([1, 1, 1, 0]),
    biomass: new Float32Array([1, 2, 3, 0]),
    fields: [
      {
        id: "resource",
        kind: "nutrient",
        label: "Resource",
        unit: "model-resource",
        width: 2,
        height: 2,
        values: new Float32Array([4, 3, 2, 0]),
        rangeMode: "snapshot-extrema",
        minimum: 2,
        maximum: 4,
      },
    ],
    lineages: [
      {
        id: "L1",
        label: "Founder",
        appearanceToken: "lineage-coral",
        patternToken: "solid-ring",
        density: new Float32Array([1, 2, 3, 0]),
      },
    ],
    acceptedInterventionFootprints: [],
    events: [],
  };
}

describe("render payload estimate", () => {
  it("reports exact logical typed-array bytes by renderer channel", () => {
    const estimate = estimateDishRenderSnapshotPayload(fixtureSnapshot());

    expect(estimate.gridCellCount).toBe(4);
    expect(estimate.dishMaskBytes).toBe(4);
    expect(estimate.biomassBytes).toBe(16);
    expect(estimate.fieldValueBytes).toBe(16);
    expect(estimate.lineageDensityBytes).toBe(16);
    expect(estimate.typedArrayBytes).toBe(52);
    expect(estimate.estimatedApplicationPayloadBytes).toBe(
      estimate.typedArrayBytes + estimate.metadataJsonUtf8Bytes,
    );
  });

  it("counts logical typed-array view bytes rather than backing-buffer capacity", () => {
    const snapshot = fixtureSnapshot();
    const backing = new ArrayBuffer(32);
    const logicalView = new Float32Array(backing, 8, 4);

    const estimate = estimateDishRenderSnapshotPayload({
      ...snapshot,
      biomass: logicalView,
    });

    expect(backing.byteLength).toBe(32);
    expect(logicalView.byteLength).toBe(16);
    expect(estimate.biomassBytes).toBe(16);
  });

  it("keeps metadata growth separate from scientific channel bytes", () => {
    const snapshot = fixtureSnapshot();
    const baseline = estimateDishRenderSnapshotPayload(snapshot);
    const withEvent = estimateDishRenderSnapshotPayload({
      ...snapshot,
      events: [
        {
          id: "event-1",
          kind: "selection",
          simulationTimeHours: 1,
          x: 0.5,
          y: 0.5,
          lineageId: "L1",
          label: "A deliberately longer event label for metadata sizing",
        },
      ],
    });

    expect(withEvent.typedArrayBytes).toBe(baseline.typedArrayBytes);
    expect(withEvent.metadataJsonUtf8Bytes).toBeGreaterThan(
      baseline.metadataJsonUtf8Bytes,
    );
    expect(withEvent.eventCount).toBe(1);
  });

  it("scales exact typed-array bytes with added fields and lineages", () => {
    const snapshot = fixtureSnapshot();
    const baseline = estimateDishRenderSnapshotPayload(snapshot);
    const expanded = estimateDishRenderSnapshotPayload({
      ...snapshot,
      fields: [
        ...snapshot.fields,
        {
          ...snapshot.fields[0]!,
          id: "drug",
          kind: "antibiotic",
          label: "Drug",
          unit: "mg/L",
          values: new Float32Array([0, 1, 2, 0]),
          minimum: 0,
          maximum: 2,
        },
      ],
      lineages: [
        ...snapshot.lineages,
        {
          ...snapshot.lineages[0]!,
          id: "L2",
          label: "Child",
          appearanceToken: "lineage-gold",
          patternToken: "double-ring",
          density: new Float32Array([0, 1, 0, 0]),
        },
      ],
    });

    expect(expanded.fieldCount).toBe(2);
    expect(expanded.lineageCount).toBe(2);
    expect(expanded.typedArrayBytes - baseline.typedArrayBytes).toBe(32);
  });
});
