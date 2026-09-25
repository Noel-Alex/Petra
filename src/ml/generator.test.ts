import { describe, expect, it } from "vitest";
import { createMechanisticExecutionSchedule } from "./executionSchedule";

import {
  MECHANISTIC_DATASET_ARTIFACT_SCHEMA_VERSION,
  buildMechanisticDatasetArtifact,
  iterateMechanisticDatasetJsonl,
  serializeMechanisticDatasetJsonl,
  serializeMechanisticDatasetSummary,
  type MechanisticTrajectoryResult,
} from "./generator";
import {
  planMechanisticSweep,
  type MechanisticSweepDefinition,
  type MechanisticSweepPlan,
  type MechanisticSweepTask,
} from "./sweep";
import type { MechanisticSample } from "./dataset";

interface FixtureInput {
  readonly population: number;
  readonly resource: number;
}

interface FixtureTarget {
  readonly futurePopulation: number;
}

function definition(): MechanisticSweepDefinition {
  return {
    planVersion: "generator-fixture-v1",
    datasetVersion: "mechanistic-fixture-v1",
    engineVersion: "engine-v3",
    scenarioId: "selection-not-mutation",
    scenarioVersion: "2",
    normalizationProfileId: "aggregate-v1",
    datasetSchema: {
      schemaVersion: "mechanistic-dataset-schema-v1",
      inputSchemaVersion: "aggregate-input-v1",
      targetSchemaVersion: "aggregate-target-v1",
    },
    executionSchedule: createMechanisticExecutionSchedule({ totalTicks: 4, snapshotEveryTicks: 2 }),
    parameterPoints: [
      { id: "point-a", parameterSetHash: "params-a" },
      { id: "point-b", parameterSetHash: "params-b" },
      { id: "point-c", parameterSetHash: "params-11" },
    ],
    runConditions: [{ id: "condition-a", fingerprint: "condition-a-v1" }],
    interventionFamilies: [
      { id: "untreated", fingerprint: "none" },
      { id: "pulse", fingerprint: "dose-family-v1" },
    ],
    seeds: [1, 2],
    maxTrajectories: 20,
  };
}

function trajectoryResult(
  task: MechanisticSweepTask,
): MechanisticTrajectoryResult<FixtureInput, FixtureTarget> {
  return {
    taskId: task.taskId,
    samples: [
      {
        datasetVersion: task.datasetVersion,
        trajectory: structuredClone(task.trajectory),
        snapshotIndex: 0,
        simulationTimeHours: 0,
        normalizationProfileId: task.normalizationProfileId,
        datasetSchema: structuredClone(task.datasetSchema),
        input: { population: 100, resource: 1 },
        target: { futurePopulation: 110 },
      },
      {
        datasetVersion: task.datasetVersion,
        trajectory: structuredClone(task.trajectory),
        snapshotIndex: 1,
        simulationTimeHours: 1,
        normalizationProfileId: task.normalizationProfileId,
        datasetSchema: structuredClone(task.datasetSchema),
        input: { population: 110, resource: 0.8 },
        target: { futurePopulation: 120 },
        terminationReason: "requested-horizon-complete",
      },
    ],
  };
}

function completeResults(
  plan: MechanisticSweepPlan,
): MechanisticTrajectoryResult<FixtureInput, FixtureTarget>[] {
  return plan.tasks.map(trajectoryResult);
}

