import { describe, expect, it } from "vitest";
import {
  WorkerSession,
  type WorkerPort,
  type WorkerPortHandlers,
} from "../../src/app/workerSession";
import {
  PROTOCOL_VERSION,
  createRunIdentity,
  type SimulationSnapshot,
  type WorkerRequest,
  type WorkerResponse,
} from "../../src/sim/protocol";

const identity = createRunIdentity({
  scenarioId: "worker-session-fixture",
  scenarioVersion: "1",
  parameterSetId: "worker-session-fixture",
  parameterSetVersion: "1",
  seed: 17,
});

function snapshot(tick: number, commandCount = 0): SimulationSnapshot {
  return {
    checkpoint: {
      identity,
      tick,
      simulationTimeHours: tick / 60,
      syntheticPopulation: 100 + tick,
      rngState: [1, 2, 3, 4],
      commandCount,
    },
    events: [],
    traceHash: `trace-${tick}-${commandCount}`,
  };
}

class FakePort implements WorkerPort {
  readonly posted: WorkerRequest[] = [];
  disposed = false;
  private handlers: WorkerPortHandlers | null = null;

  post(request: WorkerRequest): void {
    this.posted.push(structuredClone(request));
  }

  subscribe(handlers: WorkerPortHandlers): () => void {
    this.handlers = handlers;
    return () => {
      this.handlers = null;
    };
  }

  dispose(): void {
    this.disposed = true;
  }

  emit(response: WorkerResponse): void {
    this.handlers?.message(response);
  }

  fail(message: string): void {
    this.handlers?.error(message);
  }
}

describe("worker session", () => {
  it("serializes initialization and commands with explicit pending state", () => {
    const port = new FakePort();
    const session = new WorkerSession(port);

    session.enqueue([
      { protocolVersion: PROTOCOL_VERSION, type: "initialize", identity },
      {
        protocolVersion: PROTOCOL_VERSION,
        type: "command",
        command: { id: "advance-1", type: "advance", ticks: 4 },
      },
    ]);

    expect(port.posted).toHaveLength(1);
    expect(port.posted[0]).toMatchObject({ type: "initialize" });
    expect(session.state).toMatchObject({
      phase: "initializing",
      pendingCommandId: null,
      queuedRequests: 1,
    });

    port.emit({
      protocolVersion: PROTOCOL_VERSION,
      type: "ready",
      snapshot: snapshot(0),
    });

    expect(port.posted).toHaveLength(2);
    expect(port.posted[1]).toMatchObject({
      type: "command",
      command: { id: "advance-1" },
    });
    expect(session.state).toMatchObject({
      phase: "pending",
      pendingCommandId: "advance-1",
      queuedRequests: 0,
    });

    port.emit({
      protocolVersion: PROTOCOL_VERSION,
      type: "snapshot",
      commandId: "advance-1",
      snapshot: snapshot(4, 1),
    });

    expect(session.state.phase).toBe("ready");
    expect(session.state.latestSnapshot?.checkpoint.tick).toBe(4);
    expect(session.state.pendingCommandId).toBeNull();
  });

  it("rejects mismatched command responses instead of accepting stale state", () => {
    const port = new FakePort();
    const session = new WorkerSession(port);

    session.enqueue([
      {
        protocolVersion: PROTOCOL_VERSION,
        type: "command",
        command: { id: "expected", type: "snapshot" },
      },
    ]);

    port.emit({
      protocolVersion: PROTOCOL_VERSION,
      type: "snapshot",
      commandId: "stale",
      snapshot: snapshot(0),
    });

    expect(session.state.phase).toBe("error");
    expect(session.state.error).toContain("expected expected, received stale");
    expect(session.state.latestSnapshot).toBeNull();
  });

  it("surfaces worker errors and can recover with a new request", () => {
    const port = new FakePort();
    const session = new WorkerSession(port);

    session.enqueue([
      { protocolVersion: PROTOCOL_VERSION, type: "initialize", identity },
    ]);
    port.fail("worker crashed");

    expect(session.state).toMatchObject({
      phase: "error",
      error: "worker crashed",
      queuedRequests: 0,
    });

    session.enqueue([
      { protocolVersion: PROTOCOL_VERSION, type: "initialize", identity },
    ]);
    expect(session.state.phase).toBe("initializing");

    port.emit({
      protocolVersion: PROTOCOL_VERSION,
      type: "ready",
      snapshot: snapshot(0),
    });
    expect(session.state.phase).toBe("ready");
  });

  it("notifies subscribers and disposes the worker safely", () => {
    const port = new FakePort();
    const session = new WorkerSession(port);
    const phases: string[] = [];
    session.subscribe((state) => phases.push(state.phase));

    session.enqueue([
      { protocolVersion: PROTOCOL_VERSION, type: "initialize", identity },
    ]);
    session.dispose();

    expect(phases).toEqual(["idle", "initializing", "disposed"]);
    expect(port.disposed).toBe(true);
    expect(() =>
      session.enqueue([
        { protocolVersion: PROTOCOL_VERSION, type: "initialize", identity },
      ]),
    ).toThrow("WorkerSession is disposed");
  });
});
