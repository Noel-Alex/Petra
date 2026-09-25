import { describe, expect, it } from "vitest";

import {
  assertTaskMatchesMechanisticExecutionDefinition,
} from "./executionDefinition";
import {
  createNodeMechanisticDatasetPackage,
  FIRST_AGGREGATE_DATASET_PACKAGE_ID,
  FIRST_AGGREGATE_DATASET_VERSION,
  FIRST_AGGREGATE_INPUT_SCHEMA_VERSION,
  FIRST_AGGREGATE_METRIC_SAMPLING_POLICY,
  FIRST_AGGREGATE_SOURCE_METRIC_SCHEMA_VERSION,
  FIRST_AGGREGATE_TARGET_SCHEMA_VERSION,
  projectFirstAggregateTransition,
  resolveNodeMechanisticDatasetTaskDefinition,
} from "./firstAggregateDatasetPackage";
import { ComposedSimulationEngine } from "../sim/composedEngine";
import { createRunIdentity } from "../sim/protocol";
import {
  AUTHORITATIVE_METRIC_SCHEMA_VERSION,
  METRIC_SAMPLING_POLICY_VERSION,
} from "../sim/metrics";

describe("first authoritative aggregate dataset package", () => {
  it("builds a bounded leakage-safe 3x3 held-out sweep with three seed replicas per group", () => {
    const datasetPackage = createNodeMechanisticDatasetPackage();
    const plan = datasetPackage.plan;

    expect(datasetPackage.packageId).toBe(
      FIRST_AGGREGATE_DATASET_PACKAGE_ID,
    );
    expect(plan.datasetVersion).toBe(FIRST_AGGREGATE_DATASET_VERSION);
    expect(plan.datasetSchema.inputSchemaVersion).toBe(
      FIRST_AGGREGATE_INPUT_SCHEMA_VERSION,
    );
    expect(plan.datasetSchema.targetSchemaVersion).toBe(
      FIRST_AGGREGATE_TARGET_SCHEMA_VERSION,
    );
    expect(plan.groupCount).toBe(9);
    expect(plan.trajectoryCount).toBe(27);
    expect(plan.tasks).toHaveLength(27);
    expect(plan.executionSchedule).toEqual({
      schemaVersion: "petra-ml-execution-schedule-v1",
      totalTicks: 1024,
      snapshotEveryTicks: 64,
    });
    expect(FIRST_AGGREGATE_SOURCE_METRIC_SCHEMA_VERSION).toBe(
      AUTHORITATIVE_METRIC_SCHEMA_VERSION,
    );
    expect(FIRST_AGGREGATE_METRIC_SAMPLING_POLICY).toEqual({
      version: METRIC_SAMPLING_POLICY_VERSION,
      everyTicks: 64,
      offsetTicks: 0,
    });

    expect(plan.splitGroupCounts.train).toBeGreaterThan(0);
    expect(plan.splitGroupCounts.validation).toBeGreaterThan(0);
    expect(plan.splitGroupCounts.test).toBeGreaterThan(0);
    expect(
      plan.splitGroupCounts.train +
        plan.splitGroupCounts.validation +
        plan.splitGroupCounts.test,
    ).toBe(9);

    const conditions = new Set(
      plan.tasks.map((task) => task.runConditionId),
    );
    expect(conditions.size).toBe(9);
    for (const conditionId of conditions) {
      const tasks = plan.tasks.filter(
        (task) => task.runConditionId === conditionId,
      );
      expect(tasks).toHaveLength(3);
      expect(new Set(tasks.map((task) => task.split)).size).toBe(1);
      expect(tasks.map((task) => task.trajectory.seed)).toEqual([
        0x5eed1234,
        0x5eed1235,
        0x5eed1236,
      ]);
    }

    expect(
      new Set(
        plan.tasks.map(
          (task) => task.trajectory.group.parameterSetHash,
        ),
      ).size,
    ).toBe(1);
    expect(
      new Set(
        plan.tasks.map(
          (task) => task.trajectory.interventionFingerprint,
        ),
      ).size,
    ).toBe(1);
  });

  it("carries only compact run-condition descriptors across the worker package boundary", () => {
    const datasetPackage = createNodeMechanisticDatasetPackage();
    const executorData = datasetPackage.executorData;

    expect(executorData.conditions).toHaveLength(9);
    expect(executorData.allowedTaskIds).toHaveLength(27);
    expect(structuredClone(executorData)).toEqual(executorData);
    expect(
      Object.hasOwn(executorData.conditions[0]!, "config"),
    ).toBe(false);
    expect(
      Object.hasOwn(executorData.conditions[0]!, "initialResource"),
    ).toBe(false);
    expect(
      Object.hasOwn(
        executorData.conditions[0]!,
        "initialLineageBiomass",
      ),
    ).toBe(false);
  });

  it("reconstructs exact authoritative run state from the task identity", () => {
    const datasetPackage = createNodeMechanisticDatasetPackage();
    const task = datasetPackage.plan.tasks[0]!;
    const definition = resolveNodeMechanisticDatasetTaskDefinition(
      task,
      datasetPackage.executorData,
    );

    expect(() =>
      assertTaskMatchesMechanisticExecutionDefinition(
        task,
        definition.executionDefinition,
        definition.config,
      ),
    ).not.toThrow();

    const condition = datasetPackage.executorData.conditions.find(
      (candidate) => candidate.id === task.runConditionId,
    )!;
    const centerCell = 80 * definition.config.width + 80;
    expect(definition.config.initialResource[centerCell]).toBe(
      condition.initialResourceLevel,
    );
    expect(
      definition.config.initialLineageBiomass[0]![centerCell],
    ).toBe(condition.founderBiomass);
    expect(definition.executionDefinition.intervention.commands).toEqual(
      [],
    );
  });

  it("pairs the real initial checkpoint with a subsequent authoritative state instead of synthetic zero flux", () => {
    const datasetPackage = createNodeMechanisticDatasetPackage();
    const task = datasetPackage.plan.tasks[0]!;
    const definition = resolveNodeMechanisticDatasetTaskDefinition(
      task,
      datasetPackage.executorData,
    );
    const binding = definition.executionDefinition.parameterSetBinding;
    const engine = new ComposedSimulationEngine(
      createRunIdentity({
        scenarioId: task.trajectory.group.scenarioId,
        scenarioVersion: task.trajectory.group.scenarioVersion,
        parameterSetId: binding.parameterSetId,
        parameterSetVersion: binding.parameterSetVersion,
        parameterSetBinding: binding,
        seed: task.trajectory.seed,
      }),
      definition.config,
    );

    const source = engine.snapshot();
    const target = engine.execute({
      id: "first-aggregate-transition-test",
      type: "advance",
      ticks: 64,
    });
    const projected = projectFirstAggregateTransition(source, target, {
      task,
      snapshotIndex: 0,
      sourceSnapshotIndex: 0,
      targetSnapshotIndex: 1,
      sourceTick: 0,
      targetTick: 64,
      final: false,
    });

    expect(projected.input).toEqual({
      sourceSnapshotIndex: 0,
      sourceTick: 0,
      sourceTimeHours: source.checkpoint.simulationTimeHours,
      totalBiomass: source.checkpoint.metrics.totalBiomass,
      totalResource: source.checkpoint.metrics.totalResource,
      occupiedCells: source.checkpoint.metrics.occupiedCells,
    });
    expect(projected.target).toEqual({
      targetSnapshotIndex: 1,
      targetTick: 64,
      targetTimeHours: target.checkpoint.simulationTimeHours,
      forecastHorizonTicks: 64,
      forecastHorizonHours:
        target.checkpoint.simulationTimeHours -
        source.checkpoint.simulationTimeHours,
      totalBiomass: target.checkpoint.metrics.totalBiomass,
      totalResource: target.checkpoint.metrics.totalResource,
      occupiedCells: target.checkpoint.metrics.occupiedCells,
    });
    expect(Object.hasOwn(projected.target, "divisionBiomass")).toBe(false);
    expect(Object.hasOwn(projected.target, "deathBiomass")).toBe(false);
    expect(Object.hasOwn(projected.target, "resourceConsumed")).toBe(false);
    expect(projected.target.targetTimeHours).toBeGreaterThan(
      projected.input.sourceTimeHours,
    );
  });

  it("fails closed when transition context tick identity differs from the accepted snapshots", () => {
    const datasetPackage = createNodeMechanisticDatasetPackage();
    const task = datasetPackage.plan.tasks[0]!;
    const definition = resolveNodeMechanisticDatasetTaskDefinition(
      task,
      datasetPackage.executorData,
    );
    const binding = definition.executionDefinition.parameterSetBinding;
    const engine = new ComposedSimulationEngine(
      createRunIdentity({
        scenarioId: task.trajectory.group.scenarioId,
        scenarioVersion: task.trajectory.group.scenarioVersion,
        parameterSetId: binding.parameterSetId,
        parameterSetVersion: binding.parameterSetVersion,
        parameterSetBinding: binding,
        seed: task.trajectory.seed,
      }),
      definition.config,
    );
    const source = engine.snapshot();
    const target = engine.execute({
      id: "first-aggregate-context-drift-test",
      type: "advance",
      ticks: 64,
    });

    expect(() =>
      projectFirstAggregateTransition(source, target, {
        task,
        snapshotIndex: 0,
        sourceSnapshotIndex: 0,
        targetSnapshotIndex: 1,
        sourceTick: 1,
        targetTick: 64,
        final: false,
      }),
    ).toThrow(/context ticks must match/);
  });

  it("refuses off-cadence aggregate snapshots through canonical metric authority", () => {
    const datasetPackage = createNodeMechanisticDatasetPackage();
    const task = datasetPackage.plan.tasks[0]!;
    const definition = resolveNodeMechanisticDatasetTaskDefinition(
      task,
      datasetPackage.executorData,
    );
    const binding = definition.executionDefinition.parameterSetBinding;
    const engine = new ComposedSimulationEngine(
      createRunIdentity({
        scenarioId: task.trajectory.group.scenarioId,
        scenarioVersion: task.trajectory.group.scenarioVersion,
        parameterSetId: binding.parameterSetId,
        parameterSetVersion: binding.parameterSetVersion,
        parameterSetBinding: binding,
        seed: task.trajectory.seed,
      }),
      definition.config,
    );
    const source = engine.snapshot();
    const target = engine.execute({
      id: "first-aggregate-off-cadence-test",
      type: "advance",
      ticks: 2,
    });

    expect(() =>
      projectFirstAggregateTransition(source, target, {
        task,
        snapshotIndex: 0,
        sourceSnapshotIndex: 0,
        targetSnapshotIndex: 1,
        sourceTick: 0,
        targetTick: 2,
        final: false,
      }),
    ).toThrow(/off the declared metric sampling cadence/);
  });

  it("fails closed when worker executor data or task identity is tampered", () => {
    const datasetPackage = createNodeMechanisticDatasetPackage();
    const task = datasetPackage.plan.tasks[0]!;

    expect(() =>
      resolveNodeMechanisticDatasetTaskDefinition(
        {
          ...task,
          parameterPointId: "foreign-parameter-point",
        },
        datasetPackage.executorData,
      ),
    ).toThrow(/unexpected mechanism parameter point/);

    expect(() =>
      resolveNodeMechanisticDatasetTaskDefinition(
        task,
        {
          ...datasetPackage.executorData,
          executionSchedule: {
            ...datasetPackage.executorData.executionSchedule,
            totalTicks: 512,
          },
        },
      ),
    ).toThrow(/schedule does not match package authority/);

    expect(() =>
      resolveNodeMechanisticDatasetTaskDefinition(
        task,
        {
          ...datasetPackage.executorData,
          conditions: datasetPackage.executorData.conditions.slice(1),
        },
      ),
    ).toThrow(/all nine engineering run conditions/);
  });
});
