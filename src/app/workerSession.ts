import {
  PROTOCOL_VERSION,
  type SimulationCommand,
  type SimulationSnapshot,
  type WorkerRequest,
  type WorkerResponse,
} from "../sim/protocol";
import {
  WORKER_PERFORMANCE_DIAGNOSTICS_VERSION,
  estimateStructuredClonePayloadBytes,
  type InstrumentedWorkerRequest,
  type InstrumentedWorkerResponse,
} from "../worker/performanceInstrumentation";

export type WorkerSessionPhase =
  | "idle"
  | "initializing"
  | "pending"
  | "ready"
  | "error"
  | "disposed";

export interface WorkerSessionState {
  readonly phase: WorkerSessionPhase;
  readonly latestSnapshot: SimulationSnapshot | null;
  readonly pendingCommandId: string | null;
  readonly queuedRequests: number;
  readonly error: string | null;
}

export interface WorkerPortHandlers {
  readonly message: (response: InstrumentedWorkerResponse) => void;
  readonly error: (message: string) => void;
}

export type WorkerPerformanceOutcome =
  | "success"
  | "worker-error"
  | "transport-error"
  | "protocol-error";

export interface WorkerSessionPerformanceSample {
  readonly version: 1;
  readonly completedAtMs: number;
  readonly requestType: WorkerRequest["type"];
  readonly commandType: SimulationCommand["type"] | null;
  readonly commandId: string | null;
  readonly requestedAdvanceTicks: number | null;
  readonly queuedRequestsBehindAtDispatch: number;
  readonly requestPayloadBytes: number;
  readonly responsePayloadBytes: number | null;
  readonly roundTripMs: number;
  readonly workerExecutionMs: number | null;
  readonly workerExecutionMsPerTick: number | null;
  readonly nonWorkerRoundTripMs: number | null;
  readonly authoritativeEventArrayLength: number | null;
  readonly outcome: WorkerPerformanceOutcome;
}

export interface WorkerSessionPerformanceOptions {
  readonly observe: (sample: WorkerSessionPerformanceSample) => void;
  readonly now?: () => number;
}

export interface WorkerPort {
  post(request: WorkerRequest): void;
  subscribe(handlers: WorkerPortHandlers): () => void;
  dispose(): void;
}

export type WorkerSessionListener = (state: WorkerSessionState) => void;

const INITIAL_STATE: WorkerSessionState = {
  phase: "idle",
  latestSnapshot: null,
  pendingCommandId: null,
  queuedRequests: 0,
  error: null,
};

interface ActivePerformanceMeasurement {
  readonly startedAtMs: number;
  readonly requestPayloadBytes: number;
  readonly queuedRequestsBehindAtDispatch: number;
}

export class WorkerSession {
  private readonly queue: WorkerRequest[] = [];
  private readonly listeners = new Set<WorkerSessionListener>();
  private readonly unsubscribePort: () => void;
  private readonly performanceOptions: {
    readonly observe: (sample: WorkerSessionPerformanceSample) => void;
    readonly now: () => number;
  } | null;
  private active: WorkerRequest | null = null;
  private activePerformance: ActivePerformanceMeasurement | null = null;
  private current: WorkerSessionState = INITIAL_STATE;

  constructor(
    private readonly port: WorkerPort,
    performanceOptions?: WorkerSessionPerformanceOptions,
  ) {
    this.performanceOptions =
      performanceOptions === undefined
        ? null
        : {
            observe: performanceOptions.observe,
            now: performanceOptions.now ?? (() => performance.now()),
          };
    this.unsubscribePort = port.subscribe({
      message: (response) => this.handleResponse(response),
      error: (message) => {
        this.recordPerformance(null, "transport-error");
        this.fail(message, this.activeCommandId());
      },
    });
  }

  get state(): WorkerSessionState {
    return this.current;
  }

  subscribe(listener: WorkerSessionListener): () => void {
    this.assertUsable();
    this.listeners.add(listener);
    listener(this.current);
    return () => {
      this.listeners.delete(listener);
    };
  }

  enqueue(requests: readonly WorkerRequest[]): void {
    this.assertUsable();
    for (const request of requests) {
      this.queue.push(structuredClone(request));
    }
    if (this.active === null) {
      this.pump();
    } else {
      this.publish({ ...this.current, queuedRequests: this.queue.length });
    }
  }

