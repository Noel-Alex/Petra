import { describe, expect, it } from "vitest";

import {
  MECHANISTIC_EXECUTION_SCHEDULE_SCHEMA_VERSION,
  assertMechanisticExecutionScheduleMatches,
  createMechanisticExecutionSchedule,
  mechanisticExecutionScheduleIdentity,
  validateMechanisticExecutionSchedule,
  type MechanisticExecutionSchedule,
} from "./executionSchedule";

describe("mechanistic execution schedule identity", () => {
  it("changes exact identity when horizon or snapshot cadence changes", () => {
    const baseline = createMechanisticExecutionSchedule({
      totalTicks: 120,
      snapshotEveryTicks: 10,
    });

    expect(mechanisticExecutionScheduleIdentity(baseline)).toBe(
      mechanisticExecutionScheduleIdentity(
        createMechanisticExecutionSchedule({
          totalTicks: 120,
          snapshotEveryTicks: 10,
        }),
      ),
    );
    expect(
      mechanisticExecutionScheduleIdentity(
        createMechanisticExecutionSchedule({
          totalTicks: 121,
          snapshotEveryTicks: 10,
        }),
      ),
    ).not.toBe(mechanisticExecutionScheduleIdentity(baseline));
    expect(
      mechanisticExecutionScheduleIdentity(
        createMechanisticExecutionSchedule({
          totalTicks: 120,
          snapshotEveryTicks: 12,
        }),
      ),
    ).not.toBe(mechanisticExecutionScheduleIdentity(baseline));
  });

  it("allows a zero-tick trajectory but requires a positive snapshot cadence", () => {
    expect(
      createMechanisticExecutionSchedule({
        totalTicks: 0,
        snapshotEveryTicks: 1,
      }),
    ).toEqual({
      schemaVersion: MECHANISTIC_EXECUTION_SCHEDULE_SCHEMA_VERSION,
      totalTicks: 0,
      snapshotEveryTicks: 1,
    });

    expect(() =>
      createMechanisticExecutionSchedule({
        totalTicks: -1,
        snapshotEveryTicks: 1,
      }),
    ).toThrow(/totalTicks must be a non-negative safe integer/);
    expect(() =>
      createMechanisticExecutionSchedule({
        totalTicks: 1,
        snapshotEveryTicks: 0,
      }),
    ).toThrow(/snapshotEveryTicks must be a positive safe integer/);
    expect(() =>
      createMechanisticExecutionSchedule({
        totalTicks: 1.5,
        snapshotEveryTicks: 1,
      }),
    ).toThrow(/totalTicks must be a non-negative safe integer/);
  });

  it("rejects unsupported serialized schedule versions", () => {
    const unsupported = {
      schemaVersion: "petra-ml-execution-schedule-v0",
      totalTicks: 120,
      snapshotEveryTicks: 10,
    } as unknown as MechanisticExecutionSchedule;

    expect(() => validateMechanisticExecutionSchedule(unsupported)).toThrow(
      /unsupported mechanistic execution schedule version/,
    );
  });

  it("fails closed when planned and resolved schedules disagree", () => {
    const planned = createMechanisticExecutionSchedule({
      totalTicks: 120,
      snapshotEveryTicks: 10,
    });

    expect(() =>
      assertMechanisticExecutionScheduleMatches(
        planned,
        createMechanisticExecutionSchedule({
          totalTicks: 120,
          snapshotEveryTicks: 10,
        }),
      ),
    ).not.toThrow();

    expect(() =>
      assertMechanisticExecutionScheduleMatches(
        planned,
        createMechanisticExecutionSchedule({
          totalTicks: 120,
          snapshotEveryTicks: 20,
        }),
      ),
    ).toThrow(/does not match planned horizon\/cadence/);
  });
});
