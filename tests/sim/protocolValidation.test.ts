import { describe, expect, it } from "vitest";
import {
  PROTOCOL_VERSION,
  createRunIdentity,
} from "../../src/sim/protocol";
import {
  parseWorkerRequest,
  parseWorkerResponse,
} from "../../src/sim/protocolValidation";

const identity = createRunIdentity({
  scenarioId: "protocol-validation-fixture",
  scenarioVersion: "1",
  parameterSetId: "protocol-validation-fixture",
  parameterSetVersion: "1",
  seed: 7,
});

function validSnapshot() {
  return {
    checkpoint: {
      identity,
      tick: 0,
      simulationTimeHours: 0,
      syntheticPopulation: 1000,
      rngState: [1, 2, 3, 4],
      commandCount: 0,
    },
    events: [
      {
        sequence: 0,
        tick: 0,
        simulationTimeHours: 0,
        type: "initialized",
      },
    ],
    traceHash: "deadbeef",
  };
}

describe("worker protocol runtime validation", () => {
  it("accepts valid protocol-v3 requests and responses", () => {
    expect(
      parseWorkerRequest({
        protocolVersion: PROTOCOL_VERSION,
        type: "initialize",
        identity,
      }).ok,
    ).toBe(true);

    expect(
      parseWorkerRequest({
        protocolVersion: PROTOCOL_VERSION,
        type: "command",
        command: { id: "advance-1", type: "advance", ticks: 2 },
      }).ok,
    ).toBe(true);

    expect(
      parseWorkerResponse({
        protocolVersion: PROTOCOL_VERSION,
        type: "ready",
        snapshot: validSnapshot(),
      }).ok,
    ).toBe(true);
  });

  it("rejects malformed command payloads before typed engine handling", () => {
    const fractional = parseWorkerRequest({
      protocolVersion: PROTOCOL_VERSION,
      type: "command",
      command: { id: "advance-1", type: "advance", ticks: 1.5 },
    });
    expect(fractional).toMatchObject({
      ok: false,
      error: expect.stringContaining("advance.ticks"),
    });

    const missingId = parseWorkerRequest({
      protocolVersion: PROTOCOL_VERSION,
      type: "command",
      command: { type: "snapshot" },
    });
    expect(missingId).toMatchObject({
      ok: false,
      error: expect.stringContaining("command.id"),
    });

    const unknownType = parseWorkerRequest({
      protocolVersion: PROTOCOL_VERSION,
      type: "command",
      command: { id: "x", type: "teleport" },
    });
    expect(unknownType).toMatchObject({
      ok: false,
      error: expect.stringContaining("unsupported command type"),
    });
  });

  it("rejects malformed successfully-deserialized response envelopes", () => {
    const badSnapshot = parseWorkerResponse({
      protocolVersion: PROTOCOL_VERSION,
      type: "snapshot",
      commandId: "advance-1",
      snapshot: {
        ...validSnapshot(),
        checkpoint: {
          ...validSnapshot().checkpoint,
          tick: "not-a-number",
        },
      },
    });
    expect(badSnapshot).toMatchObject({
      ok: false,
      error: expect.stringContaining("checkpoint.tick"),
    });

    const badEvent = parseWorkerResponse({
      protocolVersion: PROTOCOL_VERSION,
      type: "ready",
      snapshot: {
        ...validSnapshot(),
        events: [
          {
            sequence: -1,
            tick: 0,
            simulationTimeHours: 0,
            type: "initialized",
          },
        ],
      },
    });
    expect(badEvent).toMatchObject({
      ok: false,
      error: expect.stringContaining("event.sequence"),
    });
  });

  it("rejects protocol-version aliases instead of coercing them", () => {
    expect(
      parseWorkerRequest({
        protocolVersion: String(PROTOCOL_VERSION),
        type: "initialize",
        identity,
      }),
    ).toMatchObject({
      ok: false,
      error: expect.stringContaining("Unsupported protocol version"),
    });

    expect(
      parseWorkerResponse({
        protocolVersion: PROTOCOL_VERSION + 1,
        type: "error",
        message: "future",
      }),
    ).toMatchObject({
      ok: false,
      error: expect.stringContaining("Worker protocol mismatch"),
    });
  });
});
