import {
  buildFlagshipComposedRunPlan,
  type FlagshipRunInitialization,
} from "../sim/flagshipComposition";
import {
  createMechanisticRunConditionExecutionDefinition,
  createSweepRunConditionForConfig,
  type MechanisticRunConditionExecutionDefinition,
} from "./executionDefinition";
import type { SweepRunCondition } from "./sweep";

export type FlagshipSweepInitialization = Omit<
  FlagshipRunInitialization,
  "seed"
>;

/**
 * Projects explicit flagship run-state inputs through the same composition
 * authority used by product execution, then derives the exact ML run-condition
 * identity from the resulting initial resource/lineage fields.
 *
 * Seed is deliberately absent from this adapter so stochastic replicas of one
 * initial condition remain in the same held-out group.
 */
export function createFlagshipRunConditionExecutionDefinition(
  conditionId: string,
  initialization: FlagshipSweepInitialization,
): MechanisticRunConditionExecutionDefinition {
  const plan = buildFlagshipComposedRunPlan({
    ...initialization,
    seed: 0,
  });
  return createMechanisticRunConditionExecutionDefinition(
    conditionId,
    plan.config,
  );
}

export function createFlagshipSweepRunCondition(
  conditionId: string,
  initialization: FlagshipSweepInitialization,
): SweepRunCondition {
  const plan = buildFlagshipComposedRunPlan({
    ...initialization,
    seed: 0,
  });
  return createSweepRunConditionForConfig(conditionId, plan.config);
}
