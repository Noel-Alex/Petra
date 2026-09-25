import { describe, expect, it } from "vitest";

import {
  createRuntimeLineageSelection,
  RUNTIME_LINEAGE_SELECTION_SCHEMA_VERSION,
} from "../../src/app/runtimeLineageSelection";
import {
  createDishSceneTransaction,
  type ComposedRuntimeDishSceneTransaction,
} from "../../src/app/dishSceneTransaction";
import {
  RUNTIME_ANALYSIS_TRANSACTION_SCHEMA_VERSION,
  type RuntimeAnalysisTransaction,
} from "../../src/app/runtimeAnalysisTransaction";
import {
  LINEAGE_ANALYSIS_SCHEMA_VERSION,
  type AuthoritativeLineageAnalysisRecord,
} from "../../src/sim/evolution/analysis";
import { createAspergillusNo10SurfaceCheckpoint } from "../../src/sim/fungi/aspergillusNo10Surface";
import {
  createRunIdentity,
  type ComposedSimulationSnapshot,
} from "../../src/sim/protocol";
import type { DishRenderSnapshot, RenderLineage } from "../../src/render/model";

const branchIdentity = "selection-branch-0";

function composedSnapshot(
  simulationTimeHours = 1.5,
  traceHash = "selection-trace-a",
): ComposedSimulationSnapshot {
  return {
    events: [],
    traceHash,
    checkpoint: {
      authority: "composed",
      identity: createRunIdentity({
        scenarioId: "selection-fixture",
        scenarioVersion: "1",
        parameterSetId: "selection-fixture",
        parameterSetVersion: "1",
        seed: 23,
      }),
      tick: 15,
      simulationTimeHours,
      commandCount: 4,
      rngState: [1, 2, 3, 4],
      composedState:
        {} as ComposedSimulationSnapshot["checkpoint"]["composedState"],
      metrics: {} as ComposedSimulationSnapshot["checkpoint"]["metrics"],
    },
  };
}

function renderLineage(id: string): RenderLineage {
  return {
    id,
    label: id,
    appearanceToken: "lineage-coral",
    patternToken: "solid-ring",
    density: new Float32Array([1]),
  };
}

function dishFor(
  snapshot: ComposedSimulationSnapshot,
  lineageIds: readonly string[] = ["L1"],
): DishRenderSnapshot {
  return {
    snapshotId: `composed-trace:${snapshot.traceHash}`,
    samplingIdentity: `runtime-branch:${branchIdentity}`,
    simulationTimeHours: snapshot.checkpoint.simulationTimeHours,
    gridWidth: 1,
    gridHeight: 1,
    dishMask: new Uint8Array([1]),
    biomass: new Float32Array([1]),
    fields: [],
    lineages: lineageIds.map(renderLineage),
    acceptedInterventionFootprints: [],
    events: [],
  };
}

function sceneFor(
  snapshot: ComposedSimulationSnapshot,
  lineageIds: readonly string[] = ["L1"],
): ComposedRuntimeDishSceneTransaction {
  const scene = createDishSceneTransaction({
    composedRuntime: {
      snapshot,
      runBranchIdentity: branchIdentity,
      dish: dishFor(snapshot, lineageIds),
    },
  });
  if (scene.authorityMode !== "composed-runtime") {
    throw new Error("fixture unexpectedly created a fungal scene");
  }
  return scene;
}

function lineageRecord(
  lineageId: string,
  status: "extant" | "extinct",
): AuthoritativeLineageAnalysisRecord {
  return {
    lineageId,
    parentLineageId: null,
    genotypeId: "WT",
    genotypeLabel: "Wild type",
    createdAtHours: 0,
    extinctAtHours: status === "extinct" ? 1 : null,
    originCellIndex: null,
    mutationClass: null,
    status,
    abundanceModelBiomass: status === "extant" ? 1 : 0,
    relativeFitness: 1,
    ciprofloxacin: null,
    sourceKeys: ["fixture-source"],
    assumptionKeys: [],
  };
}

function analysisFor(
  snapshot: ComposedSimulationSnapshot,
  records: readonly AuthoritativeLineageAnalysisRecord[] = [
    lineageRecord("L1", "extant"),
    lineageRecord("L-old", "extinct"),
  ],
): RuntimeAnalysisTransaction {
  return {
    schemaVersion: RUNTIME_ANALYSIS_TRANSACTION_SCHEMA_VERSION,
    records: {
      identity: {
        runIdentity: branchIdentity,
        stateIdentity: snapshot.traceHash,
        composedRunIdentity: structuredClone(snapshot.checkpoint.identity),
        simulationTimeHours: snapshot.checkpoint.simulationTimeHours,
      },
      series: [],
      lineageAnalysis: {
        schemaVersion: LINEAGE_ANALYSIS_SCHEMA_VERSION,
        identity: structuredClone(snapshot.checkpoint.identity),
        configurationFingerprint: "selection-config-v1",
        simulationTimeHours: snapshot.checkpoint.simulationTimeHours,
        records,
      },
    },
  };
}

