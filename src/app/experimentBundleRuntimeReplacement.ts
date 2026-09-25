import {
  validateExperimentBundle,
  type ExperimentBundle,
} from "../sim/experimentBundle";
import {
  ExperimentRuntime,
  type ExperimentRuntimeReplayCommand,
} from "./experimentRuntime";
import type { ExperimentBundleReplacementPlan } from "./experimentBundleHandoff";
import type { ExperimentRuntimeFactory } from "./useExperimentRuntime";
import {
  createSimulationWorkerSession,
  type WorkerSession,
} from "./workerSession";

export const IMPORTED_BUNDLE_COMMAND_ID_PREFIX =
  "imported-bundle-command" as const;

export type ExperimentBundleWorkerSessionFactory = () => WorkerSession;

/**
 * Build a fresh-idle runtime factory from an explicitly confirmed experiment
 * bundle replacement plan.
 *
 * The canonical bundle is validated before any WorkerSession is constructed.
 * The returned runtime still starts through useExperimentRuntime's normal
 * lifecycle; its first start replays initialize -> exported origin checkpoint
 * restore -> exact exported command suffix through ExperimentRuntime itself.
 */
export function createExperimentBundleReplacementRuntimeFactory(
  plan: ExperimentBundleReplacementPlan,
  createSession: ExperimentBundleWorkerSessionFactory =
    createSimulationWorkerSession,
): ExperimentRuntimeFactory {
  if (plan.status !== "replace-run") {
    throw new TypeError(
      "experiment bundle runtime replacement requires a confirmed replace-run plan",
    );
  }

  const preparedBundle = structuredClone(plan.bundle);
  validateExperimentBundle(preparedBundle);

  return () => {
    const bundle = structuredClone(preparedBundle);
    validateExperimentBundle(bundle);

    const createCommandId = createImportedBundleCommandIdFactory(bundle);
    const session = createSession();
    try {
      return new ExperimentRuntime(
        session,
        structuredClone(bundle.identity),
        createCommandId,
        bundle.replay.composedConfig === null
          ? undefined
          : structuredClone(bundle.replay.composedConfig),
        {
          originCheckpoint: structuredClone(bundle.replay.originCheckpoint),
          commands: bundle.replay.commands.map(
            (command) =>
              structuredClone(command) as ExperimentRuntimeReplayCommand,
          ),
        },
      );
    } catch (error) {
      session.dispose();
      throw error;
    }
  };
}

function createImportedBundleCommandIdFactory(
  bundle: ExperimentBundle,
): () => string {
  const reserved = new Set(
    bundle.replay.commands.map((command) => command.id),
  );
  let sequence = 0;

  return () => {
    while (sequence < Number.MAX_SAFE_INTEGER) {
      sequence += 1;
      const candidate =
        `${IMPORTED_BUNDLE_COMMAND_ID_PREFIX}-${sequence}`;
      if (reserved.has(candidate)) continue;
      reserved.add(candidate);
      return candidate;
    }

    throw new RangeError(
      "imported experiment command id sequence exhausted safe integer range",
    );
  };
}
