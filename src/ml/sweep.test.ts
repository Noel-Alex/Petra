import { describe, expect, it } from "vitest";

import {
  buildMechanisticSweepManifest,
  planMechanisticSweep,
  type MechanisticSweepDefinition,
} from "./sweep";

function definition(): MechanisticSweepDefinition {
  return {
    planVersion: "aggregate-sweep-v1",
    datasetVersion: "dataset-v1",
    engineVersion: "engine-v3",
    scenarioId: "selection-not-mutation",
    scenarioVersion: "2",
    normalizationProfileId: "aggregate-v1",
    parameterPoints: [
      { id: "point-a", parameterSetHash: "params-a" },
      { id: "point-b", parameterSetHash: "params-b" },
    ],
    interventionFamilies: [
      { id: "untreated", fingerprint: "none" },
      { id: "pulse", fingerprint: "dose-family-v1" },
    ],
    seeds: ["1", "2", "3"],
    maxTrajectories: 20,
  };
}

describe("mechanistic ML sweep planner", () => {
  it("keeps all stochastic replicas of one parameter/intervention group in one split", () => {
    const plan = planMechanisticSweep(definition());
    const grouped = new Map<string, Set<string>>();

    for (const task of plan.tasks) {
      const splits = grouped.get(task.splitGroupKey) ?? new Set<string>();
      splits.add(task.split);
      grouped.set(task.splitGroupKey, splits);
    }

    expect(grouped.size).toBe(4);
    expect([...grouped.values()].every((splits) => splits.size === 1)).toBe(true);
    expect(plan.groupCount).toBe(4);
    expect(plan.trajectoryCount).toBe(12);
  });

  it("is deterministic and gives every planned trajectory a stable unique identity", () => {
    const first = planMechanisticSweep(definition());
    const second = planMechanisticSweep(definition());

    expect(second).toEqual(first);
    expect(new Set(first.tasks.map((task) => task.taskId)).size).toBe(
      first.tasks.length,
    );
    expect(new Set(first.tasks.map((task) => task.trajectoryKey)).size).toBe(
      first.tasks.length,
    );
  });

  it("emits a versioned manifest with split counts that cover every trajectory", () => {
    const plan = planMechanisticSweep(definition());
    const manifest = buildMechanisticSweepManifest(plan);
    const counted =
      manifest.splitCounts.train +
      manifest.splitCounts.validation +
      manifest.splitCounts.test;

    expect(manifest.schemaVersion).toBe("petra-ml-sweep-manifest-v1");
    expect(manifest.engineVersion).toBe("engine-v3");
    expect(manifest.splitPolicyVersion).toBe(plan.splitPolicy.version);
    expect(manifest.trajectories).toHaveLength(plan.trajectoryCount);
    expect(counted).toBe(plan.trajectoryCount);
  });

  it("refuses accidental combinatorial explosions before producing tasks", () => {
    expect(() =>
      planMechanisticSweep({
        ...definition(),
        maxTrajectories: 11,
      }),
    ).toThrow(/above maxTrajectories=11/);
  });

  it("rejects duplicate biological grouping identities that could split equivalent data", () => {
    expect(() =>
      planMechanisticSweep({
        ...definition(),
        parameterPoints: [
          { id: "point-a", parameterSetHash: "same" },
          { id: "point-b", parameterSetHash: "same" },
        ],
      }),
    ).toThrow(/duplicate parameterSetHash/);

    expect(() =>
      planMechanisticSweep({
        ...definition(),
        interventionFamilies: [
          { id: "family-a", fingerprint: "same" },
          { id: "family-b", fingerprint: "same" },
        ],
      }),
    ).toThrow(/duplicate intervention fingerprint/);

    expect(() =>
      planMechanisticSweep({
        ...definition(),
        seeds: ["1", "1"],
      }),
    ).toThrow(/duplicate seed/);
  });
});