describe("runtime shared lineage selection authority", () => {
  it("binds one extant lineage to the exact current analysis + dish transaction", () => {
    const snapshot = composedSnapshot();

    const selection = createRuntimeLineageSelection({
      lineageId: "L1",
      analysis: analysisFor(snapshot),
      scene: sceneFor(snapshot),
    });

    expect(selection).toEqual({
      schemaVersion: RUNTIME_LINEAGE_SELECTION_SCHEMA_VERSION,
      lineageId: "L1",
      lineageStatus: "extant",
      runBranchIdentity: branchIdentity,
      traceHash: snapshot.traceHash,
      tick: snapshot.checkpoint.tick,
      acceptedCommandCount: snapshot.checkpoint.commandCount,
      biologicalTimeHours: snapshot.checkpoint.simulationTimeHours,
      presentInCurrentDish: true,
    });
    expect(Object.isFrozen(selection)).toBe(true);
  });

  it("keeps extinct historical ancestry selectable without fabricating current dish presence", () => {
    const snapshot = composedSnapshot();

    const selection = createRuntimeLineageSelection({
      lineageId: "L-old",
      analysis: analysisFor(snapshot),
      scene: sceneFor(snapshot),
    });

    expect(selection).toMatchObject({
      lineageId: "L-old",
      lineageStatus: "extinct",
      presentInCurrentDish: false,
    });
  });

  it("fails closed across runtime branch, trace, or structured run drift", () => {
    const snapshot = composedSnapshot();
    const scene = sceneFor(snapshot);

    const branchDrift = structuredClone(analysisFor(snapshot));
    (branchDrift.records.identity as { runIdentity: string }).runIdentity =
      "selection-branch-foreign";
    expect(() =>
      createRuntimeLineageSelection({
        lineageId: "L1",
        analysis: branchDrift,
        scene,
      }),
    ).toThrow(/different command-history generations/i);

    const traceDrift = structuredClone(analysisFor(snapshot));
    (traceDrift.records.identity as { stateIdentity: string }).stateIdentity =
      "selection-trace-foreign";
    expect(() =>
      createRuntimeLineageSelection({
        lineageId: "L1",
        analysis: traceDrift,
        scene,
      }),
    ).toThrow(/different accepted traces/i);

    const runDrift = structuredClone(analysisFor(snapshot));
    if (runDrift.records.identity.composedRunIdentity === undefined) {
      throw new Error("fixture requires composed run identity");
    }
    (runDrift.records.identity.composedRunIdentity as { seed: number }).seed += 1;
    expect(() =>
      createRuntimeLineageSelection({
        lineageId: "L1",
        analysis: runDrift,
        scene,
      }),
    ).toThrow(/seed mismatch/i);
  });

  it("rejects current-dish lifecycle drift instead of silently highlighting stale data", () => {
    const snapshot = composedSnapshot();

    expect(() =>
      createRuntimeLineageSelection({
        lineageId: "L1",
        analysis: analysisFor(snapshot),
        scene: sceneFor(snapshot, []),
      }),
    ).toThrow(/extant selected lineage is absent/i);

    expect(() =>
      createRuntimeLineageSelection({
        lineageId: "L-old",
        analysis: analysisFor(snapshot),
        scene: sceneFor(snapshot, ["L1", "L-old"]),
      }),
    ).toThrow(/extinct selected lineage is still present/i);
  });

  it("rejects unknown lineages and forged lifecycle status", () => {
    const snapshot = composedSnapshot();

    expect(() =>
      createRuntimeLineageSelection({
        lineageId: "unknown",
        analysis: analysisFor(snapshot),
        scene: sceneFor(snapshot),
      }),
    ).toThrow(/absent from authoritative analysis/i);

    const forged = lineageRecord("L1", "extant");
    const forgedStatus = {
      ...forged,
      extinctAtHours: 1,
      status: "extant" as const,
    };
    expect(() =>
      createRuntimeLineageSelection({
        lineageId: "L1",
        analysis: analysisFor(snapshot, [forgedStatus]),
        scene: sceneFor(snapshot),
      }),
    ).toThrow(/lifecycle status disagrees/i);
  });

  it("returns no selection when composed analysis or composed dish authority is unavailable", () => {
    const snapshot = composedSnapshot();
    const composedScene = sceneFor(snapshot);

    expect(
      createRuntimeLineageSelection({
        lineageId: "L1",
        analysis: null,
        scene: composedScene,
      }),
    ).toBeNull();

    const fungalScene = createDishSceneTransaction({
      fungalSourceValidation: {
        checkpoint: createAspergillusNo10SurfaceCheckpoint(40),
      },
    });

    expect(
      createRuntimeLineageSelection({
        lineageId: "L1",
        analysis: analysisFor(snapshot),
        scene: fungalScene,
      }),
    ).toBeNull();
  });
});
