import type { MechanisticSample } from "./dataset";
import {
  IncrementalMechanisticDatasetCollector,
  mechanisticIncrementalPlanDigest,
} from "./incrementalGenerator";
import type {
  MechanisticTrajectoryResult,
} from "./generator";
import {
  validatePlanForCollection,
} from "./generator";
import type {
  MechanisticSweepPlan,
  MechanisticSweepTask,
} from "./sweep";
import {
  ComposedSimulationEngine,
} from "../sim/composedEngine";
import {
  ENGINE_VERSION,
  createRunIdentity,
  type ComposedSimulationSnapshot,
  type RunIdentity,
} from "../sim/protocol";
import type { ComposedSimulationConfig } from "../sim/authoritative";
import {
  assertTaskMatchesMechanisticExecutionDefinition,
  type MechanisticExecutionDefinition,
} from "./executionDefinition";

export interface MechanisticRunnerOptions {
  readonly maxConcurrency: number;
}

export interface MechanisticTaskFailure {
  readonly name: string;
  readonly message: string;
}

export type MechanisticTaskRunRecord =
  | {
      readonly taskId: string;
      readonly trajectoryKey: string;
      readonly status: "resumed" | "completed";
    }
  | {
      readonly taskId: string;
      readonly trajectoryKey: string;
      readonly status: "failed";
      readonly failure: MechanisticTaskFailure;
    };

export interface MechanisticSweepRunReport {
  readonly schemaVersion: "petra-ml-run-report-v1";
  readonly planDigest: string;
  readonly plannedTrajectoryCount: number;
  readonly resumedTrajectoryCount: number;
  readonly completedTrajectoryCount: number;
  readonly failedTrajectoryCount: number;
  readonly records: readonly MechanisticTaskRunRecord[];
}

export interface MechanisticTaskExecutor<TInput, TTarget> {
  execute(
    task: MechanisticSweepTask,
  ): Promise<MechanisticTrajectoryResult<TInput, TTarget>>;
}

export interface ComposedMechanisticTaskDefinition<TInput, TTarget> {
  readonly executionDefinition: MechanisticExecutionDefinition;
  readonly config: ComposedSimulationConfig;
  /**
   * Point-observation projection. Existing packages use one accepted snapshot
   * as both input/target observation authority.
   *
   * Exactly one of project / projectTransition must be supplied.
   */
  readonly project?: (
    snapshot: ComposedSimulationSnapshot,
    context: {
      readonly task: MechanisticSweepTask;
      readonly snapshotIndex: number;
      readonly final: boolean;
    },
  ) => {
    readonly input: TInput;
    readonly target: TTarget;
  };
  /**
   * Transition projection for supervised future-dynamics rows.
   *
   * The source is the exact accepted snapshot before one runner advance
   * command; target is the exact accepted snapshot returned by that command.
   * This lets a package bind source-state -> future-target semantics without
   * inventing an initial zero target or reverse-pairing post-state with the
   * flux that produced it.
   *
   * Exactly one of project / projectTransition must be supplied.
   */
  readonly projectTransition?: (
    sourceSnapshot: ComposedSimulationSnapshot,
    targetSnapshot: ComposedSimulationSnapshot,
    context: {
      readonly task: MechanisticSweepTask;
      readonly snapshotIndex: number;
      readonly sourceSnapshotIndex: number;
      readonly targetSnapshotIndex: number;
      readonly final: boolean;
    },
  ) => {
    readonly input: TInput;
    readonly target: TTarget;
  };
  readonly terminationReason?: string;
}

/**
 * Resolves one canonical sweep identity to the exact authoritative composed
 * configuration and projection contract used for offline dataset generation.
 *
 * The resolver owns parameter/intervention semantics. The runner deliberately
 * does not derive biological values from display ids or ML metadata.
 */
export type ComposedMechanisticTaskResolver<TInput, TTarget> = (
  task: MechanisticSweepTask,
) => ComposedMechanisticTaskDefinition<TInput, TTarget>;

