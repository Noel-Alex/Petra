import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ExperimentControlAction } from "../ui/experimentControls";
import {
  type ControlDispatchResult,
  ExperimentRuntime,
  type ExperimentRuntimeState,
} from "./experimentRuntime";
import {
  projectExperimentRuntimeView,
  type ExperimentRuntimeView,
} from "./runtimeView";

export const RUNTIME_PRESENTATION_INTERVAL_MS = 50;

export type ExperimentRuntimeFactory = () => ExperimentRuntime;

export interface ExperimentRuntimeBinding {
  readonly state: ExperimentRuntimeState | null;
  readonly view: ExperimentRuntimeView;
  dispatch(action: ExperimentControlAction): ControlDispatchResult | null;
}

/**
 * React lifecycle adapter over the framework-neutral ExperimentRuntime.
 *
 * The factory must return a fresh idle runtime for every effect lifetime.
 * This is intentional: React StrictMode may mount/cleanup/remount effects, and
 * a disposed WorkerSession must never be resurrected by a reused runtime.
 */
export function useExperimentRuntime(
  factory?: ExperimentRuntimeFactory,
): ExperimentRuntimeBinding {
  const runtimeRef = useRef<ExperimentRuntime | null>(null);
  const [state, setState] = useState<ExperimentRuntimeState | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);

  useEffect(() => {
    runtimeRef.current = null;
    setState(null);
    setSetupError(null);

    if (factory === undefined) return;

    let runtime: ExperimentRuntime | null = null;
    let unsubscribe: (() => void) | null = null;
    let scheduler: ReturnType<typeof globalThis.setInterval> | null = null;

    try {
      runtime = factory();

      if (runtime.state.worker.phase !== "idle") {
        throw new Error(
          "ExperimentRuntimeFactory must return a fresh idle runtime",
        );
      }

      runtimeRef.current = runtime;
      unsubscribe = runtime.subscribe((nextState) => {
        setState(nextState);
      });

      if (!runtime.start()) {
        throw new Error("ExperimentRuntime could not start from idle state");
      }

      // Wall-clock cadence is orchestration/presentation policy only.
      // Playback speed controls authoritative ticks requested per pulse.
      scheduler = globalThis.setInterval(() => {
        runtime?.advancePlayback();
      }, RUNTIME_PRESENTATION_INTERVAL_MS);
    } catch (error) {
      unsubscribe?.();
      unsubscribe = null;
      runtime?.dispose();
      if (runtimeRef.current === runtime) runtimeRef.current = null;
      setState(null);
      setSetupError(error instanceof Error ? error.message : String(error));
    }

    return () => {
      if (scheduler !== null) {
        globalThis.clearInterval(scheduler);
      }
      // Unsubscribe before dispose because disposal publishes a final worker
      // state synchronously.
      unsubscribe?.();
      runtime?.dispose();
      if (runtimeRef.current === runtime) runtimeRef.current = null;
    };
  }, [factory]);

  const dispatch = useCallback(
    (action: ExperimentControlAction): ControlDispatchResult | null => {
      return runtimeRef.current?.dispatch(action) ?? null;
    },
    [],
  );

  const view = useMemo(
    () => projectExperimentRuntimeView(state, setupError),
    [setupError, state],
  );

  return { state, view, dispatch };
}
