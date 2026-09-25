import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import type { TimelineEntry } from "../ui/timeline";
import {
  TimelineHistory,
  keepTimelineHistorySpaceLocal,
  planTimelineHistory,
} from "./TimelineHistory";

// Vite resolves raw assets in Vitest; this project intentionally omits vite/client globals.
// @ts-expect-error Vite raw asset import is runtime-supported but not declared in tsconfig types.
import timelineHistorySource from "./TimelineHistory.tsx?raw";

function event(sequence: number): TimelineEntry {
  return {
    id: `event-${sequence}`,
    sequence,
    tick: sequence * 10,
    simulationTimeHours: sequence / 2,
    kind: sequence === 0 ? "run" : "advance",
    label: sequence === 0 ? "Run initialized" : `Advanced event ${sequence}`,
    ...(sequence === 0 ? {} : { commandId: `command-${sequence}` }),
  };
}

describe("authoritative timeline history", () => {
  it("keeps a compact recent slice while retaining every authoritative record", () => {
    const entries = Array.from({ length: 7 }, (_, index) => event(index));
    const plan = planTimelineHistory(entries, 4);

    expect(plan.recent.map((entry) => entry.sequence)).toEqual([3, 4, 5, 6]);
    expect(plan.all.map((entry) => entry.sequence)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(plan.olderCount).toBe(3);
    expect(plan.all[0]).toBe(entries[0]);
  });

  it("keeps complete history rows out of the DOM until the disclosure opens", () => {
    const entries = Array.from({ length: 6 }, (_, index) => event(index));
    const markup = renderToStaticMarkup(<TimelineHistory entries={entries} />);

    expect(markup).toContain("Full history");
    expect(markup).toContain("6 events · 2 older");
    expect(markup).not.toContain('data-event-sequence="0"');
    expect(markup).not.toContain('class="timeline-history__events"');
    expect(markup).toContain('data-event-sequence="2"');
    expect(markup).toContain('data-event-sequence="5"');
  });

  it("does not add a history disclosure when all records fit the recent view", () => {
    const markup = renderToStaticMarkup(
      <TimelineHistory entries={[event(0), event(1)]} />,
    );

    expect(markup).not.toContain("<details");
    expect(markup).toContain("2 events");
  });

  it.each([0, 1, 4, 5, 6])(
    "keeps timeline history static rather than becoming a second live narrator at %i events",
    (count) => {
      const entries = Array.from({ length: count }, (_, index) => event(index));
      const markup = renderToStaticMarkup(
        <TimelineHistory entries={entries} />,
      );

      expect(markup).not.toContain('aria-live=');
      expect(markup).not.toContain('role="status"');

      if (count === 0) {
        expect(markup).toContain("No authoritative events yet");
      } else if (count <= 4) {
        expect(markup).toContain(
          `${count} ${count === 1 ? "event" : "events"}`,
        );
      } else {
        expect(markup).toContain("Full history");
        expect(markup).toContain(`${count} events`);
      }
    },
  );

  it("keeps the component source free of event-arrival live-region ownership", () => {
    expect(timelineHistorySource).not.toContain("aria-live");
    expect(timelineHistorySource).not.toContain('role="status"');
  });

  it("rejects invalid recent limits instead of silently dropping history", () => {
    expect(() => planTimelineHistory([event(0)], 0)).toThrow(RangeError);
    expect(() => planTimelineHistory([event(0)], 1.5)).toThrow(RangeError);
  });
  it("keeps Space local without preventing the browser scrolling default", () => {
    let stopped = 0;
    let prevented = 0;
    const spaceEvent = {
      key: " ",
      stopPropagation: () => {
        stopped += 1;
      },
      preventDefault: () => {
        prevented += 1;
      },
    };

    keepTimelineHistorySpaceLocal(spaceEvent);
    expect(stopped).toBe(1);
    expect(prevented).toBe(0);

    keepTimelineHistorySpaceLocal({
      key: "Enter",
      stopPropagation: () => {
        stopped += 1;
      },
    });
    expect(stopped).toBe(1);
  });

  it("accepts the legacy Spacebar key without broad region blocking", () => {
    let stopped = false;
    keepTimelineHistorySpaceLocal({
      key: "Spacebar",
      stopPropagation: () => {
        stopped = true;
      },
    });
    expect(stopped).toBe(true);
  });

  it("wires local Space ownership only onto the complete-history scroller", () => {
    expect(timelineHistorySource).toMatch(
      /aria-label="Complete authoritative simulation event history"\s+tabIndex=\{0\}\s+onKeyDown=\{keepTimelineHistorySpaceLocal\}/,
    );
    expect(
      timelineHistorySource.match(/onKeyDown=\{keepTimelineHistorySpaceLocal\}/g),
    ).toHaveLength(1);
  });

});
