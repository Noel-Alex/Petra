import type { SurfaceTransitionPlan } from "../ui/motion/semanticTransitions";

export type SourcesSurfacePhase = "closed" | "visible" | "exiting";

export interface SourcesSurfaceLifecycle {
  readonly requestedOpen: boolean;
  readonly mounted: boolean;
  readonly phase: SourcesSurfacePhase;
  /**
   * Monotonic presentation token. Exit completion may only unmount the
   * generation that scheduled it, so a rapid reopen cannot be defeated by a
   * stale timer.
   */
  readonly generation: number;
}

export function createSourcesSurfaceLifecycle(): SourcesSurfaceLifecycle {
  return {
    requestedOpen: false,
    mounted: false,
    phase: "closed",
    generation: 0,
  };
}

export function openSourcesSurface(
  state: SourcesSurfaceLifecycle,
): SourcesSurfaceLifecycle {
  return {
    requestedOpen: true,
    mounted: true,
    phase: "visible",
    generation: state.generation + 1,
  };
}

export function closeSourcesSurface(
  state: SourcesSurfaceLifecycle,
  hidePlan: Pick<
    SurfaceTransitionPlan,
    "keepMountedDuringExit" | "durationMs"
  >,
): SourcesSurfaceLifecycle {
  const generation = state.generation + 1;
  const keepMounted =
    state.mounted &&
    hidePlan.keepMountedDuringExit &&
    hidePlan.durationMs > 0;

  return keepMounted
    ? {
        requestedOpen: false,
        mounted: true,
        phase: "exiting",
        generation,
      }
    : {
        requestedOpen: false,
        mounted: false,
        phase: "closed",
        generation,
      };
}

export function completeSourcesExit(
  state: SourcesSurfaceLifecycle,
  generation: number,
): SourcesSurfaceLifecycle {
  if (state.phase !== "exiting" || state.generation !== generation) {
    return state;
  }

  return {
    requestedOpen: false,
    mounted: false,
    phase: "closed",
    generation: state.generation,
  };
}

/**
 * Returns the shared presentation wall-time needed before exit unmount.
 * null means no exit is pending; 0 means an existing exit should settle now
 * (for example after a Full → Reduced/Off preference change).
 */
export function sourcesExitDelayMs(
  state: SourcesSurfaceLifecycle,
  hidePlan: Pick<
    SurfaceTransitionPlan,
    "keepMountedDuringExit" | "durationMs"
  >,
): number | null {
  if (state.phase !== "exiting") return null;
  if (!hidePlan.keepMountedDuringExit || hidePlan.durationMs <= 0) return 0;
  return hidePlan.durationMs;
}
