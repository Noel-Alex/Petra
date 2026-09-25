import { describe, expect, it } from "vitest";
import type { ComposedSimulationConfig } from "../sim/authoritative";
import { ComposedSimulationEngine } from "../sim/composedEngine";
import type { GenotypeAnalysisEvidence } from "../sim/evolution/analysis";
import type { CuratedMutationGraph } from "../sim/evolution/graph";
import { createFixtureComposedParameterSetBinding } from "../sim/parameterSetBinding";
import { createRunIdentity } from "../sim/protocol";
import {
  projectRuntimeLineageAnalysis,
  type RuntimeLineageAnalysisAuthority,
} from "./runtimeLineageAnalysis";

const graph: CuratedMutationGraph = {
  scenarioId: "runtime-lineage-analysis-fixture",
  scenarioVersion: "1",
  genotypes: [
    { id: "WT", relativeFitness: 1, sourceOrder: 0 },
    { id: "R", relativeFitness: 0.85, sourceOrder: 1 },
  ],
  transitions: [],
};

const config: ComposedSimulationConfig = {
  width: 1,
  height: 1,
  mask: [1],
  initialResource: [5],
  ciprofloxacinConcentrationMgPerL: [0],
  initialLineageBiomass: [[1], [2]],
  growth: {
    maxDivisionRate: 0,
    halfSaturation: 1,
    biomassYield: 1,
    localCapacity: 10,
    spreadRate: 0,
  },
  lineages: [
    { id: "L1", genotypeId: "WT", deathHazardPerHour: 0 },
    { id: "L2", genotypeId: "R", deathHazardPerHour: 0 },
  ],
  evolutionGraph: graph,
  evolutionScenario: {
    scenarioId: graph.scenarioId,
    scenarioVersion: graph.scenarioVersion,
  },
  ciprofloxacin: null,
  samplingExecutionPolicy: null,
  dynamicLineageLossPolicy: null,
  populationAuthority: null,
  hoursPerTick: 0.1,
};

const binding = createFixtureComposedParameterSetBinding(
  "fixture:runtime-lineage-analysis",
  "1",
  config,
);

const identity = createRunIdentity({
  scenarioId: graph.scenarioId,
  scenarioVersion: graph.scenarioVersion,
  parameterSetId: binding.parameterSetId,
  parameterSetVersion: binding.parameterSetVersion,
  parameterSetBinding: binding,
  seed: 123,
});

const evidence: readonly GenotypeAnalysisEvidence[] = [
  {
    genotypeId: "WT",
    label: "Wild type",
    ciprofloxacin: {
      micMgPerL: 0.016,
      responseShift: null,
    },
    sourceKeys: ["source-wt"],
    assumptionKeys: [],
  },
  {
    genotypeId: "R",
    label: "Variant R",
    ciprofloxacin: {
      micMgPerL: 0.38,
      responseShift: {
        referenceGenotypeId: "WT",
        micRatio: 23.75,
      },
    },
    sourceKeys: ["source-r"],
    assumptionKeys: ["transfer-r"],
  },
];

function fixture() {
  const snapshot = new ComposedSimulationEngine(identity, config).snapshot();
  const authority: RuntimeLineageAnalysisAuthority = {
    identity,
    configurationFingerprint:
      snapshot.checkpoint.composedState.configurationFingerprint,
    evolutionGraph: graph,
    genotypeEvidence: evidence,
  };
  return { snapshot, authority };
}

