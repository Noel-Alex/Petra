import { describe, expect, it } from "vitest";

import { COMPOSED_STATE_VERSION } from "../sim/authoritative";
import {
  createRunIdentity,
  type SimulationSnapshot,
} from "../sim/protocol";
import {
  createRegionInspectionRequest,
  projectRegionInspector,
} from "./regionInspectorProjection";

function composedSnapshot(seed = 7): SimulationSnapshot {
  const identity = createRunIdentity({
    scenarioId: "region-fixture",
    scenarioVersion: "1",
    parameterSetId: "region-fixture",
    parameterSetVersion: "1",
    seed,
  });

  return {
    traceHash: `trace-${seed}`,
    events: [],
    checkpoint: {
      authority: "composed",
      identity,
      tick: 4,
      simulationTimeHours: 0.5,
      commandCount: 2,
      composedState: {
        version: COMPOSED_STATE_VERSION,
        configurationFingerprint: "fixture-config",
        width: 1,
        height: 1,
        mask: [1],
        lineageIds: ["lineage-a"],
        genotypeIds: ["genotype-a"],
        resource: [3],
        lineageBiomass: [[2]],
      },
      metrics: {
        totalBiomass: 2,
        totalResource: 3,
        occupiedCells: 1,
        lineageBiomass: { "lineage-a": 2 },
        divisionBiomass: 0,
        deathBiomass: 0,
        resourceConsumed: 0,
      },
    },
  };
}

function syntheticSnapshot(): SimulationSnapshot {
  return {
    traceHash: "synthetic-trace",
    events: [],
    checkpoint: {
      authority: "synthetic",
      identity: createRunIdentity({
        scenarioId: "synthetic-fixture",
        scenarioVersion: "1",
        parameterSetId: "synthetic-fixture",
        parameterSetVersion: "1",
        seed: 9,
      }),
      tick: 0,
      simulationTimeHours: 0,
      commandCount: 0,
      syntheticPopulation: 1,
      rngState: [1, 2, 3, 4],
    },
  };
}

describe("region inspector runtime projection", () => {
  it("reads exact composed state and carries source identity separately from renderer state", () => {
    const snapshot = composedSnapshot();
    const request = createRegionInspectionRequest(snapshot, { x: 0.5, y: 0.5 });
    expect(request).not.toBeNull();

    const projected = projectRegionInspector(snapshot, request);
    expect(projected.state.status).toBe("ready");
    if (projected.state.status !== "ready") throw new Error("expected ready");
    expect(projected.state.readout.kind).toBe("measured");
    expect(projected.state.readout.selectionId).toBe(request?.selection.id);
    expect(projected.source).toMatchObject({
      tick: 4,
      simulationTimeHours: 0.5,
      commandCount: 2,
      traceHash: "trace-7",
    });
    expect(projected.source?.runIdentity.seed).toBe(7);
  });

  it("fails closed for synthetic or missing authority", () => {
    const composed = composedSnapshot();
    const request = createRegionInspectionRequest(composed, { x: 0.5, y: 0.5 });
    expect(createRegionInspectionRequest(syntheticSnapshot(), { x: 0.5, y: 0.5 })).toBeNull();

    const projected = projectRegionInspector(syntheticSnapshot(), request);
    expect(projected.state.status).toBe("unavailable");
    expect(projected.source).toBeNull();
  });

  it("does not reuse a selection across run identities", () => {
    const first = composedSnapshot(7);
    const request = createRegionInspectionRequest(first, { x: 0.5, y: 0.5 });
    const second = composedSnapshot(8);

    const projected = projectRegionInspector(second, request);
    expect(projected.state.status).toBe("unavailable");
    expect(projected.source).toBeNull();
  });
});
