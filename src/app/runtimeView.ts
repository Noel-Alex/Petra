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

export interface ExperimentRuntimeView {
  readonly status: RuntimeUiStatus;
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
}

/**
 * Presentation-only projection of framework-neutral runtime state.
 * No missing scientific values are inferred or filled here.
 */
export function projectExperimentRuntimeView(
  state: ExperimentRuntimeState | null,
  setupError: string | null = null,
): ExperimentRuntimeView {
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
    };
  }

  if (state.worker.phase === "pending") {
    return {
      status: "pending",
      statusText: state.controls.playing
        ? "Simulation advancing"
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
  };
}

function simulationTimeLabel(
  state: ExperimentRuntimeState | null,
): string {
  const hours = state?.snapshot?.checkpoint.simulationTimeHours;
  if (hours === undefined) return "Simulation time —";
  return `Simulation time ${hours.toFixed(2)} h`;
}
