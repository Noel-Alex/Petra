import { describe, expect, it } from "vitest";
import {
  WorkerSession,
  createBrowserWorkerPort,
  type WorkerPort,
  type WorkerPortHandlers,
} from "../../src/app/workerSession";
import type { ComposedSimulationConfig } from "../../src/sim/authoritative";
import { WORKER_EVENT_DELTA_TRANSPORT_VERSION } from "../../src/worker/eventDeltaTransport";
import { ComposedSimulationEngine } from "../../src/sim/composedEngine";
import type { CuratedMutationGraph } from "../../src/sim/evolution/graph";
import { createFixtureComposedParameterSetBinding } from "../../src/sim/parameterSetBinding";
import {
  PROTOCOL_VERSION,
  createRunIdentity,
  type SimulationSnapshot,
  type WorkerRequest,
} from "../../src/sim/protocol";

const identity = createRunIdentity({
  scenarioId: "worker-session-fixture",
  scenarioVersion: "1",
  parameterSetId: "worker-session-fixture",
  parameterSetVersion: "1",
  seed: 17,
});

const composedGraph: CuratedMutationGraph = {
  scenarioId: "worker-session-composed",
  scenarioVersion: "1",
  genotypes: [
    { id: "WT", relativeFitness: 1, sourceOrder: 0 },
    { id: "VAR", relativeFitness: 0.9, sourceOrder: 1 },
  ],
  transitions: [],
};

const composedConfig: ComposedSimulationConfig = {
  width: 2,
  height: 1,
  mask: [1, 1],
  initialResource: [8, 8],
  ciprofloxacinConcentrationMgPerL: [0, 0],
  initialLineageBiomass: [[1, 0], [0, 1]],
  growth: {
    maxDivisionRate: 0.8,
    halfSaturation: 2,
    biomassYield: 0.5,
    localCapacity: 20,
    spreadRate: 0,
  },
  lineages: [
    { id: "ancestor", genotypeId: "WT", deathHazardPerHour: 0 },
    { id: "variant", genotypeId: "VAR", deathHazardPerHour: 0 },
  ],
  evolutionGraph: composedGraph,
  evolutionScenario: {
    scenarioId: "worker-session-composed",
    scenarioVersion: "1",
  },
  ciprofloxacin: null,
  samplingExecutionPolicy: null,
  dynamicLineageLossPolicy: null,
  populationAuthority: null,
  hoursPerTick: 0.01,
};

const composedParameterSetId = "fixture:worker-session-composed";
const composedParameterSetVersion = "1";
const composedIdentity = createRunIdentity({
  scenarioId: "worker-session-composed",
  scenarioVersion: "1",
  parameterSetId: composedParameterSetId,
  parameterSetVersion: composedParameterSetVersion,
  parameterSetBinding: createFixtureComposedParameterSetBinding(
    composedParameterSetId,
    composedParameterSetVersion,
    composedConfig,
  ),
  seed: 23,
});

