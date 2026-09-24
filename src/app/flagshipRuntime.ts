import { ExperimentRuntime } from "./experimentRuntime";
import { buildDefaultFlagshipRun, type DefaultFlagshipRun } from "./flagshipRunPreset";
import {
  createSimulationWorkerSession,
  type WorkerSession,
} from "./workerSession";
import { createPrevalidatedExperimentRuntimeFactory } from "./validatedRuntimeFactory";
import type { ExperimentRuntimeFactory } from "./useExperimentRuntime";

export const DEFAULT_FLAGSHIP_COMMAND_ID_PREFIX = "flagship-command";

export type FlagshipWorkerSessionFactory = () => WorkerSession;

function createCommandIdFactory(): () => string {
  let sequence = 0;
  return () => {
    sequence += 1;
    return `${DEFAULT_FLAGSHIP_COMMAND_ID_PREFIX}-${sequence}`;
  };
}

function createRuntimeFromPreparedRun(
  prepared: DefaultFlagshipRun,
  createSession: FlagshipWorkerSessionFactory,
): ExperimentRuntime {
  const session = createSession();
  return new ExperimentRuntime(
    session,
    prepared.plan.identity,
    createCommandIdFactory(),
    prepared.plan.config,
  );
}

/**
 * Build the product-default authoritative runtime factory.
 *
 * Every invocation validates the repository-owned run preset and resolves the
 * exact composed plan before a browser WorkerSession exists. React may invoke
 * the returned factory repeatedly under StrictMode; every invocation receives a
 * fresh worker, runtime, and command-id sequence.
 */
export function createDefaultFlagshipRuntimeFactory(
  createSession: FlagshipWorkerSessionFactory = createSimulationWorkerSession,
): ExperimentRuntimeFactory {
  let prepared: DefaultFlagshipRun | null = null;

  return createPrevalidatedExperimentRuntimeFactory(
    () => {
      prepared = buildDefaultFlagshipRun();
    },
    () => {
      const run = prepared;
      prepared = null;
      if (run === null) {
        throw new Error("default flagship runtime preflight did not produce a run");
      }
      return createRuntimeFromPreparedRun(run, createSession);
    },
  );
}

export const defaultFlagshipRuntimeFactory =
  createDefaultFlagshipRuntimeFactory();
