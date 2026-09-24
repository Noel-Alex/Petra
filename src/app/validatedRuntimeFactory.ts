import type { ExperimentRuntime } from "./experimentRuntime";
import { PetraRuntimeError } from "./runtimeRecovery";
import type { ExperimentRuntimeFactory } from "./useExperimentRuntime";

export type RuntimePreflightValidator = () => void;

/**
 * Ensures scenario/preset/model validation completes before any runtime or
 * WorkerSession is constructed. A failing preflight therefore cannot leave
 * partially initialized scientific authority behind.
 */
export function createPrevalidatedExperimentRuntimeFactory(
  validate: RuntimePreflightValidator,
  createRuntime: () => ExperimentRuntime,
): ExperimentRuntimeFactory {
  return () => {
    try {
      validate();
    } catch (error) {
      throw new PetraRuntimeError(
        "preset",
        "setup",
        diagnosticMessage(error),
      );
    }

    return createRuntime();
  };
}

function diagnosticMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Experiment preset preflight validation failed";
}
