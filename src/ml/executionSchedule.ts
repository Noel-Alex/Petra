export const MECHANISTIC_EXECUTION_SCHEDULE_SCHEMA_VERSION =
  "petra-ml-execution-schedule-v1" as const;

export interface MechanisticExecutionSchedule {
  readonly schemaVersion: typeof MECHANISTIC_EXECUTION_SCHEDULE_SCHEMA_VERSION;
  readonly totalTicks: number;
  readonly snapshotEveryTicks: number;
}

/**
 * Builds the exact deterministic sampling schedule for one mechanistic trajectory.
 *
 * This identity describes execution only. It does not claim that a particular
 * horizon or cadence is scientifically appropriate; callers must choose those
 * values from explicit sweep/repository authority.
 */
export function createMechanisticExecutionSchedule(args: {
  readonly totalTicks: number;
  readonly snapshotEveryTicks: number;
}): MechanisticExecutionSchedule {
  assertScheduleTicks("totalTicks", args.totalTicks, true);
  assertScheduleTicks("snapshotEveryTicks", args.snapshotEveryTicks, false);

  return Object.freeze({
    schemaVersion: MECHANISTIC_EXECUTION_SCHEDULE_SCHEMA_VERSION,
    totalTicks: args.totalTicks,
    snapshotEveryTicks: args.snapshotEveryTicks,
  });
}

/**
 * Exact inspectable identity used by sweep/task/resume provenance.
 *
 * The representation is length-prefixed rather than a lossy digest so a
 * reviewer can trace the identity back to its authoritative tick schedule.
 */
export function mechanisticExecutionScheduleIdentity(
  schedule: MechanisticExecutionSchedule,
): string {
  validateMechanisticExecutionSchedule(schedule);
  return encodeIdentity(MECHANISTIC_EXECUTION_SCHEDULE_SCHEMA_VERSION, [
    String(schedule.totalTicks),
    String(schedule.snapshotEveryTicks),
  ]);
}

export function validateMechanisticExecutionSchedule(
  schedule: MechanisticExecutionSchedule,
): void {
  if (
    schedule === null ||
    typeof schedule !== "object" ||
    Array.isArray(schedule)
  ) {
    throw new TypeError("mechanistic execution schedule must be an object");
  }
  if (
    schedule.schemaVersion !== MECHANISTIC_EXECUTION_SCHEDULE_SCHEMA_VERSION
  ) {
    throw new RangeError("unsupported mechanistic execution schedule version");
  }

  assertScheduleTicks("totalTicks", schedule.totalTicks, true);
  assertScheduleTicks(
    "snapshotEveryTicks",
    schedule.snapshotEveryTicks,
    false,
  );
}

/**
 * Fail closed when a resolver or durable stage record tries to reuse a task
 * under a different deterministic horizon/cadence.
 */
export function assertMechanisticExecutionScheduleMatches(
  expected: MechanisticExecutionSchedule,
  actual: MechanisticExecutionSchedule,
): void {
  const expectedIdentity = mechanisticExecutionScheduleIdentity(expected);
  const actualIdentity = mechanisticExecutionScheduleIdentity(actual);
  if (expectedIdentity !== actualIdentity) {
    throw new TypeError(
      "mechanistic execution schedule does not match planned horizon/cadence",
    );
  }
}

function assertScheduleTicks(
  name: string,
  value: number,
  allowZero: boolean,
): void {
  if (
    !Number.isSafeInteger(value) ||
    value < (allowZero ? 0 : 1)
  ) {
    throw new RangeError(
      `${name} must be a ${allowZero ? "non-negative" : "positive"} safe integer`,
    );
  }
}

function encodeIdentity(schema: string, parts: readonly string[]): string {
  return [schema, ...parts]
    .map((part) => `${part.length}:${part}`)
    .join("|");
}