function composedSnapshot(): SimulationSnapshot {
  return new ComposedSimulationEngine(composedIdentity, composedConfig).snapshot();
}

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

  emit(response: unknown): void {
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

  it("reconstructs a full owned snapshot from an append-only event delta", () => {
    const port = new FakePort();
    const session = new WorkerSession(port);
    const initialized = {
      sequence: 0,
      tick: 0,
      simulationTimeHours: 0,
      type: "initialized" as const,
    };
    const baseline = {
      ...snapshot(0),
      events: [initialized],
      traceHash: "trace-baseline",
    };

    session.enqueue([
      { protocolVersion: PROTOCOL_VERSION, type: "initialize", identity },
    ]);
    port.emit({
      protocolVersion: PROTOCOL_VERSION,
      type: "ready",
      snapshot: baseline,
    });
    const retained = session.state.latestSnapshot?.events[0];
    expect(retained).toBeDefined();

    session.enqueue([
      {
        protocolVersion: PROTOCOL_VERSION,
        type: "command",
        command: { id: "advance-delta", type: "advance", ticks: 1 },
      },
    ]);
    port.emit({
      protocolVersion: PROTOCOL_VERSION,
      transportVersion: WORKER_EVENT_DELTA_TRANSPORT_VERSION,
      type: "snapshot-delta",
      commandId: "advance-delta",
      previousEventCount: 1,
      previousTerminalEvent: initialized,
      currentEventCount: 2,
      appendedEvents: [
        {
          sequence: 1,
          tick: 1,
          simulationTimeHours: 1 / 60,
          type: "advanced",
          commandId: "advance-delta",
          value: 1,
        },
      ],
      snapshot: {
        checkpoint: snapshot(1, 1).checkpoint,
        traceHash: "trace-after-delta",
      },
    });

    expect(session.state.phase).toBe("ready");
    expect(session.state.latestSnapshot?.events).toHaveLength(2);
    expect(session.state.latestSnapshot?.events[0]).toBe(retained);
    expect(session.state.latestSnapshot?.events[1]).toMatchObject({
      sequence: 1,
      commandId: "advance-delta",
    });
    expect(session.state.latestSnapshot?.checkpoint.tick).toBe(1);
  });

  it("fails closed when a delta retained frontier does not match session history", () => {
    const port = new FakePort();
    const session = new WorkerSession(port);
    const initialized = {
      sequence: 0,
      tick: 0,
      simulationTimeHours: 0,
      type: "initialized" as const,
    };
    const baseline = {
      ...snapshot(0),
      events: [initialized],
      traceHash: "trace-baseline",
    };

    session.enqueue([
      { protocolVersion: PROTOCOL_VERSION, type: "initialize", identity },
    ]);
    port.emit({
      protocolVersion: PROTOCOL_VERSION,
      type: "ready",
      snapshot: baseline,
    });
    const acceptedBaseline = session.state.latestSnapshot;

    session.enqueue([
      {
        protocolVersion: PROTOCOL_VERSION,
        type: "command",
        command: { id: "advance-delta", type: "advance", ticks: 1 },
      },
    ]);
    port.emit({
      protocolVersion: PROTOCOL_VERSION,
      transportVersion: WORKER_EVENT_DELTA_TRANSPORT_VERSION,
      type: "snapshot-delta",
      commandId: "advance-delta",
      previousEventCount: 1,
      previousTerminalEvent: {
        ...initialized,
        commandId: "forged-history",
      },
      currentEventCount: 2,
      appendedEvents: [
        {
          sequence: 1,
          tick: 1,
          simulationTimeHours: 1 / 60,
          type: "advanced",
          commandId: "advance-delta",
          value: 1,
        },
      ],
      snapshot: {
        checkpoint: snapshot(1, 1).checkpoint,
        traceHash: "trace-after-delta",
      },
    });

    expect(session.state.phase).toBe("error");
    expect(session.state.error).toMatch(/retained event frontier/);
    expect(session.state.latestSnapshot).toBe(acceptedBaseline);
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

  it("fails closed on malformed deserialized responses and keeps trusted command correlation", () => {
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

    port.emit({
      protocolVersion: PROTOCOL_VERSION,
      type: "snapshot",
      commandId: "forged-command",
      snapshot: null,
    });

    expect(session.state).toMatchObject({
      phase: "error",
      pendingCommandId: "advance-active",
      queuedRequests: 0,
    });
    expect(session.state.error).toContain("Invalid worker response");
    expect(session.state.latestSnapshot).toEqual(snapshot(0));
    expect(port.posted).toHaveLength(2);
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
      version: 3,
      requestType: "initialize",
      queuedRequestsBehindAtDispatch: 1,
      senderPostMessageCallMs: 0,
      mainThreadSnapshotCloneMs: 0,
      roundTripMs: 6,
      workerExecutionMs: 2,
      nonWorkerRoundTripMs: 4,
      authoritativeEventArrayLength: 0,
      authoritativeActiveLineageCount: null,
      outcome: "success",
    });
    expect(samples[1]).toMatchObject({
      version: 3,
      requestType: "command",
      commandType: "advance",
      commandId: "advance-profiled",
      requestedAdvanceTicks: 4,
      queuedRequestsBehindAtDispatch: 0,
      senderPostMessageCallMs: 0,
      mainThreadSnapshotCloneMs: 0,
      roundTripMs: 4,
      workerExecutionMs: 3,
      workerExecutionMsPerTick: 0.75,
      nonWorkerRoundTripMs: 1,
      authoritativeEventArrayLength: 2,
      authoritativeActiveLineageCount: null,
      outcome: "success",
    });
    expect(samples[0]?.requestPayloadBytes).toBeGreaterThan(0);
    expect(samples[1]?.responsePayloadBytes).toBeGreaterThan(0);
    expect(session.state.phase).toBe("ready");
  });


  it("profiles delta payload bytes while retaining reconstructed total event count", () => {
    const port = new FakePort();
    const samples: import("../../src/app/workerSession").WorkerSessionPerformanceSample[] = [];
    let now = 100;
    const session = new WorkerSession(port, {
      observe: (sample) => samples.push(sample),
      now: () => now,
    });
    const initialized = {
      sequence: 0,
      tick: 0,
      simulationTimeHours: 0,
      type: "initialized" as const,
    };

    session.enqueue([
      { protocolVersion: PROTOCOL_VERSION, type: "initialize", identity },
      {
        protocolVersion: PROTOCOL_VERSION,
        type: "command",
        command: { id: "advance-delta-profiled", type: "advance", ticks: 1 },
      },
    ]);
    now = 106;
    port.emit({
      protocolVersion: PROTOCOL_VERSION,
      type: "ready",
      snapshot: {
        ...snapshot(0),
        events: [initialized],
        traceHash: "trace-baseline",
      },
      performanceDiagnostics: {
        version: 1,
        executionDurationMs: 1,
      },
    });

    now = 110;
    port.emit({
      protocolVersion: PROTOCOL_VERSION,
      transportVersion: WORKER_EVENT_DELTA_TRANSPORT_VERSION,
      type: "snapshot-delta",
      commandId: "advance-delta-profiled",
      previousEventCount: 1,
      previousTerminalEvent: initialized,
      currentEventCount: 2,
      appendedEvents: [
        {
          sequence: 1,
          tick: 1,
          simulationTimeHours: 1 / 60,
          type: "advanced",
          commandId: "advance-delta-profiled",
          value: 1,
        },
      ],
      snapshot: {
        checkpoint: snapshot(1, 1).checkpoint,
        traceHash: "trace-after-delta",
      },
      performanceDiagnostics: {
        version: 1,
        executionDurationMs: 2,
      },
    });

    expect(samples).toHaveLength(2);
    expect(samples[1]).toMatchObject({
      version: 3,
      requestType: "command",
      commandType: "advance",
      commandId: "advance-delta-profiled",
      authoritativeEventArrayLength: 2,
      mainThreadSnapshotCloneMs: 0,
      workerExecutionMs: 2,
      outcome: "success",
    });
    expect(samples[1]?.responsePayloadBytes).toBeGreaterThan(0);
    expect(session.state.latestSnapshot?.events).toHaveLength(2);
  });

  it("records authoritative active lineage load only for composed snapshots", () => {
    const port = new FakePort();
    const samples: import("../../src/app/workerSession").WorkerSessionPerformanceSample[] = [];
    let now = 200;
    const session = new WorkerSession(port, {
      observe: (sample) => samples.push(sample),
      now: () => now,
    });

    session.enqueue([
      {
        protocolVersion: PROTOCOL_VERSION,
        type: "initialize",
        identity: composedIdentity,
        composedConfig,
      },
    ]);
    now = 205;
    port.emit({
      protocolVersion: PROTOCOL_VERSION,
      type: "ready",
      snapshot: composedSnapshot(),
      performanceDiagnostics: {
        version: 1,
        executionDurationMs: 1,
      },
    });

    expect(samples).toHaveLength(1);
    expect(samples[0]).toMatchObject({
      version: 3,
      authoritativeActiveLineageCount: composedConfig.lineages.length,
      outcome: "success",
    });
    expect(session.state.phase).toBe("ready");
  });

  it("separates sender handoff and snapshot clone cost from request-window timing", () => {
    const port = new FakePort();
    const samples: import("../../src/app/workerSession").WorkerSessionPerformanceSample[] = [];
    const times = [100, 101.25, 108, 108.5, 110];
    const session = new WorkerSession(port, {
      observe: (sample) => samples.push(sample),
      now: () => {
        const value = times.shift();
        if (value === undefined) throw new Error("unexpected timing read");
        return value;
      },
    });

    session.enqueue([
      { protocolVersion: PROTOCOL_VERSION, type: "initialize", identity },
    ]);
    port.emit({
      protocolVersion: PROTOCOL_VERSION,
      type: "ready",
      snapshot: snapshot(0),
      performanceDiagnostics: {
        version: 1,
        executionDurationMs: 2,
      },
    });

    expect(samples).toHaveLength(1);
    expect(samples[0]).toMatchObject({
      version: 3,
      completedAtMs: 108,
      senderPostMessageCallMs: 1.25,
      mainThreadSnapshotCloneMs: 1.5,
      roundTripMs: 8,
      workerExecutionMs: 2,
      nonWorkerRoundTripMs: 6,
      outcome: "success",
    });
    expect(times).toEqual([]);
    expect(session.state.phase).toBe("ready");
  });

  it("treats malformed performance diagnostics as a protocol failure", () => {
    const port = new FakePort();
    const samples: import("../../src/app/workerSession").WorkerSessionPerformanceSample[] = [];
    let now = 40;
    const session = new WorkerSession(port, {
      observe: (sample) => samples.push(sample),
      now: () => now,
    });

    session.enqueue([
      {
        protocolVersion: PROTOCOL_VERSION,
        type: "command",
        command: { id: "profile-invalid", type: "snapshot" },
      },
    ]);

    now = 45;
    port.emit({
      protocolVersion: PROTOCOL_VERSION,
      type: "snapshot",
      commandId: "profile-invalid",
      snapshot: snapshot(0),
      performanceDiagnostics: {
        version: 1,
        executionDurationMs: Number.NaN,
      },
    });

    expect(samples).toHaveLength(1);
    expect(samples[0]).toMatchObject({
      commandId: "profile-invalid",
      roundTripMs: 5,
      workerExecutionMs: null,
      responsePayloadBytes: null,
      outcome: "protocol-error",
    });
    expect(session.state).toMatchObject({
      phase: "error",
      pendingCommandId: "profile-invalid",
      queuedRequests: 0,
    });
    expect(session.state.error).toContain("performanceDiagnostics");
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
  it('preserves typed execution-policy refusals separately from their message', () => {
    const port = new FakePort();
    const session = new WorkerSession(port);

    session.enqueue([
      {
        protocolVersion: PROTOCOL_VERSION,
        type: "command",
        command: {
          id: "too-many-ticks",
          type: "advance",
          ticks: Number.MAX_SAFE_INTEGER,
        },
      },
    ]);

    port.emit({
      protocolVersion: PROTOCOL_VERSION,
      type: "error",
      commandId: "too-many-ticks",
      code: "advance-execution-policy-refusal",
      message: "advance request exceeds execution policy",
    });

    expect(session.state).toMatchObject({
      phase: "error",
      pendingCommandId: "too-many-ticks",
      error: "advance request exceeds execution policy",
      errorCode: "advance-execution-policy-refusal",
      queuedRequests: 0,
    });
  })

});
