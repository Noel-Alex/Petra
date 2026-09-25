import { afterEach, describe, expect, it } from "vitest";
import type { DishRenderSnapshot } from "../render/model";
import { PROTOCOL_VERSION, type ComposedSimulationSnapshot } from "../sim/protocol";
import {
  isRenderPublicationPerformanceEnabled,
  measureDishProjectionPublication,
  RENDER_PUBLICATION_PERFORMANCE_SAMPLE_VERSION,
  observeDishReactCommit,
  observeRuntimeSnapshotPublication,
  type RenderPublicationPerformanceSample,
} from "./renderPublicationPerformance";

afterEach(() => {
  delete globalThis.__petraRenderPublicationPerformanceProbe;
});

function snapshot(): ComposedSimulationSnapshot {
  return {
    traceHash: "trace-1",
    events: [],
    checkpoint: {
      authority: "composed",
      rngState: [1, 2, 3, 4],
      identity: {
        engineVersion: "petra-ts-core/0.1.0",
        protocolVersion: PROTOCOL_VERSION,
        scenarioId: "fixture",
        scenarioVersion: "1",
        parameterSetId: "fixture",
        parameterSetVersion: "1",
        seed: 1,
      },
      tick: 4,
      simulationTimeHours: 2,
      commandCount: 3,
      composedState: {} as ComposedSimulationSnapshot["checkpoint"]["composedState"],
      metrics: {
        totalBiomass: 2.5,
        occupiedCells: 1,
      } as ComposedSimulationSnapshot["checkpoint"]["metrics"],
    },
  };
}

function dish(): DishRenderSnapshot {
  const biomass = new Float32Array([1]);
  return {
    snapshotId: "composed-trace:trace-1",
    samplingIdentity: "runtime-branch:branch-1",
    simulationTimeHours: 2,
    gridWidth: 1,
    gridHeight: 1,
    dishMask: new Uint8Array([1]),
    biomass,
    fields: [
      {
        id: "biomass",
        kind: "biomass",
        label: "Biomass",
        unit: "model-biomass",
        width: 1,
        height: 1,
        values: biomass,
        rangeMode: "snapshot-extrema",
        minimum: 1,
        maximum: 1,
      },
    ],
    lineages: [],
    events: [],
  };
}

describe("render publication performance diagnostics", () => {
  it("stays disabled until the local experiment probe is explicitly installed", () => {
    expect(isRenderPublicationPerformanceEnabled()).toBe(false);
    globalThis.__petraRenderPublicationPerformanceProbe = {
      version: RENDER_PUBLICATION_PERFORMANCE_SAMPLE_VERSION,
      observe: () => {},
    };
    expect(isRenderPublicationPerformanceEnabled()).toBe(true);
  });

  it("is a zero-observation pass-through when the local probe is absent", () => {
    const expected = dish();
    let calls = 0;

    const projected = measureDishProjectionPublication(
      snapshot(),
      "branch-1",
      () => {
        calls += 1;
        return expected;
      },
    );

    expect(projected).toBe(expected);
    expect(calls).toBe(1);
  });

  it("correlates runtime, projection, payload, and React-commit observations", () => {
    const samples: RenderPublicationPerformanceSample[] = [];
    const times = [10, 12, 15, 16, 17, 20];
    globalThis.__petraRenderPublicationPerformanceProbe = {
      version: RENDER_PUBLICATION_PERFORMANCE_SAMPLE_VERSION,
      now: () => times.shift() ?? 20,
      observe: (sample) => samples.push(sample),
    };

    const source = snapshot();
    const expected = dish();
    observeRuntimeSnapshotPublication(source, "branch-1");
    const projected = measureDishProjectionPublication(
      source,
      "branch-1",
      () => expected,
    );
    observeDishReactCommit(source, "branch-1", projected);

    expect(samples.map((sample) => sample.phase)).toEqual([
      "runtime-snapshot-published",
      "dish-projection",
      "react-dish-committed",
    ]);
    expect(
      samples.map((sample) => [
        sample.runBranchIdentity,
        sample.traceHash,
        sample.tick,
        sample.commandCount,
        sample.simulationTimeHours,
      ]),
    ).toEqual([
      ["branch-1", "trace-1", 4, 3, 2],
      ["branch-1", "trace-1", 4, 3, 2],
      ["branch-1", "trace-1", 4, 3, 2],
    ]);

    const runtime = samples[0];
    if (runtime?.phase !== "runtime-snapshot-published") {
      throw new Error("expected runtime snapshot publication sample");
    }
    expect(runtime.totalBiomass).toBe(2.5);
    expect(runtime.occupiedCells).toBe(1);

    const projection = samples[1];
    if (projection?.phase !== "dish-projection") {
      throw new Error("expected dish projection sample");
    }
    expect(projection.projectionDurationMs).toBe(3);
    expect(projection.payloadEstimateDurationMs).toBe(1);
    expect(projection.payloadEstimate?.typedArrayReferenceBytes).toBe(9);
    expect(projection.payloadEstimate?.uniqueBackingBufferBytes).toBe(5);
    expect(projection.hasNetGrowthField).toBe(false);
  });

  it("swallows diagnostic observer failures without changing product behavior", () => {
    globalThis.__petraRenderPublicationPerformanceProbe = {
      version: RENDER_PUBLICATION_PERFORMANCE_SAMPLE_VERSION,
      now: () => 1,
      observe: () => {
        throw new Error("diagnostic sink failed");
      },
    };
    const expected = dish();

    expect(
      measureDishProjectionPublication(snapshot(), "branch-1", () => expected),
    ).toBe(expected);
    expect(() =>
      observeRuntimeSnapshotPublication(snapshot(), "branch-1"),
    ).not.toThrow();
    expect(() =>
      observeDishReactCommit(snapshot(), "branch-1", expected),
    ).not.toThrow();
  });

  it("rethrows product projection failures after recording diagnostics", () => {
    const samples: RenderPublicationPerformanceSample[] = [];
    globalThis.__petraRenderPublicationPerformanceProbe = {
      version: RENDER_PUBLICATION_PERFORMANCE_SAMPLE_VERSION,
      now: () => 5,
      observe: (sample) => samples.push(sample),
    };

    expect(() =>
      measureDishProjectionPublication(snapshot(), "branch-1", () => {
        throw new Error("projection failed");
      }),
    ).toThrow(/projection failed/);

    const sample = samples[0];
    expect(sample?.phase).toBe("dish-projection");
    if (sample?.phase === "dish-projection") {
      expect(sample.outcome).toBe("error");
      expect(sample.payloadEstimate).toBeNull();
    }
  });
});
