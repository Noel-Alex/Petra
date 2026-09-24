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

export interface CreateAuthoritativeDishReplayKeyframeArgs {
  readonly runBranchIdentity: string;
  readonly simulationSnapshot: SimulationSnapshot;
  readonly dishSnapshot: DishRenderSnapshot;
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
