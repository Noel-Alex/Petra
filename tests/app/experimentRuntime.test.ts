import type { ComposedSimulationConfig } from "../../src/sim/authoritative";
import type { CuratedMutationGraph } from "../../src/sim/evolution/graph";
import { createFixtureComposedParameterSetBinding } from "../../src/sim/parameterSetBinding";
import { describe, expect, it } from "vitest";
import {
  ExperimentRuntime,
} from "../../src/app/experimentRuntime";
import { createRunBranchIdentity } from "../../src/app/runBranchIdentity";
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

const parameterSetId = "fixture:runtime-fixture";
const parameterSetVersion = "1";

const composedGraph: CuratedMutationGraph = {
  scenarioId: "runtime-fixture",
  scenarioVersion: "1",
  genotypes: [{ id: "WT", relativeFitness: 1, sourceOrder: 0 }],
  transitions: [],
};

const composedConfig: ComposedSimulationConfig = {
  width: 1,
  height: 1,
  mask: [1],
  initialResource: [1],
  ciprofloxacinConcentrationMgPerL: [0],
  initialLineageBiomass: [[1]],
  growth: {
    maxDivisionRate: 0.5,
    halfSaturation: 1,
    biomassYield: 1,
    localCapacity: 10,
    spreadRate: 0,
  },
  lineages: [
    { id: "ancestor", genotypeId: "WT", deathHazardPerHour: 0 },
  ],
  evolutionGraph: composedGraph,
  evolutionScenario: {
    scenarioId: "runtime-fixture",
    scenarioVersion: "1",
  },
  ciprofloxacin: null,
  samplingExecutionPolicy: null,
  hoursPerTick: 0.01,
};

const identity = createRunIdentity({
  scenarioId: "runtime-fixture",
  scenarioVersion: "1",
  parameterSetId,
  parameterSetVersion,
  parameterSetBinding: createFixtureComposedParameterSetBinding(
    parameterSetId,
    parameterSetVersion,
    composedConfig,
  ),
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
      events: [{ sequence: 0, tick: 0, simulationTimeHours: 0, type: "initialized" }],
    }),
  });
  return { port, session, runtime };
}

