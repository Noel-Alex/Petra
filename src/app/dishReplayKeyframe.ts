import {
  validateRenderSnapshot,
  type DishRenderSnapshot,
} from "../render/model";
import {
  DISH_REPLAY_ORDER_VERSION,
  validateDishReplayOrder,
  type AuthoritativeDishReplayKeyframe,
} from "../render/replayIdentity";
import type { SimulationSnapshot } from "../sim/protocol";
import type { ExperimentRuntimeState } from "./experimentRuntime";

export interface CreateAuthoritativeDishReplayKeyframeArgs {
  readonly runBranchIdentity: string;
  readonly simulationSnapshot: SimulationSnapshot;
  readonly dishSnapshot: DishRenderSnapshot;
}

export interface CreateRuntimeDishReplayKeyframeArgs {
  readonly runtimeState: ExperimentRuntimeState;
  readonly dishSnapshot: DishRenderSnapshot;
}

/**
 * Bind a dish projection to the exact snapshot + history generation currently
 * owned by ExperimentRuntime. Callers cannot substitute a parallel branch id.
 */
export function createRuntimeDishReplayKeyframe(
  args: CreateRuntimeDishReplayKeyframeArgs,
): AuthoritativeDishReplayKeyframe {
  const simulationSnapshot = args.runtimeState.snapshot;
  if (simulationSnapshot === null) {
    throw new Error(
      "runtime dish replay keyframe requires an authoritative runtime snapshot",
    );
  }

  const keyframe = createAuthoritativeDishReplayKeyframe({
    runBranchIdentity: args.runtimeState.runBranchIdentity,
    simulationSnapshot,
    dishSnapshot: args.dishSnapshot,
  });

  validateComposedRuntimeDishProjectionIdentity(
    simulationSnapshot,
    args.runtimeState.runBranchIdentity,
    args.dishSnapshot,
  );

  return keyframe;
}

function validateComposedRuntimeDishProjectionIdentity(
  simulationSnapshot: SimulationSnapshot,
  runBranchIdentity: string,
  dishSnapshot: DishRenderSnapshot,
): void {
  if (simulationSnapshot.checkpoint.authority !== "composed") return;

  const expectedSnapshotId = `composed-trace:${simulationSnapshot.traceHash}`;
  if (dishSnapshot.snapshotId !== expectedSnapshotId) {
    throw new Error(
      "runtime composed dish replay keyframe trace identity does not match the accepted simulation snapshot",
    );
  }

  const expectedSamplingIdentity = `runtime-branch:${runBranchIdentity}`;
  if (dishSnapshot.samplingIdentity !== expectedSamplingIdentity) {
    throw new Error(
      "runtime composed dish replay keyframe sampling identity does not match the runtime branch",
    );
  }
}

/**
 * Bind an already-authoritative dish projection to the runtime position that
 * produced it.
 *
 * The app layer is the narrow bridge because it can see both worker/runtime
 * authority and renderer input. It may bind identities; it may not derive
 * biological values from Pixi or change supplied biological time.
 */
export function createAuthoritativeDishReplayKeyframe(
  args: CreateAuthoritativeDishReplayKeyframeArgs,
): AuthoritativeDishReplayKeyframe {
  validateRenderSnapshot(args.dishSnapshot);

  const order = {
    version: DISH_REPLAY_ORDER_VERSION,
    runBranchIdentity: args.runBranchIdentity,
    acceptedCommandCount: args.simulationSnapshot.checkpoint.commandCount,
  } as const;

  validateDishReplayOrder(order);

  if (
    args.dishSnapshot.simulationTimeHours !==
    args.simulationSnapshot.checkpoint.simulationTimeHours
  ) {
    throw new RangeError(
      "dish replay keyframe biological time must exactly match runtime checkpoint time",
    );
  }

  return Object.freeze({
    order: Object.freeze(order),
    snapshot: args.dishSnapshot,
  });
}
