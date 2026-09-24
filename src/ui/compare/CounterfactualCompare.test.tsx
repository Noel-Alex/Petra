import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ReactNode } from "react";

import type { CounterfactualBranch } from "../counterfactual";
import { CounterfactualCompare } from "./CounterfactualCompare";
import type { TimeBoundCompareSurface } from "./timeBoundSurface";

function branch(branchId: string, label: string): CounterfactualBranch {
  return {
    branchId,
    label,
    origin: {
      sourceRunId: "run-1",
      checkpointTraceHash: "trace-fork",
      tick: 40,
      simulationTimeHours: 2,
      commandCount: 3,
    },
    seed: 7,
    interventionCommandIds: [],
  };
}

function surface(
  branchId: string,
  simulationTimeHours: number,
  text: string,
): TimeBoundCompareSurface<ReactNode> {
  return {
    identity: {
      kind: "authoritative-sample",
      branchId,
      sampleId: `${branchId}-sample-${simulationTimeHours}`,
      simulationTimeHours,
    },
    content: <div data-scientific-surface={branchId}>{text}</div>,
  };
}

const left = branch("left", "Control");
const right = branch("right", "Treatment");

describe("CounterfactualCompare time-bound surfaces", () => {
  it("renders exact authoritative samples and derives pane times from them", () => {
    const html = renderToStaticMarkup(
      <CounterfactualCompare
        left={left}
        right={right}
        leftSurface={surface("left", 4, "left exact")}
        rightSurface={surface("right", 4, "right exact")}
        requestedTimeHours={4}
        leftAvailableThroughHours={8}
        rightAvailableThroughHours={8}
        motionPreference="off"
      />,
    );

    expect(html).toContain("left exact");
    expect(html).toContain("right exact");
    expect(html).toContain('data-surface-status="ready"');
    expect(html).toContain('data-sample-id="left-sample-4"');
    expect(html).toContain("4.0 h");
    expect(html).toContain(
      "Both panes are synchronized to the same biological time.",
    );
  });

  it("withholds a latest-state surface that does not match the synchronized time", () => {
    const html = renderToStaticMarkup(
      <CounterfactualCompare
        left={left}
        right={right}
        leftSurface={surface("left", 5, "WRONG LATEST LEFT")}
        rightSurface={surface("right", 4, "right exact")}
        requestedTimeHours={4}
        leftAvailableThroughHours={8}
        rightAvailableThroughHours={8}
        motionPreference="off"
      />,
    );

    expect(html).not.toContain("WRONG LATEST LEFT");
    expect(html).toContain("Scientific surface withheld");
    expect(html).toContain('data-surface-status="mismatch"');
    expect(html).toContain("Surface sample time 5 h");
    expect(html).toContain("Unavailable");
    expect(html).toContain(
      "A supplied scientific surface did not match its synchronized",
    );
  });

  it("clamps both the displayed state and label to the same authoritative sample", () => {
    const html = renderToStaticMarkup(
      <CounterfactualCompare
        left={left}
        right={right}
        leftSurface={surface("left", 8, "left at eight")}
        rightSurface={surface("right", 6, "right at six")}
        requestedTimeHours={8}
        leftAvailableThroughHours={10}
        rightAvailableThroughHours={6}
        motionPreference="reduced"
      />,
    );

    expect(html).toContain("left at eight");
    expect(html).toContain("right at six");
    expect(html).toContain('data-sample-id="right-sample-6"');
    expect(html).toContain("6.0 h");
    expect(html).toContain("One branch has not simulated that far");
  });

  it("enforces the same surface identity contract in swipe mode", () => {
    const html = renderToStaticMarkup(
      <CounterfactualCompare
        left={left}
        right={right}
        leftSurface={surface("left", 3, "left swipe")}
        rightSurface={surface("right", 4, "WRONG RIGHT SWIPE")}
        requestedTimeHours={3}
        leftAvailableThroughHours={5}
        rightAvailableThroughHours={5}
        motionPreference="full"
        initialMode="swipe"
      />,
    );

    expect(html).toContain('data-mode="swipe"');
    expect(html).toContain("left swipe");
    expect(html).not.toContain("WRONG RIGHT SWIPE");
    expect(html).toContain("Scientific surface withheld");
  });
});
