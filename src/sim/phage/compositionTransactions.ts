import {
  type DiscreteHostRemovalPlan,
  type DiscretePopulationAuthorityConfig,
  type DiscretePopulationAuthorityState,
} from "../populationAuthority";
import {
  type PhageLifeHistoryIdentity,
  type PhageLifeHistoryResolution,
} from "./lifeHistory";
import {
  type PopulationBackedInfectionPlan,
} from "./populationInfection";
import {
  assemblePhageCompositionCheckpoint,
  validatePhageCompositionCheckpoint,
  type PhageCompositionCheckpoint,
  type PhageCompositionConfig,
} from "./compositionCheckpoint";
import {
  commitPopulationBackedInfections,
  commitSpatialPhageLysis,
} from "./spatialInfection";

export interface PhageCompositionInfectionCommitResult {
  readonly checkpoint: PhageCompositionCheckpoint;
  readonly consumedPfuByCell: readonly number[];
  readonly totalAdsorbedPfu: number;
  readonly totalProductiveInfections: number;
  readonly totalNonProductiveAdsorptions: number;
  readonly scheduledCohortSequences: readonly number[];
}

export interface PhageCompositionLysisCommitResult {
  readonly checkpoint: PhageCompositionCheckpoint;
  /**
   * The higher-level composed engine must subtract this exact continuous
   * biomass plan from ecology state in the same authoritative transaction.
   */
  readonly populationRemoval: DiscreteHostRemovalPlan;
  readonly releasedPfuByCell: readonly number[];
  readonly releasedPfu: number;
  readonly hostDecrementCount: number;
  readonly maturedCohortSequences: readonly number[];
}

/**
 * Atomically consume already-authoritative adsorption allocations and schedule
 * productive infections into the phage composition checkpoint.
 *
 * Target selection and adsorption sampling stay upstream. This function only
 * proves that the already-authoritative plan can be paid from the exact
 * per-cell free-PFU pool, then commits infected-host/latent bookkeeping and
 * aggregate free-PFU depletion as one validated immutable state transition.
 */
export function commitPopulationBackedInfectionsToPhageComposition(
  checkpoint: PhageCompositionCheckpoint,
  config: PhageCompositionConfig,
  populationState: DiscretePopulationAuthorityState,
  populationConfig: DiscretePopulationAuthorityConfig,
  plan: PopulationBackedInfectionPlan,
  args: {
    readonly infectedAtMinutes: number;
    readonly lifeHistoryIdentities: readonly PhageLifeHistoryIdentity[];
  },
): PhageCompositionInfectionCommitResult {
  validatePhageCompositionCheckpoint(
    checkpoint,
    config,
    populationConfig,
    populationState,
  );

  // Validate every population/occupancy/policy/life-history invariant before
  // computing a publishable next checkpoint. The underlying function is pure.
  const infection = commitPopulationBackedInfections(
    checkpoint.spatialInfectionState,
    checkpoint.lysisTransactionState,
    populationState,
    populationConfig,
    plan,
    args,
    config.productiveInfectionPolicy,
    config.localReleasePolicy,
  );

  const consumedPfuByCell = Array.from(
    { length: populationConfig.width * populationConfig.height },
    () => 0,
  );
  for (const target of plan.targets) {
    consumedPfuByCell[target.cellIndex] = safeCountAdd(
      "phage composition adsorbed PFU at cell",
      consumedPfuByCell[target.cellIndex]!,
      target.adsorbedPfu,
    );
  }

  const consumedTotal = sumSafeCounts(
    "phage composition consumed PFU",
    consumedPfuByCell,
  );
  if (consumedTotal !== plan.totalAdsorbedPfu) {
    throw new Error(
      "phage composition per-cell adsorption spend must equal plan total",
    );
  }

  const freePfuByCell = checkpoint.freePfuByCell.map((freePfu, cell) => {
    const consumed = consumedPfuByCell[cell]!;
    if (consumed > freePfu) {
      throw new RangeError(
        "phage composition adsorption cannot consume more free PFU than the target cell contains",
      );
    }
    return freePfu - consumed;
  });

  if (plan.totalAdsorbedPfu > infection.lysisTransactionState.freePfu) {
    throw new RangeError(
      "phage composition adsorption cannot consume more aggregate free PFU than exists",
    );
  }
  const lysisTransactionState = {
    ...infection.lysisTransactionState,
    freePfu:
      infection.lysisTransactionState.freePfu - plan.totalAdsorbedPfu,
  };

  const nextCheckpoint = assemblePhageCompositionCheckpoint(
    config,
    populationConfig,
    populationState,
    {
      freePfuByCell,
      spatialInfectionState: infection.state,
      lysisTransactionState,
    },
  );

  return {
    checkpoint: nextCheckpoint,
    consumedPfuByCell,
    totalAdsorbedPfu: plan.totalAdsorbedPfu,
    totalProductiveInfections: plan.totalProductiveInfections,
    totalNonProductiveAdsorptions: plan.totalNonProductiveAdsorptions,
    scheduledCohortSequences: [...infection.scheduledCohortSequences],
  };
}

