import { describe, expect, it } from "vitest";

import type { ComposedSimulationConfig } from "../sim/authoritative";
import { ComposedSimulationEngine } from "../sim/composedEngine";
import type { CuratedMutationGraph } from "../sim/evolution/graph";
import { createFixtureComposedParameterSetBinding } from "../sim/parameterSetBinding";
import { createRunIdentity, type SimulationSnapshot } from "../sim/protocol";
import {
  createRegionInspectionRequest,
  projectRegionInspector,
} from "./regionInspectorProjection";

const graph: CuratedMutationGraph = {
  scenarioId: "region-projection-fixture",
  scenarioVersion: "1",
  genotypes: [{ id: "WT", relativeFitness: 1, sourceOrder: 0 }],
  transitions: [],
};

const config: ComposedSimulationConfig = {
  width: 1,
  height: 1,
  mask: [1],
  initialResource: [3],
  ciprofloxacinConcentrationMgPerL: [0],
  initialLineageBiomass: [[2]],
  growth: {
    maxDivisionRate: 0,
    halfSaturation: 1,
    biomassYield: 1,
    localCapacity: 10,
    spreadRate: 0,
  },
  evolutionGraph: graph,
  evolutionScenario: {
    scenarioId: graph.scenarioId,
    scenarioVersion: graph.scenarioVersion,
  },
  ciprofloxacin: null,
  samplingExecutionPolicy: null,
  dynamicLineageLossPolicy: null,
  populationAuthority: null,
  lineages: [{ id: "lineage-a", genotypeId: "WT", deathHazardPerHour: 0 }],
  hoursPerTick: 0.01,
};

function composedSnapshot(seed = 7): SimulationSnapshot {
  const binding = createFixtureComposedParameterSetBinding(
    "fixture:region-projection",
    "1",
    config,
  );
  const identity = createRunIdentity({
    scenarioId: graph.scenarioId,
    scenarioVersion: graph.scenarioVersion,
    parameterSetId: binding.parameterSetId,
    parameterSetVersion: binding.parameterSetVersion,
    parameterSetBinding: binding,
    seed,
  });
  return new ComposedSimulationEngine(identity, config).snapshot();
}

function syntheticSnapshot(): SimulationSnapshot {
  return {
    traceHash: "synthetic-trace",
    events: [],
    checkpoint: {
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
  it("reads the exact composed checkpoint and carries trace identity separately", () => {
    const snapshot = composedSnapshot();
    const request = createRegionInspectionRequest(snapshot, { x: 0.5, y: 0.5 });
    expect(request).not.toBeNull();

    const projected = projectRegionInspector(snapshot, request);
    expect(projected.state.status).toBe("ready");
    if (projected.state.status !== "ready") throw new Error("expected ready");
    expect(projected.state.readout).toMatchObject({
      kind: "measured",
      selectionId: request?.selection.id,
      totalBiomass: 2,
      totalResource: 3,
      tick: snapshot.checkpoint.tick,
      simulationTimeHours: snapshot.checkpoint.simulationTimeHours,
      commandCount: snapshot.checkpoint.commandCount,
    });
    expect(projected.source).toMatchObject({
      tick: snapshot.checkpoint.tick,
      simulationTimeHours: snapshot.checkpoint.simulationTimeHours,
      commandCount: snapshot.checkpoint.commandCount,
      traceHash: snapshot.traceHash,
    });
    expect(projected.source?.runIdentity.seed).toBe(7);
  });

  it("fails closed for synthetic or missing authority", () => {
    const composed = composedSnapshot();
    const request = createRegionInspectionRequest(composed, { x: 0.5, y: 0.5 });
    expect(
      createRegionInspectionRequest(syntheticSnapshot(), { x: 0.5, y: 0.5 }),
    ).toBeNull();

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

  it("updates the same selection from newer checkpoints in the same run", () => {
    const snapshot = composedSnapshot();
    const request = createRegionInspectionRequest(snapshot, { x: 0.5, y: 0.5 });
    if (request === null) throw new Error("expected composed region request");

    const binding = snapshot.checkpoint.identity.parameterSetBinding;
    if (binding === undefined) throw new Error("expected composed binding");
    const engine = new ComposedSimulationEngine(snapshot.checkpoint.identity, config);
    engine.execute({ id: "advance-one", type: "advance", ticks: 1 });
    const next = engine.snapshot();
    const projected = projectRegionInspector(next, request);

    expect(projected.state.status).toBe("ready");
    if (projected.state.status !== "ready") throw new Error("expected ready");
    expect(projected.state.readout.tick).toBe(1);
    expect(projected.source?.traceHash).toBe(next.traceHash);
  });
});