  dispose(): void {
    if (this.current.phase === "disposed") return;
    this.queue.length = 0;
    this.active = null;
    this.activePerformance = null;
    this.unsubscribePort();
    this.port.dispose();
    this.publish({
      phase: "disposed",
      latestSnapshot: this.current.latestSnapshot,
      pendingCommandId: null,
      queuedRequests: 0,
      error: null,
    });
    this.listeners.clear();
  }

  private pump(): void {
    if (this.current.phase === "disposed" || this.active !== null) return;

    const next = this.queue.shift();
    if (next === undefined) {
      this.publish({
        phase: this.current.latestSnapshot === null ? "idle" : "ready",
        latestSnapshot: this.current.latestSnapshot,
        pendingCommandId: null,
        queuedRequests: 0,
        error: null,
      });
      return;
    }

    this.active = next;
    const pendingCommandId = next.type === "command" ? next.command.id : null;
    this.publish({
      phase: next.type === "initialize" ? "initializing" : "pending",
      latestSnapshot: this.current.latestSnapshot,
      pendingCommandId,
      queuedRequests: this.queue.length,
      error: null,
    });

    const outbound: InstrumentedWorkerRequest =
      this.performanceOptions === null
        ? next
        : { ...next, performanceDiagnostics: true };

    if (this.performanceOptions === null) {
      this.activePerformance = null;
    } else {
      const requestPayloadBytes = estimateStructuredClonePayloadBytes(outbound);
      this.activePerformance = {
        startedAtMs: this.performanceOptions.now(),
        requestPayloadBytes,
        queuedRequestsBehindAtDispatch: this.queue.length,
      };
    }

    try {
      this.port.post(outbound);
    } catch (error) {
      this.recordPerformance(null, "transport-error");
      this.fail(error instanceof Error ? error.message : String(error), pendingCommandId);
    }
  }

  private handleResponse(response: InstrumentedWorkerResponse): void {
    if (this.current.phase === "disposed") return;

    if (response.protocolVersion !== PROTOCOL_VERSION) {
      this.recordPerformance(response, "protocol-error");
      this.fail(
        `Worker protocol mismatch: expected ${PROTOCOL_VERSION}, received ${response.protocolVersion}`,
        responseCommandId(response),
      );
      return;
    }

    const active = this.active;
    if (active === null) {
      this.fail("Received a worker response with no pending request", responseCommandId(response));
      return;
    }

    if (response.type === "error") {
      const expectedId = active.type === "command" ? active.command.id : null;
      const actualId = response.commandId ?? null;
      if (expectedId !== null && actualId !== expectedId) {
        this.recordPerformance(response, "protocol-error");
        this.fail(
          `Worker error command mismatch: expected ${expectedId}, received ${actualId ?? "none"}`,
          actualId,
        );
        return;
      }
      this.recordPerformance(response, "worker-error");
      this.fail(response.message, actualId);
      return;
    }

    if (active.type === "initialize") {
      if (response.type !== "ready") {
        this.recordPerformance(response, "protocol-error");
        this.fail("Expected worker ready response after initialization", responseCommandId(response));
        return;
      }
      this.recordPerformance(response, "success");
      this.complete(response.snapshot);
      return;
    }

    if (response.type !== "snapshot") {
      this.recordPerformance(response, "protocol-error");
      this.fail(
        `Expected snapshot for command ${active.command.id}`,
        responseCommandId(response),
      );
      return;
    }

    if (response.commandId !== active.command.id) {
      this.recordPerformance(response, "protocol-error");
      this.fail(
        `Worker snapshot command mismatch: expected ${active.command.id}, received ${response.commandId}`,
        response.commandId,
      );
      return;
    }

    this.recordPerformance(response, "success");
    this.complete(response.snapshot);
  }

