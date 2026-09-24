import { describe, expect, it } from "vitest";

import type { SimulationEvent } from "../sim/protocol";
import {
  createTimelineBookmark,
  planFastForwardUntilEvent,
  resolveTimelineTargetSupport,
} from "./timelineTargets";

function event(
  sequence: number,
  type: SimulationEvent["type"],
  simulationTimeHours: number,
  commandId?: string,
): SimulationEvent {
  return {
    sequence,
    tick: sequence * 10,
    simulationTimeHours,
    type,
    ...(commandId === undefined ? {} : { commandId }),
  };
}

describe("timeline event targets", () => {
  it("lands on the exact authoritative event identity and biological time", () => {
    const events = [
      event(3, "advanced", 1.25, "advance-a"),
      event(7, "restored", 1.25, "restore-a"),
      event(9, "advanced", 1.5, "advance-b"),
    ];

    const plan = planFastForwardUntilEvent({
      runBranchIdentity: "run-a/branch-1",
      target: {
        kind: "authoritative-event",
        eventType: "restored",
        commandId: "restore-a",
      },
      events,
      afterSequence: -1,
    });

    expect(plan).toEqual({
      status: "stop",
      target: {
        kind: "authoritative-event",
        eventType: "restored",
        commandId: "restore-a",
      },
      event: events[1],
      landing: {
        sequence: 7,
        tick: 70,
        simulationTimeHours: 1.25,
      },
    });
  });

  it("continues from an event cursor without treating biological time as ordering", () => {
    const plan = planFastForwardUntilEvent({
      runBranchIdentity: "run-a/branch-1",
      target: { kind: "authoritative-event", eventType: "restored" },
      events: [
        event(4, "advanced", 2),
        event(8, "advanced", 2),
      ],
      afterSequence: 4,
    });

    expect(plan).toEqual({
      status: "continue",
      target: { kind: "authoritative-event", eventType: "restored" },
      inspectedThroughSequence: 8,
    });
  });

  it("refuses named scientific targets until authority emits explicit evidence", () => {
    const target = {
      kind: "scientific-event" as const,
      eventKind: "resistant-fraction-crossing" as const,
      definitionId: "flagship-cipro-resistant-fraction-v1",
    };

    const support = resolveTimelineTargetSupport(target);
    expect(support.supported).toBe(false);

    const plan = planFastForwardUntilEvent({
      runBranchIdentity: "run-a/branch-1",
      target,
      events: [event(1, "advanced", 0.25)],
      afterSequence: -1,
    });

    expect(plan.status).toBe("refused");
    if (plan.status === "refused") {
      expect(plan.reason).toContain("cannot prove");
    }
  });

  it("refuses synthetic fixture pulses as product scientific targets", () => {
    const plan = planFastForwardUntilEvent({
      runBranchIdentity: "run-a/branch-1",
      target: {
        kind: "authoritative-event",
        eventType: "synthetic-pulse",
      },
      events: [event(1, "synthetic-pulse", 0.25, "fixture-pulse")],
      afterSequence: -1,
    });

    expect(plan).toMatchObject({
      status: "refused",
    });
  });

  it("fails closed on reordered or duplicate event identity", () => {
    expect(() =>
      planFastForwardUntilEvent({
        runBranchIdentity: "run-a/branch-1",
        target: { kind: "authoritative-event", eventType: "advanced" },
        events: [
          event(5, "advanced", 1),
          event(5, "restored", 1),
        ],
        afterSequence: -1,
      }),
    ).toThrow(/strictly increasing/);
  });

  it("creates branch-scoped presentation bookmarks from exact event identity", () => {
    expect(
      createTimelineBookmark({
        bookmarkId: "bookmark-1",
        runBranchIdentity: "run-a/branch-1",
        event: event(12, "restored", 3.5, "restore-12"),
        label: "Before second intervention",
        note: "Presenter cue",
      }),
    ).toEqual({
      schemaVersion: 1,
      bookmarkId: "bookmark-1",
      runBranchIdentity: "run-a/branch-1",
      eventSequence: 12,
      tick: 120,
      simulationTimeHours: 3.5,
      label: "Before second intervention",
      note: "Presenter cue",
    });
  });

  it("rejects malformed branch, bookmark, and cursor identity", () => {
    expect(() =>
      createTimelineBookmark({
        bookmarkId: " bookmark-1",
        runBranchIdentity: "run-a/branch-1",
        event: event(1, "advanced", 0.25),
        label: "Start",
      }),
    ).toThrow(/bookmarkId/);

    expect(() =>
      planFastForwardUntilEvent({
        runBranchIdentity: " run-a",
        target: { kind: "authoritative-event", eventType: "advanced" },
        events: [],
        afterSequence: -1,
      }),
    ).toThrow(/runBranchIdentity/);

    expect(() =>
      planFastForwardUntilEvent({
        runBranchIdentity: "run-a",
        target: { kind: "authoritative-event", eventType: "advanced" },
        events: [],
        afterSequence: -2,
      }),
    ).toThrow(/afterSequence/);
  });
});