export function createComposedMechanisticTaskExecutor<TInput, TTarget>(
  resolve: ComposedMechanisticTaskResolver<TInput, TTarget>,
): MechanisticTaskExecutor<TInput, TTarget> {
  return {
    async execute(task) {
      const definition = resolve(task);
      validateComposedTaskDefinition(task, definition);

      const parameterSetBinding =
        definition.executionDefinition.parameterSetBinding;
      const identity: RunIdentity = createRunIdentity({
        scenarioId: task.trajectory.group.scenarioId,
        scenarioVersion: task.trajectory.group.scenarioVersion,
        parameterSetId: parameterSetBinding.parameterSetId,
        parameterSetVersion: parameterSetBinding.parameterSetVersion,
        parameterSetBinding,
        seed: task.trajectory.seed,
      });
      const engine = new ComposedSimulationEngine(identity, definition.config);
      const samples: MechanisticSample<TInput, TTarget>[] = [];

      let snapshotIndex = 0;
      let advancedTicks = 0;
      let snapshot = engine.snapshot();

      const appendPoint = (final: boolean) => {
        const project = definition.project;
        if (project === undefined) {
          throw new TypeError(
            "composed point projection is unavailable for this task definition",
          );
        }
        const projected = project(snapshot, {
          task,
          snapshotIndex,
          final,
        });
        samples.push({
          datasetVersion: task.datasetVersion,
          trajectory: structuredClone(task.trajectory),
          snapshotIndex,
          simulationTimeHours: snapshot.checkpoint.simulationTimeHours,
          normalizationProfileId: task.normalizationProfileId,
          datasetSchema: structuredClone(task.datasetSchema),
          input: structuredClone(projected.input),
          target: structuredClone(projected.target),
          ...(final
            ? {
                terminationReason:
                  definition.terminationReason ?? "completed-horizon",
              }
            : {}),
        });
        snapshotIndex += 1;
      };

      const appendTransition = (
        sourceSnapshot: ComposedSimulationSnapshot,
        targetSnapshot: ComposedSimulationSnapshot,
        sourceSnapshotIndex: number,
        targetSnapshotIndex: number,
        final: boolean,
      ) => {
        const projectTransition = definition.projectTransition;
        if (projectTransition === undefined) {
          throw new TypeError(
            "composed transition projection is unavailable for this task definition",
          );
        }
        if (
          targetSnapshot.checkpoint.tick <= sourceSnapshot.checkpoint.tick ||
          targetSnapshot.checkpoint.simulationTimeHours <=
            sourceSnapshot.checkpoint.simulationTimeHours
        ) {
          throw new RangeError(
            "composed transition projection requires a strictly future accepted target snapshot",
          );
        }
        const projected = projectTransition(
          sourceSnapshot,
          targetSnapshot,
          {
            task,
            snapshotIndex,
            sourceSnapshotIndex,
            targetSnapshotIndex,
            final,
          },
        );
        samples.push({
          datasetVersion: task.datasetVersion,
          trajectory: structuredClone(task.trajectory),
          snapshotIndex,
          // Transition rows are finalized by the accepted target snapshot.
          // Source/target time identity belongs in the package's versioned
          // input/target schema; this top-level time remains the accepted row
          // completion time for existing dataset integrity/finalization code.
          simulationTimeHours:
            targetSnapshot.checkpoint.simulationTimeHours,
          normalizationProfileId: task.normalizationProfileId,
          datasetSchema: structuredClone(task.datasetSchema),
          input: structuredClone(projected.input),
          target: structuredClone(projected.target),
          ...(final
            ? {
                terminationReason:
                  definition.terminationReason ?? "completed-horizon",
              }
            : {}),
        });
        snapshotIndex += 1;
      };

      if (definition.projectTransition !== undefined) {
        let commandIndex = 0;
        let sourceSnapshotIndex = 0;
        while (advancedTicks < task.executionSchedule.totalTicks) {
          const ticks = Math.min(
            task.executionSchedule.snapshotEveryTicks,
            task.executionSchedule.totalTicks - advancedTicks,
          );
          const sourceSnapshot = snapshot;
          const targetSnapshot = engine.execute({
            id: runnerCommandId(task.taskId, commandIndex),
            type: "advance",
            ticks,
          });
          advancedTicks += ticks;
          commandIndex += 1;
          const targetSnapshotIndex = sourceSnapshotIndex + 1;
          appendTransition(
            sourceSnapshot,
            targetSnapshot,
            sourceSnapshotIndex,
            targetSnapshotIndex,
            advancedTicks === task.executionSchedule.totalTicks,
          );
          snapshot = targetSnapshot;
          sourceSnapshotIndex = targetSnapshotIndex;
        }
      } else if (task.executionSchedule.totalTicks === 0) {
        appendPoint(true);
      } else {
        appendPoint(false);
        let commandIndex = 0;
        while (advancedTicks < task.executionSchedule.totalTicks) {
          const ticks = Math.min(
            task.executionSchedule.snapshotEveryTicks,
            task.executionSchedule.totalTicks - advancedTicks,
          );
          snapshot = engine.execute({
            id: runnerCommandId(task.taskId, commandIndex),
            type: "advance",
            ticks,
          });
          advancedTicks += ticks;
          commandIndex += 1;
          appendPoint(advancedTicks === task.executionSchedule.totalTicks);
        }
      }

      return Object.freeze({
        taskId: task.taskId,
        samples: Object.freeze(samples),
      });
    },
  };
}

/**
 * Executes only unstaged sweep tasks with bounded concurrency.
 *
 * Completion order is intentionally discarded. The returned report is rebuilt
 * in canonical sweep-plan order, while validated trajectories are streamed into
 * the incremental collector immediately on completion. A resumed task is never
 * executed again.
 */
