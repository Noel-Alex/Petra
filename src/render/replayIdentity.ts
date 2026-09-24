import type { DishRenderSnapshot } from "./model";

export const DISH_REPLAY_ORDER_VERSION = "petra-dish-replay-order/1" as const;

export interface DishReplayOrder {
  readonly version: typeof DISH_REPLAY_ORDER_VERSION;
  /**
   * Explicit runtime-owned history scope. Reset/replay/restore branches that
   * start a fresh history must use a fresh identity rather than appending to an
   * older branch and asking the renderer to infer ancestry.
   */
  readonly runBranchIdentity: string;
  /**
   * Authoritative accepted mutating-command position from simulation runtime.
   * This is ordering identity only; it is not biological time.
   */
  readonly acceptedCommandCount: number;
}

export interface AuthoritativeDishReplayKeyframe {
  readonly order: DishReplayOrder;
  readonly snapshot: DishRenderSnapshot;
}

export function validateDishReplayOrder(order: DishReplayOrder): void {
  if (order.version !== DISH_REPLAY_ORDER_VERSION) {
    throw new RangeError(
      `unsupported dish replay order version: ${String(order.version)}`,
    );
  }

  if (
    order.runBranchIdentity.length === 0 ||
    order.runBranchIdentity.trim() !== order.runBranchIdentity
  ) {
    throw new TypeError(
      "runBranchIdentity must be a non-empty canonical string",
    );
  }

  if (
    !Number.isSafeInteger(order.acceptedCommandCount) ||
    order.acceptedCommandCount < 0
  ) {
    throw new RangeError(
      "acceptedCommandCount must be a non-negative safe integer",
    );
  }
}
