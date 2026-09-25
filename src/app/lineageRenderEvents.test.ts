import { describe, expect, it } from "vitest";

import { LineageRegistry } from "../sim/evolution/lineage";
import { projectLineageOriginRenderEvents } from "./lineageRenderEvents";

function checkpointWithSpatialChildren() {
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
  registry.markExtinct(first.lineageId, 0.75);
  return {
    checkpoint: registry.checkpoint(),
    founder,
    first,
    second,
  };
}

describe("authoritative lineage-origin render events", () => {
  it("projects child origin cells through shared cell-center geometry in registry event order", () => {
    const { checkpoint, first, second } = checkpointWithSpatialChildren();

    const events = projectLineageOriginRenderEvents({
      lineageRegistry: checkpoint,
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

  it("omits founders and extinction events because neither has an authoritative origin point to add", () => {
    const { checkpoint } = checkpointWithSpatialChildren();
    const events = projectLineageOriginRenderEvents({
      lineageRegistry: checkpoint,
      gridWidth: 3,
      gridHeight: 2,
      dishMask: [1, 1, 1, 1, 1, 1],
      snapshotSimulationTimeHours: 1,
    });

    expect(events).toHaveLength(2);
    expect(events.every((event) => event.kind === "lineage-created")).toBe(true);
  });

  it("fails closed when an authoritative origin cell lies outside the current grid", () => {
    const registry = new LineageRegistry();
    const founder = registry.create({
      parentLineageId: null,
      genotypeId: "WT",
      createdAtHours: 0,
      originCellIndex: null,
      mutationClass: null,
    });
    registry.create({
      parentLineageId: founder.lineageId,
      genotypeId: "MUT",
      createdAtHours: 0.25,
      originCellIndex: 6,
      mutationClass: "target-site",
    });

    expect(() =>
      projectLineageOriginRenderEvents({
        lineageRegistry: registry.checkpoint(),
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
    registry.create({
      parentLineageId: founder.lineageId,
      genotypeId: "MUT",
      createdAtHours: 0.25,
      originCellIndex: 1,
      mutationClass: "target-site",
    });

    expect(() =>
      projectLineageOriginRenderEvents({
        lineageRegistry: registry.checkpoint(),
        gridWidth: 2,
        gridHeight: 2,
        dishMask: [1, 0, 1, 1],
        snapshotSimulationTimeHours: 1,
      }),
    ).toThrow(/inside the authoritative dish mask/);
  });

  it("rejects lineage creation after the enclosing snapshot time", () => {
    const { checkpoint } = checkpointWithSpatialChildren();
    expect(() =>
      projectLineageOriginRenderEvents({
        lineageRegistry: checkpoint,
        gridWidth: 3,
        gridHeight: 2,
        dishMask: [1, 1, 1, 1, 1, 1],
        snapshotSimulationTimeHours: 0.25,
      }),
    ).toThrow(/cannot occur after the snapshot time/);
  });
});