  private recordPerformance(
    response: InstrumentedWorkerResponse | null,
    outcome: WorkerPerformanceOutcome,
  ): void {
    const active = this.active;
    const measurement = this.activePerformance;
    const options = this.performanceOptions;
    if (active === null || measurement === null || options === null) return;

    this.activePerformance = null;
    const completedAtMs = options.now();
    const roundTripMs = Math.max(0, completedAtMs - measurement.startedAtMs);
    const workerExecutionMs =
      response?.performanceDiagnostics?.version ===
        WORKER_PERFORMANCE_DIAGNOSTICS_VERSION &&
      Number.isFinite(response.performanceDiagnostics.executionDurationMs) &&
      response.performanceDiagnostics.executionDurationMs >= 0
        ? response.performanceDiagnostics.executionDurationMs
        : null;
    const command = active.type === "command" ? active.command : null;
    const requestedAdvanceTicks =
      command?.type === "advance" ? command.ticks : null;
    const authoritativeEventArrayLength =
      response?.type === "ready" || response?.type === "snapshot"
        ? response.snapshot.events.length
        : null;
    const sample: WorkerSessionPerformanceSample = {
      version: 1,
      completedAtMs,
      requestType: active.type,
      commandType: command?.type ?? null,
      commandId: command?.id ?? null,
      requestedAdvanceTicks,
      queuedRequestsBehindAtDispatch:
        measurement.queuedRequestsBehindAtDispatch,
      requestPayloadBytes: measurement.requestPayloadBytes,
      responsePayloadBytes:
        response === null
          ? null
          : estimateStructuredClonePayloadBytes(response),
      roundTripMs,
      workerExecutionMs,
      workerExecutionMsPerTick:
        workerExecutionMs !== null &&
        requestedAdvanceTicks !== null &&
        requestedAdvanceTicks > 0
          ? workerExecutionMs / requestedAdvanceTicks
          : null,
      nonWorkerRoundTripMs:
        workerExecutionMs === null
          ? null
          : Math.max(0, roundTripMs - workerExecutionMs),
      authoritativeEventArrayLength,
      outcome,
    };

    try {
      options.observe(sample);
    } catch {
      // Profiling is observational. A diagnostics sink must never break the
      // authoritative runtime or alter request ordering.
    }
  }

  private complete(snapshot: SimulationSnapshot): void {
    this.active = null;
    const latestSnapshot = structuredClone(snapshot);

    if (this.queue.length === 0) {
      this.publish({
        phase: "ready",
        latestSnapshot,
        pendingCommandId: null,
        queuedRequests: 0,
        error: null,
      });
      return;
    }

    // Carry the newly accepted authoritative snapshot into the next pending
    // state without publishing a false "ready" gap during replay/batches.
    this.current = {
      ...this.current,
      latestSnapshot,
      pendingCommandId: null,
      queuedRequests: this.queue.length,
      error: null,
    };
    this.pump();
  }

  private activeCommandId(): string | null {
    return this.active?.type === "command" ? this.active.command.id : null;
  }

  private fail(message: string, commandId: string | null): void {
    this.queue.length = 0;
    this.active = null;
    this.activePerformance = null;
    this.publish({
      phase: "error",
      latestSnapshot: this.current.latestSnapshot,
      pendingCommandId: commandId,
      queuedRequests: 0,
      error: message,
    });
  }

  private publish(state: WorkerSessionState): void {
    this.current = state;
    for (const listener of this.listeners) {
      listener(state);
    }
  }

  private assertUsable(): void {
    if (this.current.phase === "disposed") {
      throw new Error("WorkerSession is disposed");
    }
  }
}

export function createBrowserWorkerPort(worker: Worker): WorkerPort {
  return {
    post(request) {
      worker.postMessage(request);
    },
    subscribe(handlers) {
      const onMessage = (event: MessageEvent<InstrumentedWorkerResponse>) => {
        handlers.message(event.data);
      };
      const onError = (event: ErrorEvent) => {
        handlers.error(event.message || "Simulation worker failed");
      };
      const onMessageError = () => {
        handlers.error("Simulation worker message could not be deserialized");
      };
      worker.addEventListener("message", onMessage);
      worker.addEventListener("error", onError);
      worker.addEventListener("messageerror", onMessageError);
      return () => {
        worker.removeEventListener("message", onMessage);
        worker.removeEventListener("error", onError);
        worker.removeEventListener("messageerror", onMessageError);
      };
    },
    dispose() {
      worker.terminate();
    },
  };
}

export function createSimulationWorkerSession(
  performanceOptions?: WorkerSessionPerformanceOptions,
): WorkerSession {
  const worker = new Worker(
    new URL("../worker/simulation.worker.ts", import.meta.url),
    { type: "module", name: "petra-simulation" },
  );
  return new WorkerSession(createBrowserWorkerPort(worker), performanceOptions);
}

function responseCommandId(response: WorkerResponse): string | null {
  if (response.type === "snapshot") return response.commandId;
  if (response.type === "error") return response.commandId ?? null;
  return null;
}
