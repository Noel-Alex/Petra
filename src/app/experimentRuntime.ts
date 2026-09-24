import type { ComposedSimulationConfig } from "../sim/authoritative";
import {
  PROTOCOL_VERSION,
  type RunIdentity,
  type SimulationCommand,
  type SimulationSnapshot,
  type WorkerRequest,
} from "../sim/protocol";
import {
  createExperimentControlState,
  planExperimentControlAction,
  recordAcceptedCommand,
  schedulerAdvanceTicks,
  snapshotMatchesControlIdentity,
  type ExperimentControlAction,
  type ExperimentControlState,
} from "../ui/experimentControls";
import {
  buildScientificTimeline,
  type TimelineEntry,
} from "../ui/timeline";
import { createRunBranchIdentity } from "./runBranchIdentity";
import {
  WorkerSession,
  type WorkerSessionState,
} from "./workerSession";

export interface ExperimentRuntimeState {
  /** Runtime-owned identity for one monotonic accepted-command history generation. */
  readonly runBranchIdentity: string;
  readonly controls: ExperimentControlState;
  readonly worker: WorkerSessionState;
  readonly snapshot: SimulationSnapshot | null;
  readonly timeline: readonly TimelineEntry[];
  readonly integrationError: string | null;
}

export interface ControlDispatchResult {
  readonly accepted: boolean;
  readonly reason: "worker-busy" | "worker-not-ready" | "disposed" | null;
}

export type ExperimentRuntimeListener = (state: ExperimentRuntimeState) => void;

/**
 * Framework-neutral orchestration between UI control intent and authoritative
 * worker state. React may subscribe to this object but does not gain authority
 * over biology by doing so.
 */
export class ExperimentRuntime {
  private readonly listeners = new Set<ExperimentRuntimeListener>();
  private readonly pendingAcceptance = new Map<string, SimulationCommand>();
  private readonly unsubscribeWorker: () => void;
  private readonly composedConfig: ComposedSimulationConfig | undefined;
  private historyGeneration = 0;
  private current: ExperimentRuntimeState;

  constructor(
    private readonly session: WorkerSession,
    identity: RunIdentity,
    private readonly createCommandId: () => string,
    composedConfig?: ComposedSimulationConfig,
  ) {
    this.composedConfig =
      composedConfig === undefined ? undefined : structuredClone(composedConfig);
    this.current = {
      runBranchIdentity: createRunBranchIdentity(identity, this.historyGeneration),
      controls: createExperimentControlState(identity),
      worker: session.state,
      snapshot: null,
      timeline: [],
      integrationError: null,
    };

    this.unsubscribeWorker = session.subscribe((worker) => {
      this.handleWorkerState(worker);
    });
  }

  get state(): ExperimentRuntimeState {
    return this.current;
  }

  subscribe(listener: ExperimentRuntimeListener): () => void {
    this.assertUsable();
    this.listeners.add(listener);
    listener(this.current);
    return () => {
      this.listeners.delete(listener);
    };
  }

  start(): boolean {
    this.assertUsable();
    if (this.current.worker.phase !== "idle") {
      return false;
    }

    this.pendingAcceptance.clear();
    this.session.enqueue([
      this.initializeRequest(this.current.controls.identity),
    ]);
    return true;
  }

  dispatch(action: ExperimentControlAction): ControlDispatchResult {
    if (this.current.worker.phase === "disposed") {
      return { accepted: false, reason: "disposed" };
    }

    if (
      this.current.integrationError !== null &&
      (action.type === "step" || action.type === "snapshot")
    ) {
      return { accepted: false, reason: "worker-not-ready" };
    }

    const planned = planExperimentControlAction(
      this.current.controls,
      action,
      this.createCommandId,
      this.composedConfig,
    );

    if (planned.effect.type === "worker-requests") {
      const blocked = workerEffectBlockReason(action, this.current.worker.phase);
      if (blocked !== null) {
        return { accepted: false, reason: blocked };
      }

      const reinitializesRun =
        action.type === "reset" ||
        action.type === "set-seed" ||
        action.type === "replay";

      if (reinitializesRun) {
        this.pendingAcceptance.clear();
        this.historyGeneration += 1;
      }

      if (action.type !== "replay") {
        this.stageReplayableCommands(planned.effect.requests);
      }

      this.current = {
        ...this.current,
        controls: planned.state,
        ...(reinitializesRun
          ? {
              runBranchIdentity: createRunBranchIdentity(
                planned.state.identity,
                this.historyGeneration,
              ),
              snapshot: null,
              timeline: [],
            }
          : {}),
        integrationError: null,
      };
      this.publish();
      this.session.enqueue(planned.effect.requests);
      return { accepted: true, reason: null };
    }

    this.current = {
      ...this.current,
      controls: planned.state,
    };
    this.publish();
    return { accepted: true, reason: null };
  }

