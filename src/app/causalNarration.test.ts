import { describe, expect, it } from "vitest";

import {
  ENGINE_VERSION,
  PROTOCOL_VERSION,
  type RunIdentity,
} from "../sim/protocol";
import {
  advanceCausalNarrationSession,
  causalEventStreamRevisionKey,
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


  it("keeps accepted narration state silent across a temporary authority-stream gap", () => {
    const accepted = advanceCausalNarrationSession(
      createCausalNarrationSession(),
      RUN_A,
      stream(RUN_A, "run-a/main", [
        {
          id: "mutation-0",
          sequence: 0,
          eventKind: "mutation-observed",
        },
      ]),
    );

    const absent = advanceCausalNarrationSession(accepted, RUN_A, null);
    expect(absent.plan.presentation).toBe("none");
    expect(absent.plan.message).toBeNull();
    expect(absent.cursor).toEqual(accepted.cursor);
    expect(absent.acceptedEventCount).toBe(accepted.acceptedEventCount);
    expect(absent.acceptedHistoryKey).toBe(accepted.acceptedHistoryKey);
    expect(absent.streamIdentity).toBe(accepted.streamIdentity);

    const restored = advanceCausalNarrationSession(
      absent,
      RUN_A,
      stream(RUN_A, "run-a/main", [
        {
          id: "mutation-0",
          sequence: 0,
          eventKind: "mutation-observed",
        },
      ]),
    );
    expect(restored.plan.presentation).toBe("none");
    expect(restored.cursor).toEqual(accepted.cursor);

    const appended = advanceCausalNarrationSession(
      restored,
      RUN_A,
      stream(RUN_A, "run-a/main", [
        {
          id: "mutation-0",
          sequence: 0,
          eventKind: "mutation-observed",
        },
        {
          id: "lysis-1",
          sequence: 1,
          eventKind: "lysis-observed",
        },
      ]),
    );
    expect(appended.plan.presentation).toBe("specific");
    expect(appended.plan.eventIds).toEqual(["lysis-1"]);
    expect(appended.cursor).toEqual({ sequence: 1, eventId: "lysis-1" });
  });

  it("still rejects rewritten accepted history after an authority-stream gap", () => {
    const accepted = advanceCausalNarrationSession(
      createCausalNarrationSession(),
      RUN_A,
      stream(RUN_A, "run-a/main", [
        {
          id: "mutation-0",
          sequence: 0,
          eventKind: "mutation-observed",
        },
      ]),
    );
    const absent = advanceCausalNarrationSession(accepted, RUN_A, undefined);

    expect(() =>
      advanceCausalNarrationSession(
        absent,
        RUN_A,
        stream(RUN_A, "run-a/main", [
          {
            id: "intervention-0",
            sequence: 0,
            eventKind: "intervention-applied",
          },
        ]),
      ),
    ).toThrow(/accepted history cannot be replaced/);

    expect(() =>
      advanceCausalNarrationSession(
        absent,
        RUN_A,
        stream(RUN_A, "run-a/main", []),
      ),
    ).toThrow(/accepted history must remain present/);
  });

  it("keeps a previously accepted cursor intact while a stale foreign stream is ignored", () => {
    const accepted = advanceCausalNarrationSession(
      createCausalNarrationSession(),
      RUN_A,
      stream(RUN_A, "run-a/main", [
        {
          id: "mutation-0",
          sequence: 0,
          eventKind: "mutation-observed",
        },
      ]),
    );

    const ignored = advanceCausalNarrationSession(
      accepted,
      RUN_A,
      stream(RUN_B, "run-b/main", [
        {
          id: "lysis-0",
          sequence: 0,
          eventKind: "lysis-observed",
        },
      ]),
    );

    expect(ignored.plan.presentation).toBe("none");
    expect(ignored.cursor).toEqual(accepted.cursor);
    expect(ignored.acceptedHistoryKey).toBe(accepted.acceptedHistoryKey);
  });

  it("uses replay-relevant history rather than only the final frontier for React revisions", () => {
    const original = stream(RUN_A, "run-a/main", [
      {
        id: "mutation-0",
        sequence: 0,
        eventKind: "mutation-observed",
      },
      {
        id: "lysis-1",
        sequence: 1,
        eventKind: "lysis-observed",
      },
    ]);
    const unchangedClone = stream(RUN_A, "run-a/main", [
      {
        id: "mutation-0",
        sequence: 0,
        eventKind: "mutation-observed",
      },
      {
        id: "lysis-1",
        sequence: 1,
        eventKind: "lysis-observed",
      },
    ]);
    const replacedEarlierEvent = stream(RUN_A, "run-a/main", [
      {
        id: "intervention-0",
        sequence: 0,
        eventKind: "intervention-applied",
      },
      {
        id: "lysis-1",
        sequence: 1,
        eventKind: "lysis-observed",
      },
    ]);

    expect(causalEventStreamRevisionKey(unchangedClone)).toBe(
      causalEventStreamRevisionKey(original),
    );
    expect(causalEventStreamRevisionKey(replacedEarlierEvent)).not.toBe(
      causalEventStreamRevisionKey(original),
    );
  });

  it("rejects replacement of already accepted history within one run branch", () => {
    const first = advanceCausalNarrationSession(
      createCausalNarrationSession(),
      RUN_A,
      stream(RUN_A, "run-a/main", [
        {
          id: "mutation-0",
          sequence: 0,
          eventKind: "mutation-observed",
        },
        {
          id: "lysis-1",
          sequence: 1,
          eventKind: "lysis-observed",
        },
      ]),
    );

    expect(() =>
      advanceCausalNarrationSession(
        first,
        RUN_A,
        stream(RUN_A, "run-a/main", [
          {
            id: "intervention-0",
            sequence: 0,
            eventKind: "intervention-applied",
          },
          {
            id: "lysis-1",
            sequence: 1,
            eventKind: "lysis-observed",
          },
        ]),
      ),
    ).toThrow(/accepted history cannot be replaced/);
  });

  it("accepts a normal append-only extension and advances the stored history identity", () => {
    const first = advanceCausalNarrationSession(
      createCausalNarrationSession(),
      RUN_A,
      stream(RUN_A, "run-a/main", [
        {
          id: "mutation-0",
          sequence: 0,
          eventKind: "mutation-observed",
        },
      ]),
    );

    const appended = advanceCausalNarrationSession(
      first,
      RUN_A,
      stream(RUN_A, "run-a/main", [
        {
          id: "mutation-0",
          sequence: 0,
          eventKind: "mutation-observed",
        },
        {
          id: "lysis-1",
          sequence: 1,
          eventKind: "lysis-observed",
        },
      ]),
    );

    expect(appended.plan.presentation).toBe("specific");
    expect(appended.plan.eventIds).toEqual(["lysis-1"]);
    expect(appended.acceptedEventCount).toBe(2);
    expect(appended.acceptedHistoryKey).not.toBe(first.acceptedHistoryKey);
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
