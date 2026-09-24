import { describe, expect, it } from "vitest";

import type { ComposedSimulationConfig } from "../../src/sim/authoritative";
import { ComposedSimulationEngine } from "../../src/sim/composedEngine";
import type { CuratedMutationGraph } from "../../src/sim/evolution/graph";
import { createFixtureComposedParameterSetBinding } from "../../src/sim/parameterSetBinding";
import {
  METRIC_SAMPLING_POLICY_VERSION,
} from "../../src/sim/metrics";
import { createRunIdentity } from "../../src/sim/protocol";
import { LiveAnalysisHistory } from "../../src/app/liveAnalysisHistory";

const evolutionGraph: CuratedMutationGraph = {
  scenarioId: "live-analysis-fixture",
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
  evolutionGraph,
  evolutionScenario: {
    scenarioId: "live-analysis-fixture",
    scenarioVersion: "1",
  },
  ciprofloxacin: null,
  samplingExecutionPolicy: null,
  lineages: [
    { id: "ancestor", genotypeId: "WT", deathHazardPerHour: 0 },
    { id: "variant", genotypeId: "R", deathHazardPerHour: 0 },
  ],
  hoursPerTick: 0.1,
};

const parameterSetId = "fixture:live-analysis";
const parameterSetVersion = "1";
const identity = createRunIdentity({
  scenarioId: "live-analysis-fixture",
  scenarioVersion: "1",
  parameterSetId,
  parameterSetVersion,
  parameterSetBinding: createFixtureComposedParameterSetBinding(
    parameterSetId,
    parameterSetVersion,
    config,
  ),
  seed: 17,
});

const policy = {
  version: METRIC_SAMPLING_POLICY_VERSION,
  everyTicks: 1,
  offsetTicks: 0,
} as const;

function history() {
  return new LiveAnalysisHistory({
    identity,
    samplingPolicy: policy,
    resistantGenotypeIds: ["R"],
  });
}

describe("live authoritative analysis history", () => {
  it("accumulates exact sampled composed snapshots in accepted order", () => {
    const engine = new ComposedSimulationEngine(identity, config);
    const accumulator = history();

    expect(accumulator.append(engine.snapshot())).toBe(true);
    const first = engine.execute({ id: "advance-1", type: "advance", ticks: 1 });
    expect(accumulator.append(first)).toBe(true);
    const second = engine.execute({ id: "advance-2", type: "advance", ticks: 1 });
    expect(accumulator.append(second)).toBe(true);

    const state = accumulator.snapshot();
    expect(state.acceptedSnapshotCount).toBe(3);
    expect(state.lastCommandCount).toBe(2);
    expect(state.lastTraceHash).toBe(second.traceHash);
    expect(state.samples.map((sample) => sample.tick)).toEqual([0, 1, 2]);
    expect(
      state.samples.map((sample) => sample.simulationTimeHours),
    ).toEqual([0, 0.1, 0.2]);
    expect(state.samples[0]!.identity).toEqual(identity);
    expect(state.samples[0]!.identity).not.toBe(identity);
  });

  it("treats repeated delivery of the exact same command position/trace as idempotent", () => {
    const engine = new ComposedSimulationEngine(identity, config);
    const accumulator = history();
    const initial = engine.snapshot();

    expect(accumulator.append(initial)).toBe(true);
    expect(accumulator.append(structuredClone(initial))).toBe(false);

    const state = accumulator.snapshot();
    expect(state.acceptedSnapshotCount).toBe(1);
    expect(state.samples).toHaveLength(1);
  });

  it("fails closed on same-position history replacement and command rewind", () => {
    const engine = new ComposedSimulationEngine(identity, config);
    const accumulator = history();
    const initial = engine.snapshot();
    const advanced = engine.execute({
      id: "advance-1",
      type: "advance",
      ticks: 1,
    });

    accumulator.append(initial);
    accumulator.append(advanced);

    const rewritten = structuredClone(advanced);
    (rewritten as { traceHash: string }).traceHash = "different-trace";
    expect(() => accumulator.append(rewritten)).toThrow(
      /conflicting replacement/,
    );
    expect(() => accumulator.append(initial)).toThrow(/cannot move backward/);
  });

  it("refuses snapshots from a different structured run identity", () => {
    const engine = new ComposedSimulationEngine(identity, config);
    const accumulator = history();
    const foreign = structuredClone(engine.snapshot());
    (foreign.checkpoint.identity as { seed: number }).seed = 18;

    expect(() => accumulator.append(foreign)).toThrow(/foreign run identity/);
    expect(accumulator.snapshot().samples).toEqual([]);
  });

  it("tracks accepted snapshots without inventing duplicate metric points at unsampled ticks", () => {
    const sparsePolicy = {
      version: METRIC_SAMPLING_POLICY_VERSION,
      everyTicks: 2,
      offsetTicks: 0,
    } as const;
    const accumulator = new LiveAnalysisHistory({
      identity,
      samplingPolicy: sparsePolicy,
      resistantGenotypeIds: ["R"],
    });
    const engine = new ComposedSimulationEngine(identity, config);

    expect(accumulator.append(engine.snapshot())).toBe(true);
    expect(
      accumulator.append(
        engine.execute({ id: "advance-1", type: "advance", ticks: 1 }),
      ),
    ).toBe(false);
    expect(
      accumulator.append(
        engine.execute({ id: "advance-2", type: "advance", ticks: 1 }),
      ),
    ).toBe(true);

    const state = accumulator.snapshot();
    expect(state.acceptedSnapshotCount).toBe(3);
    expect(state.samples.map((sample) => sample.tick)).toEqual([0, 2]);
  });

  it("returns detached sample history so presentation consumers cannot mutate authority", () => {
    const engine = new ComposedSimulationEngine(identity, config);
    const accumulator = history();
    accumulator.append(engine.snapshot());

    const first = accumulator.snapshot();
    (first.samples[0] as { totalBiomass: number }).totalBiomass = 999;

    expect(accumulator.snapshot().samples[0]!.totalBiomass).toBe(2);
  });
});