describe("mechanistic ML dataset generator", () => {
  it("builds complete artifacts deterministically regardless of result arrival order", () => {
    const plan = planMechanisticSweep(definition());
    const results = completeResults(plan);

    const first = buildMechanisticDatasetArtifact(plan, results);
    const reversed = buildMechanisticDatasetArtifact(plan, [...results].reverse());

    expect(reversed).toEqual(first);
    expect(first.summary).toMatchObject({
      schemaVersion: MECHANISTIC_DATASET_ARTIFACT_SCHEMA_VERSION,
      planVersion: plan.planVersion,
      datasetVersion: plan.datasetVersion,
      engineVersion: plan.engineVersion,
      scenarioId: plan.scenarioId,
      scenarioVersion: plan.scenarioVersion,
      normalizationProfileId: plan.normalizationProfileId,
      datasetSchema: plan.datasetSchema,
      executionSchedule: plan.executionSchedule,
      executionScheduleIdentity: plan.executionScheduleIdentity,
      splitPolicyVersion: plan.splitPolicy.version,
      splitCoveragePolicyVersion: plan.splitCoveragePolicy.version,
      groupCount: plan.groupCount,
      trajectoryCount: plan.trajectoryCount,
      sampleCount: plan.trajectoryCount * 2,
      splitGroupCounts: plan.splitGroupCounts,
      splitTrajectoryCounts: plan.splitTrajectoryCounts,
    });
    expect(first.rows).toHaveLength(plan.trajectoryCount * 2);
    expect(first.rows[0]).toMatchObject({
      taskId: plan.tasks[0]!.taskId,
      parameterPointId: plan.tasks[0]!.parameterPointId,
      runConditionId: plan.tasks[0]!.runConditionId,
      interventionFamilyId: plan.tasks[0]!.interventionFamilyId,
      split: plan.tasks[0]!.split,
      splitGroupKey: plan.tasks[0]!.splitGroupKey,
      trajectoryKey: plan.tasks[0]!.trajectoryKey,
      sample: { snapshotIndex: 0 },
    });
    expect(first.rows[1]).toMatchObject({
      taskId: plan.tasks[0]!.taskId,
      sample: { snapshotIndex: 1 },
    });

    for (const split of ["train", "validation", "test"] as const) {
      expect(first.summary.splitSampleCounts[split]).toBe(
        plan.splitTrajectoryCounts[split] * 2,
      );
    }
  });

  it("detaches and freezes collected rows so later runner mutation cannot change an artifact", () => {
    const plan = planMechanisticSweep(definition());
    const results = completeResults(plan);
    const artifact = buildMechanisticDatasetArtifact(plan, results);

    const sourceInput = results[0]!.samples[0]!.input as {
      population: number;
      resource: number;
    };
    sourceInput.population = 999;

    expect(artifact.rows[0]!.sample.input.population).toBe(100);
    expect(Object.isFrozen(artifact.rows)).toBe(true);
    expect(Object.isFrozen(artifact.rows[0])).toBe(true);
    expect(Object.isFrozen(artifact.rows[0]!.sample)).toBe(true);
    expect(Object.isFrozen(artifact.rows[0]!.sample.input)).toBe(true);
  });

  it("exports stable streaming JSONL plus a canonical provenance sidecar", () => {
    const plan = planMechanisticSweep(definition());
    const artifact = buildMechanisticDatasetArtifact(
      plan,
      completeResults(plan).reverse(),
    );

    const lines = [...iterateMechanisticDatasetJsonl(artifact)];
    expect(lines).toHaveLength(artifact.summary.sampleCount);
    expect(serializeMechanisticDatasetJsonl(artifact)).toBe(
      `${lines.join("\n")}\n`,
    );
    expect(JSON.parse(lines[0]!)).toEqual(artifact.rows[0]);
    expect(JSON.parse(serializeMechanisticDatasetSummary(artifact))).toEqual(
      artifact.summary,
    );

    const firstLine = lines[0]!;
    expect(firstLine.indexOf('"schemaVersion"')).toBeLessThan(
      firstLine.indexOf('"split"'),
    );
    expect(firstLine.indexOf('"split"')).toBeLessThan(
      firstLine.indexOf('"splitGroupKey"'),
    );
  });

  it("revalidates group and split-count provenance instead of trusting a typed plan", () => {
    const plan = planMechanisticSweep(definition());
    const results = completeResults(plan);

    expect(() =>
      buildMechanisticDatasetArtifact(
        { ...plan, groupCount: plan.groupCount + 1 },
        results,
      ),
    ).toThrow(/groupCount does not match/);

    expect(() =>
      buildMechanisticDatasetArtifact(
        {
          ...plan,
          splitGroupCounts: {
            ...plan.splitGroupCounts,
            train: plan.splitGroupCounts.train + 1,
          },
        },
        results,
      ),
    ).toThrow(/group count does not match/);

    expect(() =>
      buildMechanisticDatasetArtifact(
        {
          ...plan,
          splitCoveragePolicy: {
            version: "stricter-test-coverage-v1",
            requiredSplits: ["train"],
            minimumGroupsPerSplit: plan.splitGroupCounts.train + 1,
          },
        },
        results,
      ),
    ).toThrow(/group coverage does not satisfy policy/);
  });

  it("refuses missing, duplicate, or unknown trajectory results", () => {
    const plan = planMechanisticSweep(definition());
    const results = completeResults(plan);

    expect(() =>
      buildMechanisticDatasetArtifact(plan, results.slice(1)),
    ).toThrow(/requires exactly/);

    expect(() =>
      buildMechanisticDatasetArtifact(plan, [
        results[0]!,
        results[0]!,
        ...results.slice(2),
      ]),
    ).toThrow(/duplicate trajectory result/);

    expect(() =>
      buildMechanisticDatasetArtifact(plan, [
        { ...results[0]!, taskId: "foreign-task" },
        ...results.slice(1),
      ]),
    ).toThrow(/unknown task/);
  });

  it("refuses cross-task identity leakage and normalization drift", () => {
    const plan = planMechanisticSweep(definition());
    const results = completeResults(plan);
    const first = results[0]!;
    const firstSample = first.samples[0]!;
    const secondSample = first.samples[1]!;

    const foreignTrajectory: MechanisticSample<FixtureInput, FixtureTarget> = {
      ...firstSample,
      trajectory: {
        ...firstSample.trajectory,
        seed: "foreign-seed",
      },
    };
    expect(() =>
      buildMechanisticDatasetArtifact(plan, [
        { ...first, samples: [foreignTrajectory, secondSample] },
        ...results.slice(1),
      ]),
    ).toThrow(/belongs to another trajectory/);

    const wrongNormalization: MechanisticSample<
      FixtureInput,
      FixtureTarget
    > = {
      ...firstSample,
      normalizationProfileId: "aggregate-v0",
    };
    expect(() =>
      buildMechanisticDatasetArtifact(plan, [
        { ...first, samples: [wrongNormalization, secondSample] },
        ...results.slice(1),
      ]),
    ).toThrow(/wrong normalizationProfileId/);
  });

  it("refuses sample schema drift even when normalization and payload keys look compatible", () => {
    const plan = planMechanisticSweep(definition());
    const results = completeResults(plan);
    const first = results[0]!;
    const initial = first.samples[0]!;
    const terminal = first.samples[1]!;

    const wrongInputSchema: MechanisticSample<FixtureInput, FixtureTarget> = {
      ...initial,
      datasetSchema: {
        ...initial.datasetSchema,
        inputSchemaVersion: "aggregate-input-v2",
      },
    };

    expect(() =>
      buildMechanisticDatasetArtifact(plan, [
        { ...first, samples: [wrongInputSchema, terminal] },
        ...results.slice(1),
      ]),
    ).toThrow(/wrong dataset schema/);
  });

  it("requires contiguous snapshots, monotonic time, and one final termination reason", () => {
    const plan = planMechanisticSweep(definition());
    const results = completeResults(plan);
    const first = results[0]!;
    const initial = first.samples[0]!;
    const terminal = first.samples[1]!;

    expect(() =>
      buildMechanisticDatasetArtifact(plan, [
        {
          ...first,
          samples: [
            initial,
            { ...terminal, snapshotIndex: 2 },
          ],
        },
        ...results.slice(1),
      ]),
    ).toThrow(/contiguous from index 0/);

    expect(() =>
      buildMechanisticDatasetArtifact(plan, [
        {
          ...first,
          samples: [
            { ...initial, simulationTimeHours: 2 },
            { ...terminal, simulationTimeHours: 1 },
          ],
        },
        ...results.slice(1),
      ]),
    ).toThrow(/simulation time must be monotonic/);

    expect(() =>
      buildMechanisticDatasetArtifact(plan, [
        {
          ...first,
          samples: [
            { ...initial, terminationReason: "premature" },
            terminal,
          ],
        },
        ...results.slice(1),
      ]),
    ).toThrow(/only the final sample/);

    const terminalWithoutReason = {
      datasetVersion: terminal.datasetVersion,
      trajectory: terminal.trajectory,
      snapshotIndex: terminal.snapshotIndex,
      simulationTimeHours: terminal.simulationTimeHours,
      normalizationProfileId: terminal.normalizationProfileId,
      datasetSchema: terminal.datasetSchema,
      input: terminal.input,
      target: terminal.target,
    };
    expect(() =>
      buildMechanisticDatasetArtifact(plan, [
        { ...first, samples: [initial, terminalWithoutReason] },
        ...results.slice(1),
      ]),
    ).toThrow(/must declare a non-empty terminationReason/);
  });

  it("refuses non-JSON payloads instead of silently changing the exported dataset", () => {
    const plan = planMechanisticSweep(definition());
    const results = completeResults(plan);
    const first = results[0]!;
    const initial = first.samples[0]!;

    const invalidInput = {
      population: initial.input.population,
      resource: initial.input.resource,
      hidden: undefined,
    } as unknown as FixtureInput;

    expect(() =>
      buildMechanisticDatasetArtifact(plan, [
        {
          ...first,
          samples: [
            { ...initial, input: invalidInput },
            first.samples[1]!,
          ],
        },
        ...results.slice(1),
      ]),
    ).toThrow(/non-JSON value/);

    const sparse = Array<number>(2);
    sparse[0] = 1;
    const sparseInput = {
      population: initial.input.population,
      resource: initial.input.resource,
      sparse,
    } as unknown as FixtureInput;

    expect(() =>
      buildMechanisticDatasetArtifact(plan, [
        {
          ...first,
          samples: [
            { ...initial, input: sparseInput },
            first.samples[1]!,
          ],
        },
        ...results.slice(1),
      ]),
    ).toThrow(/sparse array slot/);
  });
});
