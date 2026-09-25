import { splitGroupKey, trajectoryKey } from "./dataset";
import {
  validateMechanisticExecutionSchedule,
  type MechanisticExecutionSchedule,
} from "./executionSchedule";
import {
  buildExactMechanisticForecastRows,
  type AuthoritativeForecastObservation,
  type MechanisticForecastRowSet,
} from "./forecastRows";
import {
  validateTrajectoryResult,
  type MechanisticTrajectoryResult,
} from "./generator";
import type { MechanisticSweepTask } from "./sweep";

/**
 * Converts one completed authoritative mechanistic trajectory into exact
 * future-horizon rows using only the trajectory's declared execution schedule.
 *
 * Runner samples intentionally do not carry an independent tick field. The
 * schedule is therefore the sole authority for reconstructing observation
 * ticks here: 0, each full cadence boundary, and the exact final totalTicks
 * remainder when present. Biological time is retained from the authoritative
 * samples but is never used to infer or interpolate a target tick.
 */
export function buildMechanisticForecastRowsFromTrajectory<TInput, TTarget>(
  args: {
    readonly task: MechanisticSweepTask;
    readonly result: MechanisticTrajectoryResult<TInput, TTarget>;
    readonly schedule: MechanisticExecutionSchedule;
    readonly requestedHorizonTicks: readonly number[];
  },
): MechanisticForecastRowSet<TInput, TTarget> {
  assertTaskIdentity(args.task);

  if (args.result.taskId !== args.task.taskId) {
    throw new TypeError(
      `mechanistic forecast trajectory result task ${args.result.taskId} does not match planned task ${args.task.taskId}`,
    );
  }

  validateMechanisticExecutionSchedule(args.schedule);
  validateTrajectoryResult(args.task, args.result.samples);

  const observationTicks = scheduledObservationTicks(args.schedule);
  if (args.result.samples.length !== observationTicks.length) {
    throw new RangeError(
      `mechanistic forecast trajectory sample count does not match execution schedule; expected ${observationTicks.length}, received ${args.result.samples.length}`,
    );
  }

  const observations: AuthoritativeForecastObservation<TInput, TTarget>[] =
    args.result.samples.map((sample, index) => ({
      snapshotIndex: sample.snapshotIndex,
      tick: observationTicks[index]!,
      simulationTimeHours: sample.simulationTimeHours,
      input: sample.input,
      target: sample.target,
    }));

  return buildExactMechanisticForecastRows({
    splitGroupKey: args.task.splitGroupKey,
    trajectoryKey: args.task.trajectoryKey,
    requestedHorizonTicks: args.requestedHorizonTicks,
    observations,
  });
}

function scheduledObservationTicks(
  schedule: MechanisticExecutionSchedule,
): readonly number[] {
  const ticks = [0];

  let advancedTicks = 0;
  while (advancedTicks < schedule.totalTicks) {
    advancedTicks += Math.min(
      schedule.snapshotEveryTicks,
      schedule.totalTicks - advancedTicks,
    );
    ticks.push(advancedTicks);
  }

  return Object.freeze(ticks);
}

function assertTaskIdentity(task: MechanisticSweepTask): void {
  if (
    typeof task.taskId !== "string" ||
    task.taskId.length === 0 ||
    task.taskId !== task.taskId.trim()
  ) {
    throw new TypeError("mechanistic forecast taskId must be canonical text");
  }

  if (
    typeof task.runConditionId !== "string" ||
    task.runConditionId.length === 0 ||
    task.runConditionId !== task.runConditionId.trim()
  ) {
    throw new TypeError(
      "mechanistic forecast runConditionId must be canonical text",
    );
  }

  const expectedGroupKey = splitGroupKey(task.trajectory.group);
  if (task.splitGroupKey !== expectedGroupKey) {
    throw new TypeError(
      "mechanistic forecast task splitGroupKey does not match trajectory group identity",
    );
  }

  const expectedTrajectoryKey = trajectoryKey(task.trajectory);
  if (task.trajectoryKey !== expectedTrajectoryKey) {
    throw new TypeError(
      "mechanistic forecast task trajectoryKey does not match trajectory identity",
    );
  }
}
