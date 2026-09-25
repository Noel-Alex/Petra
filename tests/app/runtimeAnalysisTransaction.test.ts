import { describe, expect, it } from "vitest";

import {
  composeRuntimeAnalysisTransaction,
  type RuntimeAnalysisHistoryBinding,
} from "../../src/app/runtimeAnalysisTransaction";
import { LiveAnalysisHistory } from "../../src/app/liveAnalysisHistory";
import {
  projectRuntimeLineageAnalysis,
  type RuntimeLineageAnalysisAuthority,
} from "../../src/app/runtimeLineageAnalysis";
import type {
  AuthoritativeMetricSeriesConfig,
} from "../../src/app/analysisMetrics";
import type { ComposedSimulationConfig } from "../../src/sim/authoritative";
import { ComposedSimulationEngine } from "../../src/sim/composedEngine";
import type { GenotypeAnalysisEvidence } from "../../src/sim/evolution/analysis";
import type { CuratedMutationGraph } from "../../src/sim/evolution/graph";
import {
  METRIC_SAMPLING_POLICY_VERSION,
  type MetricSamplingPolicy,
} from "../../src/sim/metrics";
import { createFixtureComposedParameterSetBinding } from "../../src/sim/parameterSetBinding";
import { createRunIdentity } from "../../src/sim/protocol";

const graph: CuratedMutationGraph = {
  scenarioId: "runtime-analysis-transaction-fixture",
  scenarioVersion: "1",
  genotypes: [
    { id: "WT", relativeFitness: 1, sourceOrder: 0 },
    { id: "R", relativeFitness: 0.9, sourceOrder: 1 },
  ],
  transitions: [],
};

