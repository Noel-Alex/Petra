import {
  buildFlagshipComposedRunPlan,
  type FlagshipRunInitialization,
} from "../sim/flagshipComposition";
import {
  createMechanisticRunConditionExecutionDefinition,
  createSweepRunConditionForExecution,
  type MechanisticRunConditionExecutionDefinition,
} from "./executionDefinition";
import type { SweepRunCondition } from "./sweep";

export const FLAGSHIP_RUN_CONDITION_VERSION =
  "flagship-initial-state-v1" as const;

export type FlagshipSweepInitialization = Omit<
  FlagshipRunInitialization,
  "seed"
>;

/**
 * Exact, compact identity for the explicit run-state inputs of the bundled
 * flagship scenario. Seed is deliberately absent so stochastic replicas of
 * one biological condition remain in one held-out group.
 *
 * Validation delegates to the product-facing flagship composition authority.
 * The ordered inoculum array is preserved because accumulation order can be
 * replay-significant when multiple founders target one cell.
 */
export function createFlagshipRunConditionExecutionDefinition(
  conditionId: string,
  initialization: FlagshipSweepInitialization,
): MechanisticRunConditionExecutionDefinition {
  buildFlagshipComposedRunPlan({
    ...initialization,
    seed: 0,
  });

  const canonicalInitialization = JSON.stringify({
    initialResourceLevel: initialization.initialResourceLevel,
    inocula: initialization.inocula.map((inoculum) => ({
      lineageId: inoculum.lineageId,
      x: inoculum.x,
      y: inoculum.y,
      biomass: inoculum.biomass,
    })),
  });

  return createMechanisticRunConditionExecutionDefinition({
    conditionId,
    conditionVersion: FLAGSHIP_RUN_CONDITION_VERSION,
    identityParts: [canonicalInitialization],
  });
}

export function createFlagshipSweepRunCondition(
  conditionId: string,
  initialization: FlagshipSweepInitialization,
): SweepRunCondition {
  return createSweepRunConditionForExecution(
    createFlagshipRunConditionExecutionDefinition(conditionId, initialization),
  );
}
