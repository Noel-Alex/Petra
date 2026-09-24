import { describe, expect, it } from "vitest";
import {
  INITIAL_CAUSAL_ANNOUNCEMENT_CURSOR,
  planCausalAnnouncements,
} from "./announcements";
import type { CausalEventBurstItem } from "./scheduler";

describe("causal announcement planner", () => {
  it("keeps a single new event specific", () => {
    const plan = planCausalAnnouncements([
      event("mutation-1", 4, "mutation-observed"),
    ]);

    expect(plan.presentation).toBe("specific");
    expect(plan.message).toContain("Lineage change recorded");
    expect(plan.message).toContain("antibiotic does not direct a useful mutation");
    expect(plan.eventIds).toEqual(["mutation-1"]);
    expect(plan.nextCursor).toEqual({
      sequence: 4,
      eventId: "mutation-1",
    });
    expect(plan.liveRegion).toEqual({
      politeness: "polite",
      atomic: true,
    });
  });

  it("summarizes a dense event storm into one bounded count update", () => {
    const kinds = [
      "intervention-applied",
      "mutation-observed",
      "selection-shift-observed",
      "nutrient-depletion-observed",
      "lysis-observed",
    ] as const;
    const events = Array.from({ length: 50 }, (_, index) =>
      event(`event-${index}`, index, kinds[index % kinds.length]!),
    );

    const plan = planCausalAnnouncements(events);

    expect(plan.presentation).toBe("summary");
    expect(plan.eventIds).toHaveLength(50);
    expect(plan.message).toContain("50 new scientific events recorded");
    expect(plan.message).toContain("10 interventions");
    expect(plan.message).toContain("10 lineage changes");
    expect(plan.message).toContain("10 selection shifts");
    expect(plan.message).toContain("10 nutrient depletion events");
    expect(plan.message).toContain("10 lysis events");
    expect(plan.message).toContain("scientific timeline");
    expect(plan.firstSequence).toBe(0);
    expect(plan.lastSequence).toBe(49);
  });

  it("does not re-announce the same accepted batch on re-render", () => {
    const events = [
      event("event-1", 1, "intervention-applied"),
      event("event-2", 2, "selection-shift-observed"),
    ];

    const first = planCausalAnnouncements(events);
    const repeated = planCausalAnnouncements(events, first.nextCursor);

    expect(repeated.presentation).toBe("none");
    expect(repeated.message).toBeNull();
    expect(repeated.eventIds).toEqual([]);
    expect(repeated.nextCursor).toEqual(first.nextCursor);
  });

  it("announces only events newer than the caller-held authority cursor", () => {
    const events = [
      event("event-1", 1, "intervention-applied"),
      event("event-2", 2, "mutation-observed"),
      event("event-3", 3, "lysis-observed"),
    ];

    const plan = planCausalAnnouncements(events, {
      sequence: 2,
      eventId: "event-2",
    });

    expect(plan.presentation).toBe("specific");
    expect(plan.eventIds).toEqual(["event-3"]);
    expect(plan.nextCursor).toEqual({
      sequence: 3,
      eventId: "event-3",
    });
  });

  it("rejects cursor identity mismatch and id reuse", () => {
    const events = [
      event("event-1", 1, "intervention-applied"),
      event("event-2", 2, "mutation-observed"),
    ];

    expect(() =>
      planCausalAnnouncements(events, {
        sequence: 1,
        eventId: "different-id",
      }),
    ).toThrow(/cursor identity/);

    expect(() =>
      planCausalAnnouncements(
        [event("event-1", 2, "mutation-observed")],
        {
          sequence: 1,
          eventId: "event-1",
        },
      ),
    ).toThrow(/cannot be reused/);
  });

  it("rejects truncated same-stream history while preserving valid sequence gaps", () => {
    expect(() =>
      planCausalAnnouncements(
        [event("event-3", 3, "lysis-observed")],
        {
          sequence: 2,
          eventId: "event-2",
        },
      ),
    ).toThrow(/must remain present/);

    const continued = planCausalAnnouncements(
      [
        event("event-2", 2, "mutation-observed"),
        event("event-4", 4, "lysis-observed"),
      ],
      {
        sequence: 2,
        eventId: "event-2",
      },
    );

    expect(continued.presentation).toBe("specific");
    expect(continued.eventIds).toEqual(["event-4"]);
    expect(continued.nextCursor).toEqual({
      sequence: 4,
      eventId: "event-4",
    });
  });

  it("rejects duplicate, out-of-order, and invalid cursor input", () => {
    expect(() =>
      planCausalAnnouncements([
        event("same", 1, "mutation-observed"),
        event("same", 2, "lysis-observed"),
      ]),
    ).toThrow(/duplicate/);

    expect(() =>
      planCausalAnnouncements([
        event("later", 2, "mutation-observed"),
        event("earlier", 1, "lysis-observed"),
      ]),
    ).toThrow(/strictly increasing/);

    expect(() =>
      planCausalAnnouncements([], {
        sequence: -1,
        eventId: "impossible",
      }),
    ).toThrow(/cursor/);

    expect(
      planCausalAnnouncements([], INITIAL_CAUSAL_ANNOUNCEMENT_CURSOR),
    ).toMatchObject({
      presentation: "none",
      message: null,
    });
  });
});

function event(
  id: string,
  sequence: number,
  eventKind: CausalEventBurstItem["eventKind"],
): CausalEventBurstItem {
  return { id, sequence, eventKind };
}