const config: ComposedSimulationConfig = {
  width: 1,
  height: 1,
  mask: [1],
  initialResource: [8],
  ciprofloxacinConcentrationMgPerL: [0],
  initialLineageBiomass: [[1], [1]],
  growth: {
    maxDivisionRate: 0.8,
    halfSaturation: 2,
    biomassYield: 0.5,
    localCapacity: 20,
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
  lineages: [
    { id: "ancestor", genotypeId: "WT", deathHazardPerHour: 0 },
    { id: "variant", genotypeId: "R", deathHazardPerHour: 0 },
  ],
  hoursPerTick: 0.1,
};

const parameterSetId = "fixture:runtime-analysis-transaction";
const parameterSetVersion = "1";
const binding = createFixtureComposedParameterSetBinding(
  parameterSetId,
  parameterSetVersion,
  config,
);
const identity = createRunIdentity({
  scenarioId: graph.scenarioId,
  scenarioVersion: graph.scenarioVersion,
  parameterSetId,
  parameterSetVersion,
  parameterSetBinding: binding,
  seed: 17,
});

const genotypeEvidence: readonly GenotypeAnalysisEvidence[] = [
  {
    genotypeId: "WT",
    label: "Wild type",
    sourceKeys: ["source-wt"],
    assumptionKeys: [],
  },
  {
    genotypeId: "R",
    label: "Variant R",
    sourceKeys: ["source-r"],
    assumptionKeys: [],
  },
];

const seriesConfig: AuthoritativeMetricSeriesConfig = {
  biomassUnit: "model-biomass",
  resourceUnit: "model-resource",
  fractionUnit: "fraction",
  diversityUnit: "nats",
  totalBiomassStyle: {
    appearanceToken: "metric-biomass",
    patternToken: "solid",
  },
  totalResourceStyle: {
    appearanceToken: "metric-resource",
    patternToken: "dash",
  },
  resistantFractionStyle: {
    appearanceToken: "metric-resistant",
    patternToken: "dot",
  },
  lineageDiversityStyle: {
    appearanceToken: "metric-diversity",
    patternToken: "long-dash",
  },
  genotypes: [
    {
      genotypeId: "WT",
      label: "Wild type",
      appearanceToken: "genotype-wt",
      patternToken: "solid",
    },
    {
      genotypeId: "R",
      label: "Variant R",
      appearanceToken: "genotype-r",
      patternToken: "dash",
    },
  ],
};

const defaultPolicy: MetricSamplingPolicy = {
  version: METRIC_SAMPLING_POLICY_VERSION,
  everyTicks: 1,
  offsetTicks: 0,
};

function lineageAuthority(
  snapshot: ReturnType<ComposedSimulationEngine["snapshot"]>,
): RuntimeLineageAnalysisAuthority {
  return {
    identity,
    configurationFingerprint:
      snapshot.checkpoint.composedState.configurationFingerprint,
    evolutionGraph: graph,
    genotypeEvidence,
  };
}

function projectLineage(
  snapshot: ReturnType<ComposedSimulationEngine["snapshot"]>,
  runBranchIdentity = "runtime-analysis:branch-0",
) {
  const frame = projectRuntimeLineageAnalysis(
    { snapshot, runBranchIdentity },
    lineageAuthority(snapshot),
  );
  if (frame === null) {
    throw new Error("fixture composed snapshot unexpectedly produced no lineage frame");
  }
  return frame;
}

function createHistory(policy: MetricSamplingPolicy = defaultPolicy) {
  return new LiveAnalysisHistory({
    identity,
    samplingPolicy: policy,
    resistantGenotypeIds: ["R"],
  });
}

function bindHistory(
  history: LiveAnalysisHistory,
  runBranchIdentity = "runtime-analysis:branch-0",
): RuntimeAnalysisHistoryBinding {
  return {
    runBranchIdentity,
    history: history.snapshot(),
  };
}

describe("runtime authoritative analysis transaction", () => {
  it("joins current lineage authority and exact metric history into analysis records", () => {
    const engine = new ComposedSimulationEngine(identity, config);
    const snapshot = engine.snapshot();
    const history = createHistory();
    history.append(snapshot);

    const transaction = composeRuntimeAnalysisTransaction({
      lineage: projectLineage(snapshot),
      metrics: bindHistory(history),
      seriesConfig,
    });

    expect(transaction).not.toBeNull();
    expect(transaction!.records.identity).toEqual(
      expect.objectContaining({
        runIdentity: "runtime-analysis:branch-0",
        stateIdentity: snapshot.traceHash,
        simulationTimeHours: snapshot.checkpoint.simulationTimeHours,
      }),
    );
    expect(transaction!.records.identity.composedRunIdentity).toEqual(identity);
    expect(transaction!.records.identity.composedRunIdentity).not.toBe(identity);
    expect(transaction!.records.lineageAnalysis?.records.map((record) => record.lineageId)).toEqual([
      "L1",
      "L2",
    ]);
    expect(transaction!.records.series.map((series) => series.id)).toEqual([
      "total-biomass",
      "total-resource",
      "resistant-fraction",
      "lineage-shannon-diversity",
      "genotype-fraction:WT",
      "genotype-fraction:R",
    ]);
  });

  it("rejects metric history from another runtime branch generation", () => {
    const engine = new ComposedSimulationEngine(identity, config);
    const snapshot = engine.snapshot();
    const history = createHistory();
    history.append(snapshot);

    expect(() =>
      composeRuntimeAnalysisTransaction({
        lineage: projectLineage(snapshot, "runtime-analysis:branch-1"),
        metrics: bindHistory(history, "runtime-analysis:branch-0"),
        seriesConfig,
      }),
    ).toThrow(/different command-history generation/i);
  });

  it("rejects a history accumulator that has not observed the current snapshot", () => {
    const engine = new ComposedSimulationEngine(identity, config);
    const history = createHistory();
    const initial = engine.snapshot();
    history.append(initial);
    const current = engine.execute({
      id: "advance-1",
      type: "advance",
      ticks: 1,
    });

    expect(() =>
      composeRuntimeAnalysisTransaction({
        lineage: projectLineage(current),
        metrics: bindHistory(history),
        seriesConfig,
      }),
    ).toThrow(/frontier does not match/i);
  });

  it("allows sampled series to lag an unsampled current tick while history frontier stays exact", () => {
    const policy: MetricSamplingPolicy = {
      version: METRIC_SAMPLING_POLICY_VERSION,
      everyTicks: 2,
      offsetTicks: 0,
    };
    const engine = new ComposedSimulationEngine(identity, config);
    const history = createHistory(policy);
    history.append(engine.snapshot());
    const current = engine.execute({
      id: "advance-1",
      type: "advance",
      ticks: 1,
    });
    expect(history.append(current)).toBe(false);

    const transaction = composeRuntimeAnalysisTransaction({
      lineage: projectLineage(current),
      metrics: bindHistory(history),
      seriesConfig,
    });

    expect(transaction).not.toBeNull();
    expect(transaction!.records.identity.simulationTimeHours).toBe(0.1);
    expect(transaction!.records.series[0]!.points).toEqual([
      { timeHours: 0, value: 2 },
    ]);
  });

  it("returns no product analysis when the exact current history has no sampled metrics yet", () => {
    const policy: MetricSamplingPolicy = {
      version: METRIC_SAMPLING_POLICY_VERSION,
      everyTicks: 2,
      offsetTicks: 1,
    };
    const engine = new ComposedSimulationEngine(identity, config);
    const snapshot = engine.snapshot();
    const history = createHistory(policy);
    expect(history.append(snapshot)).toBe(false);

    expect(
      composeRuntimeAnalysisTransaction({
        lineage: projectLineage(snapshot),
        metrics: bindHistory(history),
        seriesConfig,
      }),
    ).toBeNull();
  });

  it("rejects metric history bound to a foreign structured run identity", () => {
    const engine = new ComposedSimulationEngine(identity, config);
    const snapshot = engine.snapshot();
    const history = createHistory();
    history.append(snapshot);
    const binding = structuredClone(bindHistory(history));
    (binding.history.identity as { seed: number }).seed += 1;

    expect(() =>
      composeRuntimeAnalysisTransaction({
        lineage: projectLineage(snapshot),
        metrics: binding,
        seriesConfig,
      }),
    ).toThrow(/seed mismatch/i);
  });

  it("rejects forged metric samples beyond the current lineage state", () => {
    const engine = new ComposedSimulationEngine(identity, config);
    const snapshot = engine.snapshot();
    const history = createHistory();
    history.append(snapshot);
    const forged = structuredClone(bindHistory(history));
    (forged.history.samples[0] as { simulationTimeHours: number }).simulationTimeHours =
      1;

    expect(() =>
      composeRuntimeAnalysisTransaction({
        lineage: projectLineage(snapshot),
        metrics: forged,
        seriesConfig,
      }),
    ).toThrow(/extends beyond|biological time/i);
  });
});
