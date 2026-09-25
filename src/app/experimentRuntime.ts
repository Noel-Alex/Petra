import type { ComposedSimulationConfig } from "../sim/authoritative";
import type { ComposedEcologyObservationEnvelope } from "../sim/composedEcologyObservation";
import {
  PROTOCOL_VERSION,
  type RunIdentity,
  type SimulationCheckpoint,
  type SimulationCommand,
  type SimulationEvent,
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
import {
  WorkerSession,
  type WorkerSessionState,
} from "./workerSession";
import { createRunBranchIdentity } from "./runBranchIdentity";

export interface RuntimeEcologyObservation {
  readonly runBranchIdentity: string;
  readonly envelope: ComposedEcologyObservationEnvelope;
}

export interface ExperimentRuntimeState {
  readonly controls: ExperimentControlState;
  /** Runtime-owned command-history generation shared by replay/narration consumers. */
  readonly runBranchIdentity: string;
  readonly worker: WorkerSessionState;
  readonly snapshot: SimulationSnapshot | null;
  /** Step-local ecology evidence for exactly the current accepted snapshot/history generation. */
  readonly ecologyObservation: RuntimeEcologyObservation | null;
  readonly timeline: readonly TimelineEntry[];
  readonly integrationError: string | null;
}

export interface ControlDispatchResult {
  readonly accepted: boolean;
  readonly reason: "worker-busy" | "worker-not-ready" | "disposed" | null;
}

export type AuthoritativeInterventionCommand = Extract<
  SimulationCommand,
  { readonly type: "apply-ciprofloxacin" }
>;

export type ExperimentRuntimeListener = (state: ExperimentRuntimeState) => void;

interface CheckpointHistoryOrigin {
  readonly checkpoint: SimulationCheckpoint;
  readonly restoreCommandId: string;
}

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
  private runBranchGeneration = 0;
  private checkpointHistoryOrigin: CheckpointHistoryOrigin | null = null;
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
      controls: createExperimentControlState(identity),
      runBranchIdentity: createRunBranchIdentity(identity, this.runBranchGeneration),
      worker: session.state,
      snapshot: null,
      ecologyObservation: null,
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
      }

      if (action.type === "reset" || action.type === "set-seed") {
        this.checkpointHistoryOrigin = null;
      }

      const requests =
        action.type === "replay" && this.checkpointHistoryOrigin !== null
          ? this.checkpointReplayRequests(
              planned.state.identity,
              planned.state.acceptedCommands,
            )
          : planned.effect.requests;

      const runBranchIdentity = reinitializesRun
        ? this.rotateRunBranchIdentity(planned.state.identity)
        : this.current.runBranchIdentity;

      if (action.type !== "replay") {
        this.stageReplayableCommands(requests);
      }

      this.current = {
        ...this.current,
        controls: planned.state,
        runBranchIdentity,
        ...(reinitializesRun
          ? { snapshot: null, ecologyObservation: null, timeline: [] }
          : {}),
        integrationError: null,
      };
      this.publish();
      this.session.enqueue(requests);
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
   * Starts a fresh command-history generation from an authoritative checkpoint.
   *
   * This is the runtime primitive for explicit restore-to-earlier/fork flows.
   * The checkpoint becomes replay origin authority; later Replay performs
   * initialize -> same restore -> post-origin accepted commands rather than
   * silently falling back to genesis.
   */
  restoreCheckpoint(checkpoint: SimulationCheckpoint): ControlDispatchResult {
    if (this.current.worker.phase === "disposed") {
      return { accepted: false, reason: "disposed" };
    }
    if (
      this.current.integrationError !== null ||
      this.current.worker.phase === "idle" ||
      this.current.worker.phase === "error"
    ) {
      return { accepted: false, reason: "worker-not-ready" };
    }
    if (
      this.current.worker.phase === "initializing" ||
      this.current.worker.phase === "pending"
    ) {
      return { accepted: false, reason: "worker-busy" };
    }

    this.assertCheckpointHistoryCompatible(checkpoint);

    const restoreCommandId = this.createCommandId();
    const origin: CheckpointHistoryOrigin = {
      checkpoint: structuredClone(checkpoint),
      restoreCommandId,
    };

    this.pendingAcceptance.clear();
    this.checkpointHistoryOrigin = origin;
    this.current = {
      ...this.current,
      controls: {
        ...this.current.controls,
        playing: false,
        acceptedCommands: [],
      },
      runBranchIdentity: this.rotateRunBranchIdentity(
        this.current.controls.identity,
      ),
      snapshot: null,
      ecologyObservation: null,
      timeline: [],
      integrationError: null,
    };
    this.publish();
    this.session.enqueue([
      {
        protocolVersion: PROTOCOL_VERSION,
        type: "command",
        command: {
          id: restoreCommandId,
          type: "restore",
          checkpoint: structuredClone(origin.checkpoint),
        },
      },
    ]);
    return { accepted: true, reason: null };
  }

  /**
   * Dispatches one already-validated biological intervention through the same
   * WorkerSession used by run controls. Replay history remains pending until
   * the matching authoritative event type confirms acceptance.
   */
  dispatchAuthoritativeCommand(
    command: AuthoritativeInterventionCommand,
  ): ControlDispatchResult {
    if (this.current.worker.phase === "disposed") {
      return { accepted: false, reason: "disposed" };
    }
    if (
      this.current.integrationError !== null ||
      this.current.worker.phase === "idle" ||
      this.current.worker.phase === "error"
    ) {
      return { accepted: false, reason: "worker-not-ready" };
    }
    if (
      this.current.worker.phase === "initializing" ||
      this.current.worker.phase === "pending"
    ) {
      return { accepted: false, reason: "worker-busy" };
    }

    const acceptedCommand = structuredClone(command);
    this.pendingAcceptance.set(acceptedCommand.id, acceptedCommand);
    this.session.enqueue([
      {
        protocolVersion: PROTOCOL_VERSION,
        type: "command",
        command: acceptedCommand,
      },
    ]);
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

  private checkpointReplayRequests(
    identity: RunIdentity,
    acceptedCommands: readonly SimulationCommand[],
  ): readonly WorkerRequest[] {
    const origin = this.checkpointHistoryOrigin;
    if (origin === null) {
      throw new Error("checkpoint replay origin is unavailable");
    }

    return [
      this.initializeRequest(identity),
      {
        protocolVersion: PROTOCOL_VERSION,
        type: "command",
        command: {
          id: origin.restoreCommandId,
          type: "restore",
          checkpoint: structuredClone(origin.checkpoint),
        },
      },
      ...acceptedCommands.map((command) => ({
        protocolVersion: PROTOCOL_VERSION,
        type: "command" as const,
        command: structuredClone(command),
      })),
    ];
  }

  private assertCheckpointHistoryCompatible(
    checkpoint: SimulationCheckpoint,
  ): void {
    const activeIdentity = this.current.controls.identity;
    if (
      createRunBranchIdentity(checkpoint.identity, 0) !==
      createRunBranchIdentity(activeIdentity, 0)
    ) {
      throw new Error(
        "checkpoint identity does not match the active experiment runtime",
      );
    }

    const checkpointIsComposed = checkpoint.authority === "composed";
    const runtimeIsComposed = this.composedConfig !== undefined;
    if (checkpointIsComposed !== runtimeIsComposed) {
      throw new Error(
        "checkpoint authority does not match the active experiment runtime",
      );
    }
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
    // WorkerSession publishes the same snapshot object while a request is pending
    // and a fresh cloned object for every accepted response transaction. Trace
    // identity alone is insufficient here because snapshot-only commands can
    // legitimately return the same scientific trace while intentionally omitting
    // step-local observations. Treat the accepted Worker transaction as the
    // freshness boundary so stale derived observations are cleared immediately.
    const isNewSnapshot =
      candidate !== null &&
      candidate !== this.current.worker.latestSnapshot;

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
        const confirmed = candidate.events.some((event) =>
          eventConfirmsCommand(event, command),
        );
        if (!confirmed) continue;
        controls = recordAcceptedCommand(controls, command);
        this.pendingAcceptance.delete(commandId);
      }

      const runBranchIdentity = this.current.runBranchIdentity;
      const ecologyObservation =
        candidate.checkpoint.authority === "composed" &&
        candidate.ecologyObservation !== undefined
          ? {
              runBranchIdentity,
              envelope: structuredClone(candidate.ecologyObservation),
            }
          : null;

      this.current = {
        controls,
        runBranchIdentity,
        worker,
        snapshot: structuredClone(candidate),
        ecologyObservation,
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

  private rotateRunBranchIdentity(identity: RunIdentity): string {
    if (this.runBranchGeneration >= Number.MAX_SAFE_INTEGER) {
      throw new RangeError("run branch generation exhausted safe integer range");
    }
    this.runBranchGeneration += 1;
    return createRunBranchIdentity(identity, this.runBranchGeneration);
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

function eventConfirmsCommand(
  event: SimulationEvent,
  command: SimulationCommand,
): boolean {
  if (event.commandId !== command.id) return false;

  switch (command.type) {
    case "advance":
      return event.type === "advanced";
    case "apply-ciprofloxacin":
      return event.type === "ciprofloxacin-applied";
    case "synthetic-pulse":
      return event.type === "synthetic-pulse";
    case "restore":
    case "snapshot":
      return false;
  }
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