/**
 * Atomically advance reviewed latent/burst/spatial-lysis bookkeeping and place
 * the exact released progeny into the composition's per-cell free-PFU state.
 *
 * This does not mutate continuous ecology biomass. The returned
 * populationRemoval is the explicit higher-level commit obligation; callers
 * must publish its modelBiomassToRemove against the same ecology transaction or
 * publish none of this result.
 */
export function commitPhageLysisToComposition(
  checkpoint: PhageCompositionCheckpoint,
  config: PhageCompositionConfig,
  populationState: DiscretePopulationAuthorityState,
  populationConfig: DiscretePopulationAuthorityConfig,
  args: {
    readonly throughMinutes: number;
    readonly lifeHistories: readonly PhageLifeHistoryResolution[];
  },
): PhageCompositionLysisCommitResult {
  validatePhageCompositionCheckpoint(
    checkpoint,
    config,
    populationConfig,
    populationState,
  );

  const committed = commitSpatialPhageLysis(
    config.burstPolicy,
    checkpoint.spatialInfectionState,
    checkpoint.lysisTransactionState,
    populationState,
    populationConfig,
    args,
    config.productiveInfectionPolicy,
    config.localReleasePolicy,
  );

  if (committed.releasedPfuByCell.length !== checkpoint.freePfuByCell.length) {
    throw new Error(
      "phage composition lysis release grid must match free-PFU grid",
    );
  }

  const freePfuByCell = checkpoint.freePfuByCell.map((freePfu, cell) =>
    safeCountAdd(
      "phage composition free PFU after local lysis release",
      freePfu,
      committed.releasedPfuByCell[cell]!,
    ),
  );

  const nextCheckpoint = assemblePhageCompositionCheckpoint(
    config,
    populationConfig,
    committed.populationRemoval.state,
    {
      freePfuByCell,
      spatialInfectionState: committed.state,
      lysisTransactionState: committed.lysisTransaction.state,
    },
  );

  return {
    checkpoint: nextCheckpoint,
    populationRemoval: committed.populationRemoval,
    releasedPfuByCell: Array.from(committed.releasedPfuByCell),
    releasedPfu: committed.lysisTransaction.releasedPfu,
    hostDecrementCount: committed.lysisTransaction.hostDecrementCount,
    maturedCohortSequences: [
      ...committed.lysisTransaction.maturedCohortSequences,
    ],
  };
}

function sumSafeCounts(name: string, values: readonly number[]): number {
  let total = 0;
  for (const value of values) {
    total = safeCountAdd(name, total, value);
  }
  return total;
}

function safeCountAdd(name: string, left: number, right: number): number {
  nonNegativeSafeInteger(name + " left operand", left);
  nonNegativeSafeInteger(name + " right operand", right);
  const value = left + right;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(name + " exceeds safe integer range");
  }
  return value;
}

function nonNegativeSafeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(name + " must be a non-negative safe integer");
  }
}