describe("runtime lineage analysis", () => {
  it("binds lineage analysis to the exact accepted composed transaction", () => {
    const { snapshot, authority } = fixture();

    const frame = projectRuntimeLineageAnalysis(
      {
        snapshot,
        runBranchIdentity: "runtime-branch:fixture",
      },
      authority,
    );

    expect(frame).not.toBeNull();
    expect(frame).toEqual(
      expect.objectContaining({
        schemaVersion: 1,
        runBranchIdentity: "runtime-branch:fixture",
        traceHash: snapshot.traceHash,
        tick: snapshot.checkpoint.tick,
        commandCount: snapshot.checkpoint.commandCount,
        simulationTimeHours: snapshot.checkpoint.simulationTimeHours,
      }),
    );
    expect(frame!.analysis.identity).toEqual(snapshot.checkpoint.identity);
    expect(frame!.analysis.identity).not.toBe(snapshot.checkpoint.identity);
    expect(frame!.analysis.configurationFingerprint).toBe(
      snapshot.checkpoint.composedState.configurationFingerprint,
    );
    expect(frame!.analysis.records).toEqual([
      expect.objectContaining({
        lineageId: "L1",
        genotypeId: "WT",
        genotypeLabel: "Wild type",
        abundanceModelBiomass: 1,
        relativeFitness: 1,
      }),
      expect.objectContaining({
        lineageId: "L2",
        genotypeId: "R",
        genotypeLabel: "Variant R",
        abundanceModelBiomass: 2,
        relativeFitness: 0.85,
      }),
    ]);
  });

  it("returns no lineage analysis before an accepted composed snapshot exists", () => {
    const { authority } = fixture();

    expect(
      projectRuntimeLineageAnalysis(
        {
          snapshot: null,
          runBranchIdentity: "runtime-branch:fixture",
        },
        authority,
      ),
    ).toBeNull();
  });

  it("rejects same-scenario evidence bound to a foreign run identity", () => {
    const { snapshot, authority } = fixture();
    const foreignIdentity = createRunIdentity({
      scenarioId: identity.scenarioId,
      scenarioVersion: identity.scenarioVersion,
      parameterSetId: binding.parameterSetId,
      parameterSetVersion: binding.parameterSetVersion,
      parameterSetBinding: binding,
      seed: identity.seed + 1,
    });

    expect(() =>
      projectRuntimeLineageAnalysis(
        {
          snapshot,
          runBranchIdentity: "runtime-branch:fixture",
        },
        {
          ...authority,
          identity: foreignIdentity,
        },
      ),
    ).toThrow(/seed mismatch/i);
  });

  it("rejects evidence after composed configuration identity changes", () => {
    const { snapshot, authority } = fixture();

    expect(() =>
      projectRuntimeLineageAnalysis(
        {
          snapshot,
          runBranchIdentity: "runtime-branch:fixture",
        },
        {
          ...authority,
          configurationFingerprint: authority.configurationFingerprint + ":stale",
        },
      ),
    ).toThrow(/configuration fingerprint/i);
  });

  it("requires evidence for every genotype present in lineage history", () => {
    const { snapshot, authority } = fixture();

    expect(() =>
      projectRuntimeLineageAnalysis(
        {
          snapshot,
          runBranchIdentity: "runtime-branch:fixture",
        },
        {
          ...authority,
          genotypeEvidence: evidence.filter((item) => item.genotypeId !== "R"),
        },
      ),
    ).toThrow(/cover every registry genotype/i);
  });

  it("rejects genotype evidence outside the exact evolution graph", () => {
    const { snapshot, authority } = fixture();

    expect(() =>
      projectRuntimeLineageAnalysis(
        {
          snapshot,
          runBranchIdentity: "runtime-branch:fixture",
        },
        {
          ...authority,
          genotypeEvidence: [
            ...evidence,
            {
              genotypeId: "FOREIGN",
              label: "Foreign genotype",
              sourceKeys: [],
              assumptionKeys: [],
            },
          ],
        },
      ),
    ).toThrow(/outside the evolution graph/i);
  });

  it("requires canonical branch identity for transaction binding", () => {
    const { snapshot, authority } = fixture();

    expect(() =>
      projectRuntimeLineageAnalysis(
        {
          snapshot,
          runBranchIdentity: " runtime-branch:fixture ",
        },
        authority,
      ),
    ).toThrow(/runBranchIdentity/i);
  });
});
