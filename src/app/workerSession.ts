import {
  type SimulationSnapshot,
  type WorkerRequest,
  type WorkerResponse,
} from "../sim/protocol";
import { parseWorkerResponse } from "../sim/protocolRuntime";

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
  readonly message: (response: unknown) => void;
  readonly error: (message: string) => void;
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

export class WorkerSession {
  private readonly queue: WorkerRequest[] = [];
  private readonly listeners = new Set<WorkerSessionListener>();
  private readonly unsubscribePort: () => void;
  private active: WorkerRequest | null = null;
  private current: WorkerSessionState = INITIAL_STATE;

  constructor(private readonly port: WorkerPort) {
    this.unsubscribePort = port.subscribe({
      message: (response) => this.handleResponse(response),
      error: (message) => this.fail(message, this.activeCommandId()),
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

    try {
      this.port.post(next);
    } catch (error) {
      this.fail(error instanceof Error ? error.message : String(error), pendingCommandId);
    }
  }

  private handleResponse(payload: unknown): void {
    if (this.current.phase === "disposed") return;

    const parsed = parseWorkerResponse(payload);
    if (!parsed.ok) {
      this.fail(parsed.error, this.activeCommandId());
      return;
    }

    const response = parsed.value;
    const active = this.active;
    if (active === null) {
      this.fail("Received a worker response with no pending request", responseCommandId(response));
      return;
    }

    if (response.type === "error") {
      const expectedId = active.type === "command" ? active.command.id : null;
      const actualId = response.commandId ?? null;
      if (expectedId !== null && actualId !== expectedId) {
        this.fail(
          `Worker error command mismatch: expected ${expectedId}, received ${actualId ?? "none"}`,
          actualId,
        );
        return;
      }
      this.fail(response.message, actualId);
      return;
    }

    if (active.type === "initialize") {
      if (response.type !== "ready") {
        this.fail("Expected worker ready response after initialization", responseCommandId(response));
        return;
      }
      this.complete(response.snapshot);
      return;
    }

    if (response.type !== "snapshot") {
      this.fail(
        `Expected snapshot for command ${active.command.id}`,
        responseCommandId(response),
      );
      return;
    }

    if (response.commandId !== active.command.id) {
      this.fail(
        `Worker snapshot command mismatch: expected ${active.command.id}, received ${response.commandId}`,
        response.commandId,
      );
      return;
    }

    this.complete(response.snapshot);
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
      const onMessage = (event: MessageEvent<unknown>) => {
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

export function createSimulationWorkerSession(): WorkerSession {
  const worker = new Worker(
    new URL("../worker/simulation.worker.ts", import.meta.url),
    { type: "module", name: "petra-simulation" },
  );
  return new WorkerSession(createBrowserWorkerPort(worker));
}

function responseCommandId(response: WorkerResponse): string | null {
  if (response.type === "snapshot") return response.commandId;
  if (response.type === "error") return response.commandId ?? null;
  return null;
}
