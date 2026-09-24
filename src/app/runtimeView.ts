import type { PlaybackSpeed } from "../ui/experimentControls";
import type { TimelineEntry } from "../ui/timeline";
import type {
  ExperimentRuntimeState,
} from "./experimentRuntime";
import type { WorkerSessionPhase } from "./workerSession";

export type RuntimeUiStatus =
  | "unavailable"
  | "starting"
  | "pending"
  | "ready"
  | "error";

export interface ExperimentRunControlsView {
  readonly seed: number | null;
  readonly acceptedCommandCount: number;
  readonly canStep: boolean;
  readonly canReset: boolean;
  readonly canReplay: boolean;
  readonly canSetSeed: boolean;
}

export interface ExperimentRuntimeView {
  /** Visible request/transport phase used by data attributes and CSS treatment. */
  readonly status: RuntimeUiStatus;
  /** Stable semantic copy suitable for the general runtime live region. */
  readonly statusText: string;
  readonly statusRole: "status" | "alert";
  readonly workerPhase: WorkerSessionPhase | null;
  readonly playing: boolean;
  readonly speed: PlaybackSpeed;
  readonly canTogglePlayback: boolean;
  readonly canChangeSpeed: boolean;
  readonly simulationTimeLabel: string;
  readonly timeline: readonly TimelineEntry[];
  readonly error: string | null;
  readonly runControls: ExperimentRunControlsView;
}

/**
 * Presentation-only projection of framework-neutral runtime state.
 * No missing scientific values are inferred or filled here.
 */
export function projectExperimentRuntimeView(
  state: ExperimentRuntimeState | null,
  setupError: string | null = null,
): ExperimentRuntimeView {
  const runControls = projectRunControls(state, setupError);

  if (setupError !== null) {
    return {
      status: "error",
      statusText: setupError,
      statusRole: "alert",
      workerPhase: state?.worker.phase ?? null,
      playing: false,
      speed: state?.controls.speed ?? 1,
      canTogglePlayback: false,
      canChangeSpeed: false,
      simulationTimeLabel: simulationTimeLabel(state),
      timeline: state?.timeline ?? [],
      error: setupError,
      runControls,
    };
  }

  if (state === null || state.worker.phase === "disposed") {
    return {
      status: "unavailable",
      statusText: "Authoritative simulation not connected",
      statusRole: "status",
      workerPhase: state?.worker.phase ?? null,
      playing: false,
      speed: state?.controls.speed ?? 1,
      canTogglePlayback: false,
      canChangeSpeed: false,
      simulationTimeLabel: simulationTimeLabel(state),
      timeline: state?.timeline ?? [],
      error: null,
      runControls,
    };
  }

  const runtimeError = state.integrationError ?? state.worker.error;
  if (runtimeError !== null || state.worker.phase === "error") {
    const error = runtimeError ?? "Simulation runtime failed";
    return {
      status: "error",
      statusText: error,
      statusRole: "alert",
      workerPhase: state.worker.phase,
      playing: false,
      speed: state.controls.speed,
      canTogglePlayback: false,
      canChangeSpeed: false,
      simulationTimeLabel: simulationTimeLabel(state),
      timeline: state.timeline,
      error,
      runControls,
    };
  }

  if (state.worker.phase === "idle" || state.worker.phase === "initializing") {
    return {
      status: "starting",
      statusText: "Starting authoritative simulation",
      statusRole: "status",
      workerPhase: state.worker.phase,
      playing: state.controls.playing,
      speed: state.controls.speed,
      canTogglePlayback: false,
      canChangeSpeed: false,
      simulationTimeLabel: simulationTimeLabel(state),
      timeline: state.timeline,
      error: null,
      runControls,
    };
  }

  if (state.worker.phase === "pending") {
    return {
      status: "pending",
      statusText: state.controls.playing
        ? "Simulation running"
        : "Simulation request pending",
      statusRole: "status",
      workerPhase: state.worker.phase,
      playing: state.controls.playing,
      speed: state.controls.speed,
      // A running simulation may always be paused while an authoritative
      // request is in flight. Starting new playback remains blocked.
      canTogglePlayback: state.controls.playing,
      // Speed is scheduler presentation state and can safely change while the
      // current authoritative request completes.
      canChangeSpeed: true,
      simulationTimeLabel: simulationTimeLabel(state),
      timeline: state.timeline,
      error: null,
      runControls,
    };
  }

  return {
    status: "ready",
    statusText: state.controls.playing
      ? "Simulation running"
      : "Simulation ready",
    statusRole: "status",
    workerPhase: state.worker.phase,
    playing: state.controls.playing,
    speed: state.controls.speed,
    canTogglePlayback: true,
    canChangeSpeed: true,
    simulationTimeLabel: simulationTimeLabel(state),
    timeline: state.timeline,
    error: null,
    runControls,
  };
}

function projectRunControls(
  state: ExperimentRuntimeState | null,
  setupError: string | null,
): ExperimentRunControlsView {
  if (
    setupError !== null ||
    state === null ||
    state.worker.phase === "disposed"
  ) {
    return {
      seed: null,
      acceptedCommandCount: 0,
      canStep: false,
      canReset: false,
      canReplay: false,
      canSetSeed: false,
    };
  }

  const acceptedCommandCount = state.controls.acceptedCommands.length;
  const canReinitialize =
    state.worker.phase === "ready" || state.worker.phase === "error";
  const healthy =
    state.integrationError === null && state.worker.error === null;

  return {
    seed: state.controls.identity.seed,
    acceptedCommandCount,
    canStep:
      state.worker.phase === "ready" &&
      healthy &&
      !state.controls.playing,
    canReset: canReinitialize,
    canReplay: canReinitialize && acceptedCommandCount > 0,
    canSetSeed: canReinitialize,
  };
}

function simulationTimeLabel(
  state: ExperimentRuntimeState | null,
): string {
  const hours = state?.snapshot?.checkpoint.simulationTimeHours;
  if (hours === undefined) return "Simulation time —";
  return `Simulation time ${hours.toFixed(2)} h`;
}
