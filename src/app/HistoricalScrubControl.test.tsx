import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type {
  AuthoritativeHistoryIndex,
  AuthoritativeHistoryKeyframe,
  HistoricalStateResolution,
} from "./historicalState";
import {
  HistoricalScrubControl,
  keepHistoricalScrubNavigationLocal,
  planHistoricalScrubControl,
} from "./HistoricalScrubControl";

// Vite resolves raw assets in Vitest; this project intentionally omits vite/client globals.
// @ts-expect-error Vite raw asset import is runtime-supported but not declared in tsconfig types.
import scrubSource from "./HistoricalScrubControl.tsx?raw";

function keyframe(
  commandCount: number,
  simulationTimeHours: number,
): AuthoritativeHistoryKeyframe {
  return {
    schemaVersion: 1,
    runBranchIdentity: "branch-main",
    snapshot: {
      checkpoint: {
        authority: "composed",
        commandCount,
        simulationTimeHours,
      },
    },
  } as AuthoritativeHistoryKeyframe;
}

function history(): AuthoritativeHistoryIndex {
  const first = keyframe(0, 0);
  const middle = keyframe(2, 0.2);
  const last = keyframe(4, 0.4);

  return {
    runBranchIdentity: "branch-main",
    identity: first.snapshot.checkpoint.identity,
    firstCommandCount: 0,
    lastCommandCount: 4,
    keyframeCount: 3,
    resolve(requestedCommandPosition: number): HistoricalStateResolution {
      if (requestedCommandPosition === 0) {
        return {
          kind: "authoritative",
          requestedCommandPosition,
          keyframe: first,
        };
      }
      if (requestedCommandPosition === 2) {
        return {
          kind: "authoritative",
          requestedCommandPosition,
          keyframe: middle,
        };
      }
      if (requestedCommandPosition === 4) {
        return {
          kind: "authoritative",
          requestedCommandPosition,
          keyframe: last,
        };
      }
      if (requestedCommandPosition < 2) {
        return {
          kind: "between-authority",
          requestedCommandPosition,
          runBranchIdentity: "branch-main",
          lower: first,
          upper: middle,
          progress: requestedCommandPosition / 2,
          stateAuthority: "presentation-only",
        };
      }
      return {
        kind: "between-authority",
        requestedCommandPosition,
        runBranchIdentity: "branch-main",
        lower: middle,
        upper: last,
        progress: (requestedCommandPosition - 2) / 2,
        stateAuthority: "presentation-only",
      };
    },
  };
}

describe("authoritative historical scrub control", () => {
  it("describes exact recorded positions as authoritative checkpoints", () => {
    const plan = planHistoricalScrubControl(history(), 2);

    expect(plan.position).toEqual({
      kind: "authoritative",
      stateAuthority: "authoritative",
      commandCount: 2,
      simulationTimeHours: 0.2,
    });
  });

  it("keeps missing recorded positions explicitly presentation-only", () => {
    const plan = planHistoricalScrubControl(history(), 1);

    expect(plan.position).toEqual({
      kind: "between-authority",
      stateAuthority: "presentation-only",
      lowerCommandCount: 0,
      upperCommandCount: 2,
      lowerSimulationTimeHours: 0,
      upperSimulationTimeHours: 0.2,
      progress: 0.5,
    });
  });

  it("refuses out-of-history and fractional accepted-command positions", () => {
    expect(() => planHistoricalScrubControl(history(), -1)).toThrow(RangeError);
    expect(() => planHistoricalScrubControl(history(), 5)).toThrow(RangeError);
    expect(() => planHistoricalScrubControl(history(), 1.5)).toThrow(RangeError);
  });

  it("renders native range semantics and bounded presentation-only disclosure", () => {
    const markup = renderToStaticMarkup(
      <HistoricalScrubControl
        history={history()}
        requestedCommandPosition={1}
        onRequestedCommandPositionChange={() => undefined}
      />,
    );

    expect(markup).toContain('type="range"');
    expect(markup).toContain('min="0"');
    expect(markup).toContain('max="4"');
    expect(markup).toContain('step="1"');
    expect(markup).toContain("Presentation-only cursor");
    expect(markup).toContain("Command 1 between authoritative commands 0 and 2");
    expect(markup).toContain("Biological time is bounded by 0.00 h–0.20 h");
    expect(markup).toContain("No scientific state or biological time is interpolated.");
    expect(markup).not.toContain("aria-live");
  });

  it("renders exact biological time only for a recorded checkpoint", () => {
    const markup = renderToStaticMarkup(
      <HistoricalScrubControl
        history={history()}
        requestedCommandPosition={2}
        onRequestedCommandPositionChange={() => undefined}
      />,
    );

    expect(markup).toContain("Authoritative checkpoint");
    expect(markup).toContain("Command 2");
    expect(markup).toContain("0.20 h");
    expect(markup).not.toContain("Presentation-only cursor");
  });

  it("keeps native range navigation local without preventing browser defaults", () => {
    let stopped = 0;

    for (const key of ["ArrowLeft", "ArrowRight", "Home", "End", " ", "Spacebar"]) {
      keepHistoricalScrubNavigationLocal({
        key,
        stopPropagation: () => {
          stopped += 1;
        },
      });
    }
    expect(stopped).toBe(6);

    keepHistoricalScrubNavigationLocal({
      key: "Enter",
      stopPropagation: () => {
        stopped += 1;
      },
    });
    expect(stopped).toBe(6);
  });

  it("wires local keyboard ownership on the native range only", () => {
    expect(scrubSource).toContain(
      'onKeyDown={keepHistoricalScrubNavigationLocal}',
    );
    expect(
      scrubSource.match(/onKeyDown=\{keepHistoricalScrubNavigationLocal\}/g),
    ).toHaveLength(1);
    expect(scrubSource).not.toContain("preventDefault");
  });
});
