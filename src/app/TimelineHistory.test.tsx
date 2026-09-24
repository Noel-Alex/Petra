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

  it("renders the oldest event and command identity in the complete history", () => {
    const entries = Array.from({ length: 6 }, (_, index) => event(index));
    const markup = renderToStaticMarkup(<TimelineHistory entries={entries} />);

    expect(markup).toContain("Full history");
    expect(markup).toContain("6 events · 2 older");
    expect(markup).toContain("Run initialized");
    expect(markup).toContain("Event #0 · tick 0");
    expect(markup).toContain("command command-5");
    expect(markup).toContain('data-event-sequence="0"');
    expect(markup).toContain('data-command-id="command-5"');
  });

  it("does not add a history disclosure when all records fit the recent view", () => {
    const markup = renderToStaticMarkup(
      <TimelineHistory entries={[event(0), event(1)]} />,
    );

    expect(markup).not.toContain("<details");
    expect(markup).toContain("2 events");
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
    expect(timelineHistorySource).toContain(
      'aria-label="Complete authoritative simulation event history"\n' +
        "            tabIndex={0}\n" +
        "            onKeyDown={keepTimelineHistorySpaceLocal}",
    );
    expect(
      timelineHistorySource.match(/onKeyDown=\{keepTimelineHistorySpaceLocal\}/g),
    ).toHaveLength(1);
  });

});
