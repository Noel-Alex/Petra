import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { RunIdentity } from "../sim/protocol";
import type { ExperimentControlAction } from "../ui/experimentControls";
import {
  type ControlDispatchResult,
  ExperimentRuntime,
  type ExperimentRuntimeState,
} from "./experimentRuntime";
import {
  normalizeRuntimeFailure,
  PetraRuntimeError,
  type RuntimeFailure,
} from "./runtimeRecovery";
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
  /**
   * Explicitly construct a fresh runtime after failure. When a failed runtime
   * already established run identity, recovery refuses a factory result that
   * changes that identity or seed.
   */
  restart(): boolean;
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
  const restartIdentityRef = useRef<RunIdentity | null>(null);
  const [restartGeneration, setRestartGeneration] = useState(0);
  const [state, setState] = useState<ExperimentRuntimeState | null>(null);
  const [setupFailure, setSetupFailure] = useState<RuntimeFailure | null>(null);

  useEffect(() => {
    runtimeRef.current = null;
    setState(null);
    setSetupFailure(null);

    if (factory === undefined) return;

    let runtime: ExperimentRuntime | null = null;
    let unsubscribe: (() => void) | null = null;
    let scheduler: ReturnType<typeof globalThis.setInterval> | null = null;

    try {
      runtime = factory();

      if (runtime.state.worker.phase !== "idle") {
        throw new PetraRuntimeError(
          "runtime",
          "setup",
          "ExperimentRuntimeFactory must return a fresh idle runtime",
        );
      }

      const expectedRecoveryIdentity = restartIdentityRef.current;
      if (
        expectedRecoveryIdentity !== null &&
        !sameRunIdentity(
          expectedRecoveryIdentity,
          runtime.state.controls.identity,
        )
      ) {
        throw new PetraRuntimeError(
          "runtime",
          "setup",
          "Explicit runtime retry attempted to change the active run identity or seed",
        );
      }

      restartIdentityRef.current = null;
      runtimeRef.current = runtime;
      unsubscribe = runtime.subscribe((nextState) => {
        setState(nextState);
      });

      if (!runtime.start()) {
        throw new PetraRuntimeError(
          "runtime",
          "setup",
          "ExperimentRuntime could not start from idle state",
        );
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
      setSetupFailure(normalizeRuntimeFailure(error, "setup"));
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
  }, [factory, restartGeneration]);

  const dispatch = useCallback(
    (action: ExperimentControlAction): ControlDispatchResult | null => {
      return runtimeRef.current?.dispatch(action) ?? null;
    },
    [],
  );

  const restart = useCallback((): boolean => {
    if (factory === undefined) return false;

    const identity = runtimeRef.current?.state.controls.identity;
    restartIdentityRef.current =
      identity === undefined ? null : structuredClone(identity);
    setRestartGeneration((generation) => generation + 1);
    return true;
  }, [factory]);

  const view = useMemo(
    () => projectExperimentRuntimeView(state, setupFailure),
    [setupFailure, state],
  );

  return { state, view, dispatch, restart };
}

function sameRunIdentity(left: RunIdentity, right: RunIdentity): boolean {
  return (
    left.engineVersion === right.engineVersion &&
    left.protocolVersion === right.protocolVersion &&
    left.scenarioId === right.scenarioId &&
    left.scenarioVersion === right.scenarioVersion &&
    left.parameterSetId === right.parameterSetId &&
    left.parameterSetVersion === right.parameterSetVersion &&
    left.seed === right.seed &&
    JSON.stringify(left.parameterSetBinding ?? null) ===
      JSON.stringify(right.parameterSetBinding ?? null)
  );
}
