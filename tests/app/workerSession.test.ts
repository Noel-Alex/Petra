import { describe, expect, it } from "vitest";
import {
  WorkerSession,
  createBrowserWorkerPort,
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

  messageError(): void {
    this.handlers?.error("Simulation worker message could not be deserialized");
  }
}

class FakeBrowserWorker {
  readonly posted: WorkerRequest[] = [];
  terminated = false;
  private readonly listeners = new Map<string, Set<EventListener>>();

  postMessage(request: WorkerRequest): void {
    this.posted.push(structuredClone(request));
  }

  addEventListener(type: string, listener: EventListener): void {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  terminate(): void {
    this.terminated = true;
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }

  emit(type: string, event: Event): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

describe("worker session", () => {
  it("serializes initialization and commands with explicit pending state", () => {
    const port = new FakePort();
    const session = new WorkerSession(port);
    const phases: string[] = [];
    session.subscribe((state) => phases.push(state.phase));

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
    expect(phases).toEqual(["idle", "initializing", "pending", "ready"]);
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

  it("fails closed on message deserialization during initialization and can recover", () => {
    const port = new FakePort();
    const session = new WorkerSession(port);

    session.enqueue([
      { protocolVersion: PROTOCOL_VERSION, type: "initialize", identity },
      {
        protocolVersion: PROTOCOL_VERSION,
        type: "command",
        command: { id: "queued-command", type: "snapshot" },
      },
    ]);
    port.messageError();

    expect(session.state).toMatchObject({
      phase: "error",
      error: "Simulation worker message could not be deserialized",
      pendingCommandId: null,
      queuedRequests: 0,
    });
    expect(port.posted).toHaveLength(1);

    session.enqueue([
      { protocolVersion: PROTOCOL_VERSION, type: "initialize", identity },
    ]);
    port.emit({
      protocolVersion: PROTOCOL_VERSION,
      type: "ready",
      snapshot: snapshot(0),
    });

    expect(session.state.phase).toBe("ready");
  });

  it("retains the active command id on message deserialization failure", () => {
    const port = new FakePort();
    const session = new WorkerSession(port);

    session.enqueue([
      { protocolVersion: PROTOCOL_VERSION, type: "initialize", identity },
    ]);
    port.emit({
      protocolVersion: PROTOCOL_VERSION,
      type: "ready",
      snapshot: snapshot(0),
    });

    session.enqueue([
      {
        protocolVersion: PROTOCOL_VERSION,
        type: "command",
        command: { id: "advance-active", type: "advance", ticks: 4 },
      },
      {
        protocolVersion: PROTOCOL_VERSION,
        type: "command",
        command: { id: "queued-command", type: "snapshot" },
      },
    ]);
    port.messageError();

    expect(session.state).toMatchObject({
      phase: "error",
      error: "Simulation worker message could not be deserialized",
      pendingCommandId: "advance-active",
      queuedRequests: 0,
    });
    expect(session.state.latestSnapshot).toEqual(snapshot(0));
    expect(port.posted.at(-1)).toMatchObject({
      type: "command",
      command: { id: "advance-active" },
    });
  });

  it("retains the active command id on generic worker failure", () => {
    const port = new FakePort();
    const session = new WorkerSession(port);

    session.enqueue([
      {
        protocolVersion: PROTOCOL_VERSION,
        type: "command",
        command: { id: "snapshot-active", type: "snapshot" },
      },
    ]);
    port.fail("worker crashed");

    expect(session.state).toMatchObject({
      phase: "error",
      error: "worker crashed",
      pendingCommandId: "snapshot-active",
      queuedRequests: 0,
    });
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
      pendingCommandId: null,
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

  it("subscribes and unsubscribes every browser Worker transport event", () => {
    const worker = new FakeBrowserWorker();
    const port = createBrowserWorkerPort(worker as unknown as Worker);
    const errors: string[] = [];
    const unsubscribe = port.subscribe({
      message: () => undefined,
      error: (message) => errors.push(message),
    });

    expect(worker.listenerCount("message")).toBe(1);
    expect(worker.listenerCount("error")).toBe(1);
    expect(worker.listenerCount("messageerror")).toBe(1);

    worker.emit("messageerror", {} as Event);
    expect(errors).toEqual(["Simulation worker message could not be deserialized"]);

    unsubscribe();
    expect(worker.listenerCount("message")).toBe(0);
    expect(worker.listenerCount("error")).toBe(0);
    expect(worker.listenerCount("messageerror")).toBe(0);

    port.dispose();
    expect(worker.terminated).toBe(true);
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
