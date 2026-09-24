import { describe, expect, it } from "vitest";
import {
  ExperimentRuntime,
} from "../../src/app/experimentRuntime";
import {
  WorkerSession,
  type WorkerPort,
  type WorkerPortHandlers,
} from "../../src/app/workerSession";
import {
  PROTOCOL_VERSION,
  createRunIdentity,
  type RunIdentity,
  type SimulationEvent,
  type SimulationSnapshot,
  type WorkerRequest,
  type WorkerResponse,
} from "../../src/sim/protocol";

const identity = createRunIdentity({
  scenarioId: "runtime-fixture",
  scenarioVersion: "1",
  parameterSetId: "runtime-fixture",
  parameterSetVersion: "1",
  seed: 23,
});

function makeSnapshot(args: {
  identity?: RunIdentity;
  tick: number;
  commandCount?: number;
  events?: readonly SimulationEvent[];
}): SimulationSnapshot {
  const commandCount = args.commandCount ?? 0;
  return {
    checkpoint: {
      identity: args.identity ?? identity,
      tick: args.tick,
      simulationTimeHours: args.tick / 60,
      syntheticPopulation: 100 + args.tick,
      rngState: [1, 2, 3, 4],
      commandCount,
    },
    events: args.events ?? [],
    traceHash: `trace-${args.identity?.seed ?? identity.seed}-${args.tick}-${commandCount}`,
  };
}

class FakePort implements WorkerPort {
  readonly posted: WorkerRequest[] = [];
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

  dispose(): void {}

  emit(response: WorkerResponse): void {
    this.handlers?.message(response);
  }
}

function commandIds(...ids: string[]): () => string {
  let index = 0;
  return () => ids[index++] ?? `command-${index}`;
}

function readyRuntime(ids: string[] = ["step-1"]) {
  const port = new FakePort();
  const session = new WorkerSession(port);
  const runtime = new ExperimentRuntime(session, identity, commandIds(...ids));
  expect(runtime.start()).toBe(true);
  port.emit({
    protocolVersion: PROTOCOL_VERSION,
    type: "ready",
    snapshot: makeSnapshot({
      tick: 0,
      events: [{ sequence: 0, tick: 0, type: "initialized" }],
    }),
  });
  return { port, session, runtime };
}

describe("experiment runtime", () => {
  it("initializes through the worker and projects authoritative timeline state", () => {
    const { port, runtime } = readyRuntime();

    expect(port.posted[0]).toMatchObject({
      type: "initialize",
      identity,
    });
    expect(runtime.state.worker.phase).toBe("ready");
    expect(runtime.state.snapshot?.checkpoint.tick).toBe(0);
    expect(runtime.state.timeline).toEqual([
      {
        id: "event-0",
        sequence: 0,
        tick: 0,
        simulationTimeHours: 0,
        kind: "run",
        label: "Run initialized",
      },
    ]);
  });

  it("records a replayable command only after authoritative event confirmation", () => {
    const { port, runtime } = readyRuntime(["advance-1"]);

    const dispatched = runtime.dispatch({ type: "step", ticks: 4 });
    expect(dispatched).toEqual({ accepted: true, reason: null });
    expect(runtime.state.controls.acceptedCommands).toEqual([]);
    expect(runtime.state.worker.phase).toBe("pending");
    expect(port.posted[1]).toMatchObject({
      type: "command",
      command: { id: "advance-1", type: "advance", ticks: 4 },
    });

    port.emit({
      protocolVersion: PROTOCOL_VERSION,
      type: "snapshot",
      commandId: "advance-1",
      snapshot: makeSnapshot({
        tick: 4,
        commandCount: 1,
        events: [
          { sequence: 0, tick: 0, type: "initialized" },
          {
            sequence: 1,
            tick: 4,
            type: "advanced",
            commandId: "advance-1",
            value: 4,
          },
        ],
      }),
    });

    expect(runtime.state.controls.acceptedCommands).toEqual([
      { id: "advance-1", type: "advance", ticks: 4 },
    ]);
    expect(runtime.state.timeline.at(-1)).toMatchObject({
      commandId: "advance-1",
      kind: "advance",
      tick: 4,
    });
  });

  it("does not pile playback requests while the worker is busy", () => {
    const { port, runtime } = readyRuntime(["playback-1", "playback-2"]);

    runtime.dispatch({ type: "play" });
    runtime.dispatch({ type: "set-speed", speed: 4 });

    expect(runtime.advancePlayback()).toBe(true);
    expect(runtime.advancePlayback()).toBe(false);
    expect(port.posted).toHaveLength(2);
    expect(port.posted[1]).toMatchObject({
      type: "command",
      command: { id: "playback-1", type: "advance", ticks: 4 },
    });
  });

  it("clears stale snapshot and timeline while resetting the run", () => {
    const { port, runtime } = readyRuntime();

    expect(runtime.state.snapshot).not.toBeNull();
    const result = runtime.dispatch({ type: "reset" });

    expect(result).toEqual({ accepted: true, reason: null });
    expect(runtime.state.snapshot).toBeNull();
    expect(runtime.state.timeline).toEqual([]);
    expect(runtime.state.worker.phase).toBe("initializing");
    expect(port.posted.at(-1)).toMatchObject({ type: "initialize" });
  });

  it("rejects manual worker effects before initialization is ready", () => {
    const port = new FakePort();
    const session = new WorkerSession(port);
    const runtime = new ExperimentRuntime(session, identity, commandIds("step-1"));

    expect(runtime.dispatch({ type: "step" })).toEqual({
      accepted: false,
      reason: "worker-not-ready",
    });
    expect(port.posted).toEqual([]);
  });

  it("refuses mismatched run identity instead of rendering foreign state", () => {
    const port = new FakePort();
    const session = new WorkerSession(port);
    const runtime = new ExperimentRuntime(session, identity, commandIds());
    const otherIdentity = createRunIdentity({
      scenarioId: "other",
      scenarioVersion: "1",
      parameterSetId: "other",
      parameterSetVersion: "1",
      seed: 99,
    });

    runtime.start();
    port.emit({
      protocolVersion: PROTOCOL_VERSION,
      type: "ready",
      snapshot: makeSnapshot({ identity: otherIdentity, tick: 0 }),
    });

    expect(runtime.state.snapshot).toBeNull();
    expect(runtime.state.integrationError).toContain(
      "does not match the active experiment controls",
    );
    expect(runtime.state.controls.playing).toBe(false);
    expect(runtime.dispatch({ type: "step" })).toEqual({
      accepted: false,
      reason: "worker-not-ready",
    });
    runtime.dispatch({ type: "play" });
    expect(runtime.advancePlayback()).toBe(false);
  });

  it("does not use start as an implicit reset of a ready experiment", () => {
    const { port, runtime } = readyRuntime();
    expect(runtime.start()).toBe(false);
    expect(port.posted).toHaveLength(1);
  });
});
