import { describe, expect, it } from "vitest";

import {
  PROTOCOL_VERSION,
  createRunIdentity,
} from "../../src/sim/protocol";
import {
  WORKER_EVENT_DELTA_TRANSPORT_VERSION,
} from "../../src/worker/eventDeltaTransport";
import {
  parseInstrumentedWorkerRequest,
  parseInstrumentedWorkerResponse,
} from "../../src/worker/performanceInstrumentation";

const identity = createRunIdentity({
  scenarioId: "performance-envelope-fixture",
  scenarioVersion: "1",
  parameterSetId: "performance-envelope-fixture",
  parameterSetVersion: "1",
  seed: 11,
});

function snapshot() {
  return {
    checkpoint: {
      identity,
      tick: 0,
      simulationTimeHours: 0,
      syntheticPopulation: 100,
      rngState: [1, 2, 3, 4] as [number, number, number, number],
      commandCount: 0,
    },
    events: [],
    traceHash: "performance-envelope-trace",
  };
}

describe("worker performance instrumentation envelope validation", () => {
  it("preserves a valid instrumented request after core protocol validation", () => {
    const payload = {
      protocolVersion: PROTOCOL_VERSION,
      type: "command" as const,
      command: { id: "profile-request", type: "snapshot" as const },
      performanceDiagnostics: true as const,
    };

    const parsed = parseInstrumentedWorkerRequest(payload);
    expect(parsed).toMatchObject({ ok: true });
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.value).toBe(payload);
    expect(parsed.value.performanceDiagnostics).toBe(true);
  });

  it("rejects an invalid request diagnostics extension with safe correlation", () => {
    expect(
      parseInstrumentedWorkerRequest({
        protocolVersion: PROTOCOL_VERSION,
        type: "command",
        command: { id: "profile-request", type: "snapshot" },
        performanceDiagnostics: false,
      }),
    ).toEqual({
      ok: false,
      error:
        "Invalid worker request: performanceDiagnostics must be true when present",
      commandId: "profile-request",
    });
  });

  it("preserves valid response diagnostics only after core response validation", () => {
    const payload = {
      protocolVersion: PROTOCOL_VERSION,
      type: "ready" as const,
      snapshot: snapshot(),
      performanceDiagnostics: {
        version: 1 as const,
        executionDurationMs: 0.25,
      },
    };

    const parsed = parseInstrumentedWorkerResponse(payload);
    expect(parsed).toMatchObject({ ok: true });
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.value).toBe(payload);
    expect(parsed.value.performanceDiagnostics?.executionDurationMs).toBe(0.25);
  });

  it("validates performance diagnostics on a transport-only event delta", () => {
    const payload = {
      protocolVersion: PROTOCOL_VERSION,
      transportVersion: WORKER_EVENT_DELTA_TRANSPORT_VERSION,
      type: "snapshot-delta" as const,
      commandId: "advance-delta",
      previousEventCount: 1,
      previousTerminalEvent: {
        sequence: 0,
        tick: 0,
        simulationTimeHours: 0,
        type: "initialized" as const,
      },
      currentEventCount: 2,
      appendedEvents: [
        {
          sequence: 1,
          tick: 1,
          simulationTimeHours: 1 / 60,
          type: "advanced" as const,
          commandId: "advance-delta",
          value: 1,
        },
      ],
      snapshot: {
        checkpoint: {
          ...snapshot().checkpoint,
          tick: 1,
          simulationTimeHours: 1 / 60,
          commandCount: 1,
        },
        traceHash: "performance-envelope-trace-delta",
      },
      performanceDiagnostics: {
        version: 1 as const,
        executionDurationMs: 0.5,
      },
    };

    const parsed = parseInstrumentedWorkerResponse(payload);
    expect(parsed).toMatchObject({ ok: true });
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.value).toBe(payload);
    expect(parsed.value.type).toBe("snapshot-delta");
    expect(parsed.value.performanceDiagnostics?.executionDurationMs).toBe(0.5);
  });

  it("rejects invalid response diagnostics without trusting inbound correlation", () => {
    expect(
      parseInstrumentedWorkerResponse({
        protocolVersion: PROTOCOL_VERSION,
        type: "snapshot",
        commandId: "forged-response-id",
        snapshot: snapshot(),
        performanceDiagnostics: {
          version: 1,
          executionDurationMs: Number.POSITIVE_INFINITY,
        },
      }),
    ).toEqual({
      ok: false,
      error: "Invalid worker response: performanceDiagnostics is invalid",
      commandId: null,
    });
  });
});