  /**
   * Called by a React timer/animation-frame scheduler. Playback speed changes
   * requested authoritative tick count; wall-clock cadence remains presentation.
   */
  advancePlayback(): boolean {
    if (!this.current.controls.playing) return false;
    if (this.current.integrationError !== null) return false;
    if (this.current.worker.phase !== "ready") return false;

    const result = this.dispatch({
      type: "step",
      ticks: schedulerAdvanceTicks(this.current.controls.speed),
    });
    return result.accepted;
  }

  dispose(): void {
    if (this.current.worker.phase === "disposed") return;
    this.pendingAcceptance.clear();
    this.session.dispose();
    this.unsubscribeWorker();
    this.listeners.clear();
  }

  private initializeRequest(identity: RunIdentity): WorkerRequest {
    return {
      protocolVersion: PROTOCOL_VERSION,
      type: "initialize",
      identity: structuredClone(identity),
      ...(this.composedConfig === undefined
        ? {}
        : { composedConfig: structuredClone(this.composedConfig) }),
    };
  }

  private stageReplayableCommands(requests: readonly WorkerRequest[]): void {
    for (const request of requests) {
      if (request.type !== "command") continue;
      if (!isReplayableCommand(request.command)) continue;
      this.pendingAcceptance.set(request.command.id, structuredClone(request.command));
    }
  }

  private handleWorkerState(worker: WorkerSessionState): void {
    if (worker.phase === "error") {
      this.pendingAcceptance.clear();
      this.current = {
        ...this.current,
        controls: { ...this.current.controls, playing: false },
        worker,
        integrationError: worker.error,
      };
      this.publish();
      return;
    }

    const candidate = worker.latestSnapshot;
    const isNewSnapshot =
      candidate !== null &&
      candidate.traceHash !== this.current.snapshot?.traceHash;

    if (isNewSnapshot) {
      if (!snapshotMatchesControlIdentity(this.current.controls, candidate)) {
        this.pendingAcceptance.clear();
        this.current = {
          ...this.current,
          controls: { ...this.current.controls, playing: false },
          worker,
          integrationError:
            "Worker snapshot identity does not match the active experiment controls",
        };
        this.publish();
        return;
      }

      let controls = this.current.controls;
      for (const [commandId, command] of this.pendingAcceptance) {
        const confirmed = candidate.events.some(
          (event) => event.commandId === commandId,
        );
        if (!confirmed) continue;
        controls = recordAcceptedCommand(controls, command);
        this.pendingAcceptance.delete(commandId);
      }

      this.current = {
        runBranchIdentity: this.current.runBranchIdentity,
        controls,
        worker,
        snapshot: structuredClone(candidate),
        timeline: buildScientificTimeline(candidate),
        integrationError: null,
      };
      this.publish();
      return;
    }

    this.current = {
      ...this.current,
      worker,
    };
    this.publish();
  }

  private publish(): void {
    for (const listener of this.listeners) {
      listener(this.current);
    }
  }

  private assertUsable(): void {
    if (this.current.worker.phase === "disposed") {
      throw new Error("ExperimentRuntime is disposed");
    }
  }
}

function isReplayableCommand(command: SimulationCommand): boolean {
  return command.type !== "snapshot" && command.type !== "restore";
}

function workerEffectBlockReason(
  action: ExperimentControlAction,
  phase: WorkerSessionState["phase"],
): ControlDispatchResult["reason"] {
  if (phase === "disposed") return "disposed";
  if (phase === "initializing" || phase === "pending") return "worker-busy";

  if (action.type === "step" || action.type === "snapshot") {
    return phase === "ready" ? null : "worker-not-ready";
  }

  return null;
}
