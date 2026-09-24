import { describe, expect, it } from "vitest";
import {
  CAUSAL_EVENT_BURST_POLICY,
  planCausalEventBurst,
  type CausalEventBurstItem,
} from "./scheduler";

const kinds = [
  "intervention-applied",
  "mutation-observed",
  "selection-shift-observed",
  "nutrient-depletion-observed",
  "lysis-observed",
] as const;

function makeEvents(count: number): readonly CausalEventBurstItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `event-${index + 1}`,
    sequence: index + 1,
    eventKind: kinds[index % kinds.length]!,
  }));
}

describe("causal event burst scheduler", () => {
  it("preserves authoritative input order while staggering the bounded full-motion budget", () => {
    const events = makeEvents(7);
    const plan = planCausalEventBurst(events, "full");

    expect(plan.events.map((event) => event.id)).toEqual(
      events.map((event) => event.id),
    );
    expect(plan.events.map((event) => event.sequence)).toEqual(
      events.map((event) => event.sequence),
    );
    expect(plan.orderMeaning).toBe("authoritative-input-order");
    expect(plan.cameraPolicy).toBe("preserve-user-view");
    expect(plan.requiresAuthoritativeEvents).toBe(true);

    const animatedLimit = CAUSAL_EVENT_BURST_POLICY.full.animatedEventLimit;
    expect(
      plan.events.slice(0, animatedLimit).map((event) => event.startMs),
    ).toEqual(
      Array.from(
        { length: animatedLimit },
        (_, index) => index * CAUSAL_EVENT_BURST_POLICY.full.eventStaggerMs,
      ),
    );
  });

  it("degrades overflow events to essential static cues instead of dropping events", () => {
    const events = makeEvents(8);
    const plan = planCausalEventBurst(events, "full");
    const overflow = plan.events.slice(
      CAUSAL_EVENT_BURST_POLICY.full.animatedEventLimit,
    );

    expect(plan.events).toHaveLength(events.length);
    expect(overflow.length).toBeGreaterThan(0);

    for (const event of overflow) {
      expect(event.presentation).toBe("static");
      expect(event.degradedForBurst).toBe(true);
      expect(event.startMs).toBe(0);
      expect(event.cues.length).toBeGreaterThan(0);
      expect(event.cues.every((cue) => cue.essential)).toBe(true);
      expect(
        event.cues.every((cue) => cue.treatment === "static-emphasis"),
      ).toBe(true);
    }

    expect(
      Object.values(plan.overflowCounts).reduce(
        (total, count) => total + count,
        0,
      ),
    ).toBe(overflow.length);
  });

  it("bounds reduced-motion animation and keeps later causal meaning static", () => {
    const events = makeEvents(6);
    const plan = planCausalEventBurst(events, "reduced");

    expect(plan.events.every((event) => event.startMs === 0)).toBe(true);
    expect(
      plan.events
        .slice(0, CAUSAL_EVENT_BURST_POLICY.reduced.animatedEventLimit)
        .every((event) => event.presentation === "reduced"),
    ).toBe(true);
    expect(
      plan.events
        .slice(CAUSAL_EVENT_BURST_POLICY.reduced.animatedEventLimit)
        .every(
          (event) =>
            event.presentation === "static" &&
            event.cues.every(
              (cue) =>
                cue.essential && cue.treatment === "static-emphasis",
            ),
        ),
    ).toBe(true);
  });

  it("keeps motion-off bursts immediate, static, and complete", () => {
    const events = makeEvents(12);
    const plan = planCausalEventBurst(events, "off");

    expect(plan.events).toHaveLength(events.length);
    expect(plan.animatedEventCount).toBe(0);
    expect(plan.staticEventCount).toBe(events.length);
    expect(
      plan.events.every(
        (event) =>
          event.startMs === 0 &&
          !event.degradedForBurst &&
          event.cues.length > 0 &&
          event.cues.every(
            (cue) =>
              cue.essential &&
              cue.durationMs === 0 &&
              cue.treatment === "static-emphasis",
          ),
      ),
    ).toBe(true);
  });

  it("is deterministic and does not mutate the authoritative event batch", () => {
    const events = makeEvents(7).map((event) => Object.freeze({ ...event }));
    const frozen = Object.freeze([...events]);

    const first = planCausalEventBurst(frozen, "full");
    const second = planCausalEventBurst(frozen, "full");

    expect(second).toEqual(first);
    expect(frozen).toEqual(events);
  });

  it("rejects ambiguous event identity or out-of-order authority sequences", () => {
    expect(() =>
      planCausalEventBurst(
        [
          { id: "same", sequence: 1, eventKind: "mutation-observed" },
          { id: "same", sequence: 2, eventKind: "lysis-observed" },
        ],
        "full",
      ),
    ).toThrow(/duplicate causal event id/);

    expect(() =>
      planCausalEventBurst(
        [
          { id: "event-2", sequence: 2, eventKind: "mutation-observed" },
          { id: "event-1", sequence: 1, eventKind: "lysis-observed" },
        ],
        "full",
      ),
    ).toThrow(/strictly increasing authority order/);
  });
});
