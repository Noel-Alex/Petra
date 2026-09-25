import { describe, expect, it } from "vitest";

import type { RenderEvent } from "./model";
import {
  LINEAGE_ORIGIN_EVENT_PRESENTATION_PLAN_VERSION,
  LINEAGE_ORIGIN_RENDER_EVENT_KIND,
  prepareLineageOriginEventPresentation,
} from "./lineageOriginEventPresentation";

function lineageOriginEvent(
  id: string,
  simulationTimeHours: number,
  lineageId?: string,
): RenderEvent {
  return {
    id,
    kind: LINEAGE_ORIGIN_RENDER_EVENT_KIND,
    simulationTimeHours,
    x: 0.25,
    y: 0.75,
    ...(lineageId === undefined ? {} : { lineageId }),
    label: "origin " + id,
  };
}

describe("lineage-origin event presentation plan", () => {
  it("keeps the newest bounded lineage-origin markers in authoritative source order", () => {
    const source: RenderEvent[] = [
      lineageOriginEvent("origin-1", 1, "lineage-1"),
      {
        id: "future-event",
        kind: "future-reviewed-event",
        simulationTimeHours: 1,
        x: 0.5,
        y: 0.5,
        label: "future event",
      },
      lineageOriginEvent("origin-2", 1, "lineage-2"),
      lineageOriginEvent("origin-3", 1, "lineage-3"),
    ];

    const plan = prepareLineageOriginEventPresentation(
      {
        snapshotId: "snapshot-3",
        samplingIdentity: "branch-1",
        events: source,
      },
      { maxVisibleMarkers: 2 },
    );

    expect(plan.version).toBe(
      LINEAGE_ORIGIN_EVENT_PRESENTATION_PLAN_VERSION,
    );
    expect(plan.sourceEventCount).toBe(4);
    expect(plan.eligibleMarkerCount).toBe(3);
    expect(plan.omittedMarkerCount).toBe(1);
    expect(plan.markers.map((event) => event.id)).toEqual([
      "origin-2",
      "origin-3",
    ]);
    expect(plan.markers.map((event) => event.simulationTimeHours)).toEqual([
      1,
      1,
    ]);
  });

  it("preserves an exact current-lineage cross-link only when the source carries one", () => {
    const plan = prepareLineageOriginEventPresentation(
      {
        snapshotId: "snapshot-links",
        samplingIdentity: "branch-links",
        events: [
          lineageOriginEvent("live-origin", 0.5, "live-lineage"),
          lineageOriginEvent("extinct-origin", 0.75),
        ],
      },
      { maxVisibleMarkers: 2 },
    );

    expect(plan.markers[0]).toMatchObject({
      id: "live-origin",
      lineageId: "live-lineage",
    });
    expect(plan.markers[1]).toMatchObject({
      id: "extinct-origin",
    });
    expect(Object.hasOwn(plan.markers[1]!, "lineageId")).toBe(false);
  });

  it("detaches retained marker records from the source dish transaction", () => {
    const source = {
      id: "origin-detach",
      kind: LINEAGE_ORIGIN_RENDER_EVENT_KIND,
      simulationTimeHours: 2,
      x: 0.2,
      y: 0.4,
      lineageId: "lineage-detach",
      label: "original label",
    };

    const plan = prepareLineageOriginEventPresentation(
      {
        snapshotId: "snapshot-detach",
        samplingIdentity: "branch-detach",
        events: [source],
      },
      { maxVisibleMarkers: 1 },
    );

    const marker = plan.markers[0]!;
    expect(marker).not.toBe(source);
    expect(Object.isFrozen(marker)).toBe(true);
    expect(Object.isFrozen(plan.markers)).toBe(true);

    source.label = "mutated source label";
    source.x = 0.9;

    expect(marker.label).toBe("original label");
    expect(marker.x).toBe(0.2);
  });

  it("does not silently style unknown point-event kinds", () => {
    const plan = prepareLineageOriginEventPresentation(
      {
        snapshotId: "snapshot-future",
        samplingIdentity: "branch-future",
        events: [
          {
            id: "future-event",
            kind: "future-reviewed-event",
            simulationTimeHours: 0,
            x: 0.5,
            y: 0.5,
            label: "future event",
          },
        ],
      },
      { maxVisibleMarkers: 3 },
    );

    expect(plan).toMatchObject({
      sourceEventCount: 1,
      eligibleMarkerCount: 0,
      omittedMarkerCount: 0,
      markers: [],
    });
  });

  it("rejects invalid presentation budgets and empty identities", () => {
    expect(() =>
      prepareLineageOriginEventPresentation(
        {
          snapshotId: "snapshot",
          samplingIdentity: "branch",
          events: [],
        },
        { maxVisibleMarkers: 0 },
      ),
    ).toThrow(/positive safe integer/);

    expect(() =>
      prepareLineageOriginEventPresentation(
        {
          snapshotId: "",
          samplingIdentity: "branch",
          events: [],
        },
        { maxVisibleMarkers: 1 },
      ),
    ).toThrow(/snapshotId.*non-empty/i);

    expect(() =>
      prepareLineageOriginEventPresentation(
        {
          snapshotId: "snapshot",
          samplingIdentity: "",
          events: [],
        },
        { maxVisibleMarkers: 1 },
      ),
    ).toThrow(/samplingIdentity.*non-empty/i);
  });
});
