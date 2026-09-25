import { describe, expect, it } from "vitest";

import { resolveLineageVisualIdentity } from "../design/lineageIdentity";
import { validateRenderSnapshot } from "../render/model";
import { LineageRegistry } from "../sim/evolution/lineage";
import { projectLineageOriginRenderEvents } from "./lineageRenderEvents";

function checkpointWithSpatialChildren(extinctFirst = false) {
  const registry = new LineageRegistry();
  const founder = registry.create({
    parentLineageId: null,
    genotypeId: "WT",
    createdAtHours: 0,
    originCellIndex: null,
    mutationClass: null,
  });
  const first = registry.create({
    parentLineageId: founder.lineageId,
    genotypeId: "MUT-A",
    createdAtHours: 0.5,
    originCellIndex: 4,
    mutationClass: "target-site",
  });
  const second = registry.create({
    parentLineageId: founder.lineageId,
    genotypeId: "MUT-B",
    createdAtHours: 0.5,
    originCellIndex: 1,
    mutationClass: "efflux",
  });
  if (extinctFirst) registry.markExtinct(first.lineageId, 0.75);
  return {
    checkpoint: registry.checkpoint(),
    founder,
    first,
    second,
  };
}

describe("authoritative lineage-origin render events", () => {
  it("projects active child origin cells through shared cell-center geometry in registry event order", () => {
    const { checkpoint, founder, first, second } =
      checkpointWithSpatialChildren();

    const events = projectLineageOriginRenderEvents({
      lineageRegistry: checkpoint,
      activeLineageIds: [
        founder.lineageId,
        first.lineageId,
        second.lineageId,
      ],
      gridWidth: 3,
      gridHeight: 2,
      dishMask: [1, 1, 1, 1, 1, 1],
      snapshotSimulationTimeHours: 1,
    });

    expect(events).toEqual([
      {
        id: `lineage-origin:${first.lineageId}`,
        kind: "lineage-created",
        simulationTimeHours: 0.5,
        x: 0.5,
        y: 0.75,
        lineageId: first.lineageId,
        label: `Lineage ${first.lineageId} originated: target-site`,
      },
      {
        id: `lineage-origin:${second.lineageId}`,
        kind: "lineage-created",
        simulationTimeHours: 0.5,
        x: 0.5,
        y: 0.25,
        lineageId: second.lineageId,
        label: `Lineage ${second.lineageId} originated: efflux`,
      },
    ]);
  });

  it("omits founders because they have no authoritative origin point to add", () => {
    const { checkpoint, founder, first, second } =
      checkpointWithSpatialChildren();

    const events = projectLineageOriginRenderEvents({
      lineageRegistry: checkpoint,
      activeLineageIds: [
        founder.lineageId,
        first.lineageId,
        second.lineageId,
      ],
      gridWidth: 3,
      gridHeight: 2,
      dishMask: [1, 1, 1, 1, 1, 1],
      snapshotSimulationTimeHours: 1,
    });

    expect(events).toHaveLength(2);
    expect(events.every((event) => event.kind === "lineage-created")).toBe(true);
    expect(events.some((event) => event.lineageId === founder.lineageId)).toBe(
      false,
    );
  });

  it("omits an extinct historical child so the current render snapshot keeps same-snapshot lineage identity", () => {
    const { checkpoint, founder, first, second } =
      checkpointWithSpatialChildren(true);
    const activeLineageIds = [founder.lineageId, second.lineageId];

    const events = projectLineageOriginRenderEvents({
      lineageRegistry: checkpoint,
      activeLineageIds,
      gridWidth: 3,
      gridHeight: 2,
      dishMask: [1, 1, 1, 1, 1, 1],
      snapshotSimulationTimeHours: 1,
    });

    expect(events).toEqual([
      {
        id: `lineage-origin:${second.lineageId}`,
        kind: "lineage-created",
        simulationTimeHours: 0.5,
        x: 0.5,
        y: 0.25,
        lineageId: second.lineageId,
        label: `Lineage ${second.lineageId} originated: efflux`,
      },
    ]);
    expect(events.some((event) => event.lineageId === first.lineageId)).toBe(
      false,
    );

    expect(() =>
      validateRenderSnapshot({
        snapshotId: "extinct-origin-regression",
        samplingIdentity: "fixture-branch:extinct-origin",
        simulationTimeHours: 1,
        gridWidth: 3,
        gridHeight: 2,
        dishMask: new Uint8Array([1, 1, 1, 1, 1, 1]),
        biomass: new Float32Array(6),
        fields: [],
        lineages: activeLineageIds.map((lineageId) => {
          const identity = resolveLineageVisualIdentity(lineageId);
          return {
            id: lineageId,
            label: lineageId,
            appearanceToken: identity.appearanceToken,
            patternToken: identity.patternToken,
            density: new Float32Array(6),
          };
        }),
        acceptedInterventionFootprints: [],
        events,
      }),
    ).not.toThrow();
  });

  it("still fails closed when an extinct historical origin cell lies outside the current grid", () => {
    const registry = new LineageRegistry();
    const founder = registry.create({
      parentLineageId: null,
      genotypeId: "WT",
      createdAtHours: 0,
      originCellIndex: null,
      mutationClass: null,
    });
    const child = registry.create({
      parentLineageId: founder.lineageId,
      genotypeId: "MUT",
      createdAtHours: 0.25,
      originCellIndex: 6,
      mutationClass: "target-site",
    });
    registry.markExtinct(child.lineageId, 0.5);

    expect(() =>
      projectLineageOriginRenderEvents({
        lineageRegistry: registry.checkpoint(),
        activeLineageIds: [founder.lineageId],
        gridWidth: 3,
        gridHeight: 2,
        dishMask: [1, 1, 1, 1, 1, 1],
        snapshotSimulationTimeHours: 1,
      }),
    ).toThrow(/outside the authoritative grid/);
  });

  it("fails closed when an authoritative origin cell lies outside the dish mask", () => {
    const registry = new LineageRegistry();
    const founder = registry.create({
      parentLineageId: null,
      genotypeId: "WT",
      createdAtHours: 0,
      originCellIndex: null,
      mutationClass: null,
    });
    const child = registry.create({
      parentLineageId: founder.lineageId,
      genotypeId: "MUT",
      createdAtHours: 0.25,
      originCellIndex: 1,
      mutationClass: "target-site",
    });

    expect(() =>
      projectLineageOriginRenderEvents({
        lineageRegistry: registry.checkpoint(),
        activeLineageIds: [founder.lineageId, child.lineageId],
        gridWidth: 2,
        gridHeight: 2,
        dishMask: [1, 0, 1, 1],
        snapshotSimulationTimeHours: 1,
      }),
    ).toThrow(/inside the authoritative dish mask/);
  });

  it("rejects lineage creation after the enclosing snapshot time", () => {
    const { checkpoint, founder, first, second } =
      checkpointWithSpatialChildren();
    expect(() =>
      projectLineageOriginRenderEvents({
        lineageRegistry: checkpoint,
        activeLineageIds: [
          founder.lineageId,
          first.lineageId,
          second.lineageId,
        ],
        gridWidth: 3,
        gridHeight: 2,
        dishMask: [1, 1, 1, 1, 1, 1],
        snapshotSimulationTimeHours: 0.25,
      }),
    ).toThrow(/cannot occur after the snapshot time/);
  });

  it("rejects active lineage identity that is not present in canonical registry authority", () => {
    const { checkpoint, founder, second } = checkpointWithSpatialChildren(true);
    expect(() =>
      projectLineageOriginRenderEvents({
        lineageRegistry: checkpoint,
        activeLineageIds: [
          founder.lineageId,
          second.lineageId,
          "foreign-lineage",
        ],
        gridWidth: 3,
        gridHeight: 2,
        dishMask: [1, 1, 1, 1, 1, 1],
        snapshotSimulationTimeHours: 1,
      }),
    ).toThrow(/active lineage is absent from registry/);
  });
});
