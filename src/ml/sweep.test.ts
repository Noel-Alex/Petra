import { describe, expect, it } from "vitest";

import {
  SweepSplitCoverageError,
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
    datasetSchema: {
      schemaVersion: "mechanistic-dataset-schema-v1",
      inputSchemaVersion: "aggregate-input-v1",
      targetSchemaVersion: "aggregate-target-v1",
    },
    parameterPoints: [
      { id: "point-a", parameterSetHash: "params-a" },
      { id: "point-b", parameterSetHash: "params-b" },
      { id: "point-c", parameterSetHash: "params-11" },
    ],
    // This fixture identity yields held-out coverage under trajectory-group-v2.
    // It is opaque test provenance, not a biological initialization.
    runConditions: [{ id: "condition-a", fingerprint: "cond-1" }],
    interventionFamilies: [
      { id: "untreated", fingerprint: "none" },
      { id: "pulse", fingerprint: "dose-family-v1" },
    ],
    seeds: [1, 2, 3],
    maxTrajectories: 24,
  };
}

describe("mechanistic ML sweep planner", () => {
  it("keeps all stochastic replicas of one mechanism/run-condition/intervention group in one split", () => {
    const plan = planMechanisticSweep(definition());
    const grouped = new Map<string, Set<string>>();

    for (const task of plan.tasks) {
      const splits = grouped.get(task.splitGroupKey) ?? new Set<string>();
      splits.add(task.split);
      grouped.set(task.splitGroupKey, splits);
    }

    expect(grouped.size).toBe(6);
    expect([...grouped.values()].every((splits) => splits.size === 1)).toBe(true);
    expect(plan.groupCount).toBe(6);
    expect(plan.trajectoryCount).toBe(18);
    expect(plan.splitGroupCounts.train).toBeGreaterThan(0);
    expect(plan.splitGroupCounts.validation).toBeGreaterThan(0);
    expect(plan.splitGroupCounts.test).toBeGreaterThan(0);
  });

  it("uses run conditions as real held-out groups while keeping seed replicas together", () => {
    const plan = planMechanisticSweep({
      ...definition(),
      parameterPoints: [{ id: "point-a", parameterSetHash: "params-a" }],
      runConditions: [
        { id: "condition-train", fingerprint: "condition-a" },
        { id: "condition-validation", fingerprint: "cond-1" },
        { id: "condition-test", fingerprint: "baseline" },
      ],
      interventionFamilies: [{ id: "untreated", fingerprint: "none" }],
      maxTrajectories: 9,
    });

    expect(plan.groupCount).toBe(3);
    expect(plan.trajectoryCount).toBe(9);
    expect(plan.splitGroupCounts).toEqual({
      train: 1,
      validation: 1,
      test: 1,
    });
    for (const conditionId of [
      "condition-train",
      "condition-validation",
      "condition-test",
    ]) {
      const tasks = plan.tasks.filter((task) => task.runConditionId === conditionId);
      expect(tasks).toHaveLength(3);
      expect(new Set(tasks.map((task) => task.split)).size).toBe(1);
    }
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

  it("refuses a sweep with no required held-out group before trajectory execution", () => {
    const tooSmall: MechanisticSweepDefinition = {
      ...definition(),
      parameterPoints: definition().parameterPoints.slice(0, 2),
    };

    try {
      planMechanisticSweep(tooSmall);
      throw new Error("expected split coverage refusal");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(SweepSplitCoverageError);
      const refusal = error as SweepSplitCoverageError;
      expect(refusal.policyVersion).toBe("held-out-group-coverage-v1");
      expect(refusal.groupCounts).toEqual({
        train: 3,
        validation: 1,
        test: 0,
      });
      expect(refusal.trajectoryCounts).toEqual({
        train: 9,
        validation: 3,
        test: 0,
      });
      expect(refusal.gaps).toEqual([
        {
          split: "test",
          requiredGroups: 1,
          observedGroups: 0,
          observedTrajectories: 0,
        },
      ]);
      expect(refusal.message).toMatch(/do not move individual seeds or frames/);
    }
  });

  it("emits versioned coverage provenance and split counts for groups and trajectories", () => {
    const plan = planMechanisticSweep(definition());
    const manifest = buildMechanisticSweepManifest(plan);
    const countedTrajectories =
      manifest.splitCounts.train +
      manifest.splitCounts.validation +
      manifest.splitCounts.test;
    const countedGroups =
      manifest.splitGroupCounts.train +
      manifest.splitGroupCounts.validation +
      manifest.splitGroupCounts.test;

    expect(manifest.schemaVersion).toBe("petra-ml-sweep-manifest-v5");
    expect(manifest.engineVersion).toBe("engine-v3");
    expect(manifest.datasetSchema).toEqual(plan.datasetSchema);
    expect(manifest.splitPolicyVersion).toBe(plan.splitPolicy.version);
    expect(manifest.splitCoveragePolicyVersion).toBe(
      plan.splitCoveragePolicy.version,
    );
    expect(manifest.trajectories).toHaveLength(plan.trajectoryCount);
    expect(countedTrajectories).toBe(plan.trajectoryCount);
    expect(countedGroups).toBe(plan.groupCount);
  });

  it("binds input/target schema to task identity without changing group split assignment", () => {
    const first = planMechanisticSweep(definition());
    const second = planMechanisticSweep({
      ...definition(),
      datasetSchema: {
        ...definition().datasetSchema,
        inputSchemaVersion: "aggregate-input-v2",
      },
    });

    expect(second.splitGroupCounts).toEqual(first.splitGroupCounts);
    expect(second.tasks.map((task) => task.split)).toEqual(
      first.tasks.map((task) => task.split),
    );
    expect(second.tasks[0]!.trajectoryKey).toBe(first.tasks[0]!.trajectoryKey);
    expect(second.tasks[0]!.taskId).not.toBe(first.tasks[0]!.taskId);
    expect(second.tasks[0]!.datasetSchema.inputSchemaVersion).toBe(
      "aggregate-input-v2",
    );
  });

  it("rejects malformed dataset schema identity before planning trajectories", () => {
    expect(() =>
      planMechanisticSweep({
        ...definition(),
        datasetSchema: {
          ...definition().datasetSchema,
          targetSchemaVersion: "",
        },
      }),
    ).toThrow(/targetSchemaVersion/);
  });

  it("records coverage-policy version changes as distinct manifest provenance", () => {
    const first = buildMechanisticSweepManifest(planMechanisticSweep(definition()));
    const second = buildMechanisticSweepManifest(
      planMechanisticSweep({
        ...definition(),
        splitCoveragePolicy: {
          version: "held-out-group-coverage-v2-test-fixture",
          requiredSplits: ["train", "validation", "test"],
          minimumGroupsPerSplit: 1,
        },
      }),
    );

    expect(first.trajectories).toEqual(second.trajectories);
    expect(first.splitCoveragePolicyVersion).not.toBe(
      second.splitCoveragePolicyVersion,
    );
  });

  it("refuses accidental combinatorial explosions before producing tasks", () => {
    expect(() =>
      planMechanisticSweep({
        ...definition(),
        maxTrajectories: 17,
      }),
    ).toThrow(/above maxTrajectories=17/);
  });

  it("uses the authoritative uint32 seed domain without string aliases", () => {
    const plan = planMechanisticSweep({
      ...definition(),
      seeds: [0, 1, 0xffff_ffff],
    });

    expect(plan.tasks.slice(0, 3).map((task) => task.trajectory.seed)).toEqual([
      0,
      1,
      0xffff_ffff,
    ]);

    for (const invalid of [-1, 0x1_0000_0000, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() =>
        planMechanisticSweep({
          ...definition(),
          seeds: [invalid],
        }),
      ).toThrow(/simulation seed/);
    }

    for (const alias of ["1", "01", "4294967295"]) {
      expect(() =>
        planMechanisticSweep({
          ...definition(),
          seeds: [alias as unknown as number],
        }),
      ).toThrow(/simulation seed/);
    }
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
        runConditions: [
          { id: "condition-a", fingerprint: "same-condition" },
          { id: "condition-b", fingerprint: "same-condition" },
        ],
      }),
    ).toThrow(/duplicate run condition fingerprint/);

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
        seeds: [1, 1],
      }),
    ).toThrow(/duplicate seed/);
  });

  it("rejects invalid coverage policies rather than silently weakening held-out evidence", () => {
    expect(() =>
      planMechanisticSweep({
        ...definition(),
        splitCoveragePolicy: {
          version: "",
          requiredSplits: ["train", "validation", "test"],
          minimumGroupsPerSplit: 1,
        },
      }),
    ).toThrow(/split coverage policy version must be non-empty/);

    expect(() =>
      planMechanisticSweep({
        ...definition(),
        splitCoveragePolicy: {
          version: "bad-coverage",
          requiredSplits: ["validation", "validation"],
          minimumGroupsPerSplit: 1,
        },
      }),
    ).toThrow(/duplicate required dataset split/);

    expect(() =>
      planMechanisticSweep({
        ...definition(),
        splitCoveragePolicy: {
          version: "bad-minimum",
          requiredSplits: ["validation", "test"],
          minimumGroupsPerSplit: 0,
        },
      }),
    ).toThrow(/minimumGroupsPerSplit must be a positive safe integer/);
  });
});