describe("experiment runtime", () => {
  it("starts and reinitializes with the same composed simulation authority", () => {
    const port = new FakePort();
    const session = new WorkerSession(port);
    const runtime = new ExperimentRuntime(
      session,
      identity,
      commandIds("unused"),
      composedConfig,
    );

    expect(runtime.start()).toBe(true);
    expect(port.posted[0]).toMatchObject({
      type: "initialize",
      identity,
      composedConfig,
    });
    expect(
      port.posted[0]?.type === "initialize" &&
        port.posted[0].composedConfig,
    ).not.toBe(composedConfig);

    port.emit({
      protocolVersion: PROTOCOL_VERSION,
      type: "ready",
      snapshot: makeSnapshot({ tick: 0 }),
    });
    expect(runtime.dispatch({ type: "reset" })).toEqual({
      accepted: true,
      reason: null,
    });
    expect(port.posted.at(-1)).toMatchObject({
      type: "initialize",
      composedConfig,
    });
  });

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

  it("rejects a snapshot with the same parameter-set label but a different bound config", () => {
    const port = new FakePort();
    const session = new WorkerSession(port);
    const runtime = new ExperimentRuntime(session, identity, commandIds());
    const foreignIdentity = structuredClone(identity);
    if (foreignIdentity.parameterSetBinding === undefined) {
      throw new Error("expected bound fixture identity");
    }
    ;(
      foreignIdentity.parameterSetBinding as { configurationFingerprint: string }
    ).configurationFingerprint += "-foreign";

    runtime.start();
    port.emit({
      protocolVersion: PROTOCOL_VERSION,
      type: "ready",
      snapshot: makeSnapshot({ identity: foreignIdentity, tick: 0 }),
    });

    expect(runtime.state.snapshot).toBeNull();
    expect(runtime.state.integrationError).toContain(
      "does not match the active experiment controls",
    );
  });

  it("does not use start as an implicit reset of a ready experiment", () => {
    const { port, runtime } = readyRuntime();
    expect(runtime.start()).toBe(false);
    expect(port.posted).toHaveLength(1);
  });
  it("keeps one branch identity through ordinary accepted commands", () => {
    const { port, runtime } = readyRuntime(["advance-branch-stable"]);
    const branchIdentity = runtime.state.runBranchIdentity;

    expect(branchIdentity).toBe(createRunBranchIdentity(identity, 0));
    expect(runtime.dispatch({ type: "step", ticks: 2 })).toEqual({
      accepted: true,
      reason: null,
    });
    expect(runtime.state.runBranchIdentity).toBe(branchIdentity);

    port.emit({
      protocolVersion: PROTOCOL_VERSION,
      type: "snapshot",
      commandId: "advance-branch-stable",
      snapshot: makeSnapshot({
        tick: 2,
        commandCount: 1,
        events: [
          {
            sequence: 1,
            tick: 2,
            simulationTimeHours: 2 / 60,
            type: "advanced",
            commandId: "advance-branch-stable",
            value: 2,
          },
        ],
      }),
    });

    expect(runtime.state.runBranchIdentity).toBe(branchIdentity);
  });

  it("rotates branch identity for each admitted fresh history generation", () => {
    const { port, runtime } = readyRuntime();
    const initial = runtime.state.runBranchIdentity;
    expect(initial).toBe(createRunBranchIdentity(identity, 0));

    expect(runtime.dispatch({ type: "reset" })).toEqual({
      accepted: true,
      reason: null,
    });
    const resetBranch = runtime.state.runBranchIdentity;
    expect(resetBranch).toBe(createRunBranchIdentity(identity, 1));
    expect(resetBranch).not.toBe(initial);

    port.emit({
      protocolVersion: PROTOCOL_VERSION,
      type: "ready",
      snapshot: makeSnapshot({ tick: 0, commandCount: 0 }),
    });

    const reseededIdentity = { ...identity, seed: 29 };
    expect(runtime.dispatch({ type: "set-seed", seed: 29 })).toEqual({
      accepted: true,
      reason: null,
    });
    const reseededBranch = runtime.state.runBranchIdentity;
    expect(reseededBranch).toBe(createRunBranchIdentity(reseededIdentity, 2));
    expect(reseededBranch).not.toBe(resetBranch);

    port.emit({
      protocolVersion: PROTOCOL_VERSION,
      type: "ready",
      snapshot: makeSnapshot({
        identity: reseededIdentity,
        tick: 0,
        commandCount: 0,
      }),
    });

    expect(runtime.dispatch({ type: "replay" })).toEqual({
      accepted: true,
      reason: null,
    });
    const replayBranch = runtime.state.runBranchIdentity;
    expect(replayBranch).toBe(createRunBranchIdentity(reseededIdentity, 3));
    expect(replayBranch).not.toBe(reseededBranch);
  });

  it("does not rotate branch identity for a lifecycle action rejected while busy", () => {
    const { runtime } = readyRuntime(["advance-busy"]);
    const branchIdentity = runtime.state.runBranchIdentity;

    expect(runtime.dispatch({ type: "step", ticks: 1 }).accepted).toBe(true);
    expect(runtime.dispatch({ type: "reset" })).toEqual({
      accepted: false,
      reason: "worker-busy",
    });
    expect(runtime.state.runBranchIdentity).toBe(branchIdentity);
  });

  it("refuses malformed run-branch generations", () => {
    expect(() => createRunBranchIdentity(identity, -1)).toThrow(
      /non-negative safe integer/,
    );
    expect(() =>
      createRunBranchIdentity(identity, Number.MAX_SAFE_INTEGER + 1),
    ).toThrow(/non-negative safe integer/);
  });

});
