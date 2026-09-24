import { describe, expect, it } from "vitest";

import {
  ENGINE_VERSION,
  PROTOCOL_VERSION,
  type RunIdentity,
} from "../sim/protocol";
import {
  advanceCausalNarrationSession,
  createCausalNarrationSession,
  type AuthoritativeCausalEventStream,
} from "./causalNarration";

const RUN_A: RunIdentity = {
  engineVersion: ENGINE_VERSION,
  protocolVersion: PROTOCOL_VERSION,
  scenarioId: "flagship",
  scenarioVersion: "1",
  parameterSetId: "reference",
  parameterSetVersion: "1",
  seed: 7,
};

const RUN_B: RunIdentity = {
  ...RUN_A,
  seed: 8,
};

function stream(
  runIdentity: RunIdentity,
  runBranchIdentity: string,
  events: AuthoritativeCausalEventStream["events"],
): AuthoritativeCausalEventStream {
  return { runIdentity, runBranchIdentity, events };
}

describe("causal narration app authority boundary", () => {
  it("stays silent when the causal-event capability is absent", () => {
    const next = advanceCausalNarrationSession(
      createCausalNarrationSession(),
      RUN_A,
      null,
    );

    expect(next.plan.presentation).toBe("none");
    expect(next.plan.message).toBeNull();
    expect(next.cursor.sequence).toBe(-1);
  });

  it("announces one accepted authoritative event once across rerenders", () => {
    const authoritative = stream(RUN_A, "run-a/main", [
      {
        id: "mutation-0",
        sequence: 0,
        eventKind: "mutation-observed",
      },
    ]);

    const first = advanceCausalNarrationSession(
      createCausalNarrationSession(),
      RUN_A,
      authoritative,
    );
    expect(first.plan.presentation).toBe("specific");
    expect(first.plan.message).toContain("Lineage change recorded");
    expect(first.cursor).toEqual({ sequence: 0, eventId: "mutation-0" });

    const rerender = advanceCausalNarrationSession(
      first,
      RUN_A,
      authoritative,
    );
    expect(rerender.plan.presentation).toBe("none");
    expect(rerender.plan.message).toBeNull();
    expect(rerender.cursor).toEqual(first.cursor);
  });

  it("keeps dense accepted bursts bounded without dropping event identity", () => {
    const next = advanceCausalNarrationSession(
      createCausalNarrationSession(),
      RUN_A,
      stream(RUN_A, "run-a/main", [
        {
          id: "intervention-0",
          sequence: 0,
          eventKind: "intervention-applied",
        },
        {
          id: "mutation-1",
          sequence: 1,
          eventKind: "mutation-observed",
        },
        {
          id: "mutation-2",
          sequence: 2,
          eventKind: "mutation-observed",
        },
      ]),
    );

    expect(next.plan.presentation).toBe("summary");
    expect(next.plan.eventIds).toEqual([
      "intervention-0",
      "mutation-1",
      "mutation-2",
    ]);
    expect(next.plan.message).toContain("3 new scientific events recorded");
    expect(next.plan.message).toContain("1 intervention");
    expect(next.plan.message).toContain("2 lineage changes");
    expect(next.cursor.sequence).toBe(2);
  });

  it("resets the cursor when run or branch identity changes", () => {
    const first = advanceCausalNarrationSession(
      createCausalNarrationSession(),
      RUN_A,
      stream(RUN_A, "run-a/main", [
        {
          id: "lysis-0",
          sequence: 0,
          eventKind: "lysis-observed",
        },
      ]),
    );

    const newRun = advanceCausalNarrationSession(
      first,
      RUN_B,
      stream(RUN_B, "run-b/main", [
        {
          id: "lysis-0",
          sequence: 0,
          eventKind: "lysis-observed",
        },
      ]),
    );
    expect(newRun.plan.presentation).toBe("specific");

    const newBranch = advanceCausalNarrationSession(
      newRun,
      RUN_B,
      stream(RUN_B, "run-b/fork-1", [
        {
          id: "lysis-0",
          sequence: 0,
          eventKind: "lysis-observed",
        },
      ]),
    );
    expect(newBranch.plan.presentation).toBe("specific");
    expect(newBranch.streamIdentity).not.toBe(newRun.streamIdentity);
  });

  it("refuses a stale-run stream without consuming its events", () => {
    const stale = advanceCausalNarrationSession(
      createCausalNarrationSession(),
      RUN_A,
      stream(RUN_B, "run-b/main", [
        {
          id: "depletion-0",
          sequence: 0,
          eventKind: "nutrient-depletion-observed",
        },
      ]),
    );

    expect(stale.plan.presentation).toBe("none");
    expect(stale.cursor.sequence).toBe(-1);

    const accepted = advanceCausalNarrationSession(
      stale,
      RUN_A,
      stream(RUN_A, "run-a/main", [
        {
          id: "depletion-0",
          sequence: 0,
          eventKind: "nutrient-depletion-observed",
        },
      ]),
    );
    expect(accepted.plan.presentation).toBe("specific");
    expect(accepted.cursor.sequence).toBe(0);
  });

  it("requires an explicit non-empty run/branch identity", () => {
    expect(() =>
      advanceCausalNarrationSession(
        createCausalNarrationSession(),
        RUN_A,
        stream(RUN_A, "   ", []),
      ),
    ).toThrow(/runBranchIdentity must be non-empty/);
  });
});
