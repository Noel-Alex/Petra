import type { ComposedSimulationConfig } from "../src/sim/authoritative";
import type { MechanisticExecutionDefinition } from "../src/ml/executionDefinition";
import {
  validateMechanisticExecutionSchedule,
  type MechanisticExecutionSchedule,
} from "../src/ml/executionSchedule";
import type {
  ComposedMechanisticTaskDefinition,
} from "../src/ml/runner";
import type { MechanisticSweepTask } from "../src/ml/sweep";
import type { ComposedSimulationSnapshot } from "../src/sim/protocol";

export const NODE_AUTHORITATIVE_PROFILE_DATA_SCHEMA_VERSION =
  "petra-ml-node-authoritative-profile-data-v1" as const;

export interface NodeAuthoritativeProfileInput {
  readonly tick: number;
  readonly simulationTimeHours: number;
  readonly totalBiomass: number;
  readonly totalResource: number;
}

export interface NodeAuthoritativeProfileTarget {
  readonly occupiedCells: number;
  readonly divisionBiomass: number;
  readonly deathBiomass: number;
  readonly resourceConsumed: number;
  readonly lineageBiomass: Readonly<Record<string, number>>;
}

export interface NodeAuthoritativeProfileExecutorData {
  readonly schemaVersion: typeof NODE_AUTHORITATIVE_PROFILE_DATA_SCHEMA_VERSION;
  readonly allowedTaskIds: readonly string[];
  readonly executionDefinition: MechanisticExecutionDefinition;
  readonly config: ComposedSimulationConfig;
  readonly schedule: MechanisticExecutionSchedule;
}

export function resolveNodeAuthoritativeProfileDefinition(
  task: MechanisticSweepTask,
  data: NodeAuthoritativeProfileExecutorData,
): ComposedMechanisticTaskDefinition<
  NodeAuthoritativeProfileInput,
  NodeAuthoritativeProfileTarget
> {
  validateProfileExecutorData(data);
  if (!data.allowedTaskIds.includes(task.taskId)) {
    throw new RangeError(
      `node authoritative profile received unregistered task ${task.taskId}`,
    );
  }

  return {
    executionDefinition: structuredClone(data.executionDefinition),
    config: structuredClone(data.config),
    project: projectNodeAuthoritativeProfileSnapshot,
    terminationReason: "node-authoritative-profile-complete",
  };
}

export function projectNodeAuthoritativeProfileSnapshot(
  snapshot: ComposedSimulationSnapshot,
): {
  readonly input: NodeAuthoritativeProfileInput;
  readonly target: NodeAuthoritativeProfileTarget;
} {
  if (snapshot.checkpoint.authority !== "composed") {
    throw new TypeError(
      "node authoritative profile requires a composed checkpoint",
    );
  }

  const checkpoint = snapshot.checkpoint;
  return Object.freeze({
    input: Object.freeze({
      tick: checkpoint.tick,
      simulationTimeHours: checkpoint.simulationTimeHours,
      totalBiomass: checkpoint.metrics.totalBiomass,
      totalResource: checkpoint.metrics.totalResource,
    }),
    target: Object.freeze({
      occupiedCells: checkpoint.metrics.occupiedCells,
      divisionBiomass: checkpoint.metrics.divisionBiomass,
      deathBiomass: checkpoint.metrics.deathBiomass,
      resourceConsumed: checkpoint.metrics.resourceConsumed,
      lineageBiomass: Object.freeze({
        ...checkpoint.metrics.lineageBiomass,
      }),
    }),
  });
}

function validateProfileExecutorData(
  data: NodeAuthoritativeProfileExecutorData,
): void {
  if (
    data === null ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    data.schemaVersion !== NODE_AUTHORITATIVE_PROFILE_DATA_SCHEMA_VERSION
  ) {
    throw new TypeError(
      "unsupported node authoritative profile executor data",
    );
  }
  if (!Array.isArray(data.allowedTaskIds) || data.allowedTaskIds.length < 1) {
    throw new RangeError(
      "node authoritative profile requires at least one registered task",
    );
  }

  const seen = new Set<string>();
  for (let index = 0; index < data.allowedTaskIds.length; index += 1) {
    if (!(index in data.allowedTaskIds)) {
      throw new TypeError(
        "node authoritative profile task ids must be a dense array",
      );
    }
    const taskId = data.allowedTaskIds[index];
    if (
      typeof taskId !== "string" ||
      taskId.length === 0 ||
      taskId !== taskId.trim()
    ) {
      throw new TypeError(
        "node authoritative profile task ids must be canonical non-empty strings",
      );
    }
    if (seen.has(taskId)) {
      throw new RangeError(
        `duplicate node authoritative profile task id: ${taskId}`,
      );
    }
    seen.add(taskId);
  }

  validateMechanisticExecutionSchedule(data.schedule);
}
