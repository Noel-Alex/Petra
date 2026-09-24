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
} from "../../src/sim/protocol";
import type { InstrumentedWorkerResponse } from "../../src/worker/performanceInstrumentation";

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

  emit(response: InstrumentedWorkerResponse): void {
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
    expect(
      (
        port.posted[0] as WorkerRequest & {
          performanceDiagnostics?: boolean;
        }
      ).performanceDiagnostics,
    ).toBeUndefined();
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

  it("records opt-in worker timing, payload, queue, and event metrics", () => {
    const port = new FakePort();
    const samples: import("../../src/app/workerSession").WorkerSessionPerformanceSample[] = [];
    let now = 100;
    const session = new WorkerSession(port, {
      observe: (sample) => samples.push(sample),
      now: () => now,
    });

    session.enqueue([
      { protocolVersion: PROTOCOL_VERSION, type: "initialize", identity },
      {
        protocolVersion: PROTOCOL_VERSION,
        type: "command",
        command: { id: "advance-profiled", type: "advance", ticks: 4 },
      },
    ]);

    expect(
      (
        port.posted[0] as WorkerRequest & {
          performanceDiagnostics?: boolean;
        }
      ).performanceDiagnostics,
    ).toBe(true);

    now = 106;
    port.emit({
      protocolVersion: PROTOCOL_VERSION,
      type: "ready",
      snapshot: snapshot(0),
      performanceDiagnostics: {
        version: 1,
        executionDurationMs: 2,
      },
    });

    now = 110;
    port.emit({
      protocolVersion: PROTOCOL_VERSION,
      type: "snapshot",
      commandId: "advance-profiled",
      snapshot: {
        ...snapshot(4, 1),
        events: [
          {
            sequence: 0,
            tick: 0,
            simulationTimeHours: 0,
            type: "initialized",
          },
          {
            sequence: 1,
            tick: 4,
            simulationTimeHours: 4 / 60,
            type: "advanced",
            commandId: "advance-profiled",
            value: 4,
          },
        ],
      },
      performanceDiagnostics: {
        version: 1,
        executionDurationMs: 3,
      },
    });

    expect(samples).toHaveLength(2);
    expect(samples[0]).toMatchObject({
      requestType: "initialize",
      queuedRequestsBehindAtDispatch: 1,
      roundTripMs: 6,
      workerExecutionMs: 2,
      nonWorkerRoundTripMs: 4,
      authoritativeEventArrayLength: 0,
      outcome: "success",
    });
    expect(samples[1]).toMatchObject({
      requestType: "command",
      commandType: "advance",
      commandId: "advance-profiled",
      requestedAdvanceTicks: 4,
      queuedRequestsBehindAtDispatch: 0,
      roundTripMs: 4,
      workerExecutionMs: 3,
      workerExecutionMsPerTick: 0.75,
      nonWorkerRoundTripMs: 1,
      authoritativeEventArrayLength: 2,
      outcome: "success",
    });
    expect(samples[0]?.requestPayloadBytes).toBeGreaterThan(0);
    expect(samples[1]?.responsePayloadBytes).toBeGreaterThan(0);
    expect(session.state.phase).toBe("ready");
  });

  it("records profiled protocol failures before failing closed", () => {
    const port = new FakePort();
    const samples: import("../../src/app/workerSession").WorkerSessionPerformanceSample[] = [];
    let now = 20;
    const session = new WorkerSession(port, {
      observe: (sample) => samples.push(sample),
      now: () => now,
    });

    session.enqueue([
      {
        protocolVersion: PROTOCOL_VERSION,
        type: "command",
        command: { id: "expected-profiled", type: "snapshot" },
      },
    ]);

    now = 24;
    port.emit({
      protocolVersion: PROTOCOL_VERSION,
      type: "snapshot",
      commandId: "stale-profiled",
      snapshot: snapshot(0),
      performanceDiagnostics: {
        version: 1,
        executionDurationMs: 1,
      },
    });

    expect(samples).toHaveLength(1);
    expect(samples[0]).toMatchObject({
      commandId: "expected-profiled",
      roundTripMs: 4,
      workerExecutionMs: 1,
      nonWorkerRoundTripMs: 3,
      outcome: "protocol-error",
    });
    expect(session.state.phase).toBe("error");
    expect(session.state.error).toContain(
      "expected expected-profiled, received stale-profiled",
    );
  });

  it("keeps profiling observer failures observational", () => {
    const port = new FakePort();
    let now = 0;
    const session = new WorkerSession(port, {
      observe: () => {
        throw new Error("profiling sink failed");
      },
      now: () => now,
    });

    session.enqueue([
      { protocolVersion: PROTOCOL_VERSION, type: "initialize", identity },
    ]);
    now = 1;
    port.emit({
      protocolVersion: PROTOCOL_VERSION,
      type: "ready",
      snapshot: snapshot(0),
      performanceDiagnostics: {
        version: 1,
        executionDurationMs: 0.25,
      },
    });

    expect(session.state.phase).toBe("ready");
    expect(session.state.error).toBeNull();
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