export async function runMechanisticSweep<TInput, TTarget>(
  plan: MechanisticSweepPlan,
  collector: IncrementalMechanisticDatasetCollector<TInput, TTarget>,
  executor: MechanisticTaskExecutor<TInput, TTarget>,
  options: MechanisticRunnerOptions,
): Promise<MechanisticSweepRunReport> {
  validatePlanForCollection(plan);
  validateRunnerOptions(options);

  const planDigest = mechanisticIncrementalPlanDigest(plan);
  if (collector.planDigest !== planDigest) {
    throw new TypeError(
      "mechanistic runner collector belongs to a different sweep plan",
    );
  }

  const records = new Map<string, MechanisticTaskRunRecord>();
  const pending: MechanisticSweepTask[] = [];

  for (const task of plan.tasks) {
    if (collector.hasStagedTrajectory(task.taskId)) {
      records.set(
        task.taskId,
        Object.freeze({
          taskId: task.taskId,
          trajectoryKey: task.trajectoryKey,
          status: "resumed",
        }),
      );
    } else {
      pending.push(task);
    }
  }

  let cursor = 0;
  const workerCount = Math.min(options.maxConcurrency, pending.length);

  const worker = async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      const task = pending[index];
      if (task === undefined) return;

      try {
        const result = await executor.execute(task);
        if (result.taskId !== task.taskId) {
          throw new TypeError(
            `mechanistic executor returned task ${result.taskId} while running ${task.taskId}`,
          );
        }
        collector.stageTrajectory(result);
        records.set(
          task.taskId,
          Object.freeze({
            taskId: task.taskId,
            trajectoryKey: task.trajectoryKey,
            status: "completed",
          }),
        );
      } catch (error) {
        records.set(
          task.taskId,
          Object.freeze({
            taskId: task.taskId,
            trajectoryKey: task.trajectoryKey,
            status: "failed",
            failure: normalizeFailure(error),
          }),
        );
      }
    }
  };

  await Promise.all(
    Array.from({ length: workerCount }, () => worker()),
  );

  const ordered = plan.tasks.map((task) => {
    const record = records.get(task.taskId);
    if (record === undefined) {
      throw new Error(
        `mechanistic runner lost task outcome for ${task.taskId}`,
      );
    }
    return record;
  });

  const resumedTrajectoryCount = ordered.filter(
    (record) => record.status === "resumed",
  ).length;
  const completedTrajectoryCount = ordered.filter(
    (record) => record.status === "completed",
  ).length;
  const failedTrajectoryCount = ordered.filter(
    (record) => record.status === "failed",
  ).length;

  return Object.freeze({
    schemaVersion: "petra-ml-run-report-v1",
    planDigest,
    plannedTrajectoryCount: plan.tasks.length,
    resumedTrajectoryCount,
    completedTrajectoryCount,
    failedTrajectoryCount,
    records: Object.freeze(ordered),
  });
}

function validateComposedTaskDefinition<TInput, TTarget>(
  task: MechanisticSweepTask,
  definition: ComposedMechanisticTaskDefinition<TInput, TTarget>,
): void {
  if (task.trajectory.group.engineVersion !== ENGINE_VERSION) {
    throw new TypeError(
      `sweep task engineVersion ${task.trajectory.group.engineVersion} does not match authoritative engine ${ENGINE_VERSION}`,
    );
  }
  if (
    definition.config.evolutionScenario.scenarioId !==
      task.trajectory.group.scenarioId ||
    definition.config.evolutionScenario.scenarioVersion !==
      task.trajectory.group.scenarioVersion
  ) {
    throw new TypeError(
      "resolved composed configuration scenario does not match sweep task",
    );
  }
  assertTaskMatchesMechanisticExecutionDefinition(
    task,
    definition.executionDefinition,
    definition.config,
  );
  const hasPointProjection = typeof definition.project === "function";
  const hasTransitionProjection =
    typeof definition.projectTransition === "function";
  if (hasPointProjection === hasTransitionProjection) {
    throw new TypeError(
      "composed mechanistic task definition must supply exactly one of project or projectTransition",
    );
  }
  if (
    hasTransitionProjection &&
    task.executionSchedule.totalTicks === 0
  ) {
    throw new RangeError(
      "composed transition projection requires a positive execution horizon",
    );
  }
  if (
    definition.terminationReason !== undefined &&
    definition.terminationReason.trim().length === 0
  ) {
    throw new TypeError("terminationReason must be non-empty when supplied");
  }
}

function validateRunnerOptions(options: MechanisticRunnerOptions): void {
  if (
    !Number.isSafeInteger(options.maxConcurrency) ||
    options.maxConcurrency < 1
  ) {
    throw new RangeError("maxConcurrency must be a positive safe integer");
  }
}

function runnerCommandId(taskId: string, index: number): string {
  return `ml-run:${taskId.length}:${taskId}:advance:${index}`;
}

function normalizeFailure(error: unknown): MechanisticTaskFailure {
  if (error instanceof Error) {
    return Object.freeze({
      name: error.name || "Error",
      message: error.message || "mechanistic task failed",
    });
  }
  return Object.freeze({
    name: "NonErrorFailure",
    message: typeof error === "string" ? error : "mechanistic task failed",
  });
}
