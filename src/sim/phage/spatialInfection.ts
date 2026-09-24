import {
  discretePopulationConfigurationIdentity,
  planDiscreteHostRemoval,
  validateDiscretePopulationAuthorityState,
  type DiscreteHostRemovalPlan,
  type DiscretePopulationAuthorityConfig,
  type DiscretePopulationAuthorityState,
} from "../populationAuthority";
import {
  SINGLE_HIT_UNIQUE_HOST_POLICY,
  phageProductiveInfectionPolicyIdentity,
  type PhageProductiveInfectionPolicy,
} from "./infectionPolicy";
import {
  POPULATION_BACKED_INFECTION_PLAN_SCHEMA_VERSION,
  type PopulationBackedInfectionPlan,
} from "./populationInfection";
import {
  scheduleLatentInfections,
  validateLatentInfectionQueue,
  type LatentInfectionQueueState,
} from "./latentQueue";
import {
  validatePhageLifeHistoryIdentity,
  type PhageLifeHistoryIdentity,
  type PhageLifeHistoryResolution,
} from "./lifeHistory";
import {
  applyPhageLysisTransaction,
  validatePhageLysisTransactionState,
  type PhageLysisTransactionResult,
  type PhageLysisTransactionState,
} from "./lysisTransaction";
import type { PhageBurstPolicy } from "./burstPolicy";

export const PHAGE_SPATIAL_INFECTION_SCHEMA_VERSION = 1 as const;
export const PHAGE_LOCAL_RELEASE_POLICY_SCHEMA_VERSION = 1 as const;
export const PHAGE_LOCAL_RELEASE_POLICY_ID =
  "petra-phage-spatial-release/local-cell-v1" as const;

export interface PhageLocalReleasePolicy {
  readonly schemaVersion: typeof PHAGE_LOCAL_RELEASE_POLICY_SCHEMA_VERSION;
  readonly id: typeof PHAGE_LOCAL_RELEASE_POLICY_ID;
  readonly evidenceClass: "mechanistic-approximation";
  readonly releaseRule: "release-at-infected-host-cell";
}

export const LOCAL_LYSIS_RELEASE_POLICY: PhageLocalReleasePolicy = Object.freeze({
  schemaVersion: PHAGE_LOCAL_RELEASE_POLICY_SCHEMA_VERSION,
  id: PHAGE_LOCAL_RELEASE_POLICY_ID,
  evidenceClass: "mechanistic-approximation",
  releaseRule: "release-at-infected-host-cell",
});

export interface SpatialLatentCohortTarget {
  readonly sequence: number;
  readonly lineageId: string;
  readonly lineageIndex: number;
  readonly cellIndex: number;
  readonly infectionCount: number;
}

export interface PhageSpatialInfectionState {
  readonly schemaVersion: typeof PHAGE_SPATIAL_INFECTION_SCHEMA_VERSION;
  readonly populationConfigurationIdentity: string;
  readonly infectionPolicyIdentity: string;
  readonly releasePolicyIdentity: string;
  readonly width: number;
  readonly height: number;
  readonly lineageIds: readonly string[];
  readonly infectedHostCounts: readonly ArrayLike<number>[];
  readonly cohortTargets: readonly SpatialLatentCohortTarget[];
}

export interface SpatialInfectionCommitResult {
  readonly state: PhageSpatialInfectionState;
  readonly lysisTransactionState: PhageLysisTransactionState;
  readonly scheduledCohortSequences: readonly number[];
}

export interface SpatialPhageLysisCommitResult {
  readonly state: PhageSpatialInfectionState;
  readonly lysisTransaction: PhageLysisTransactionResult;
  readonly populationRemoval: DiscreteHostRemovalPlan;
  /**
   * Per-cell discrete progeny PFU delta under LOCAL_LYSIS_RELEASE_POLICY.
   * This is a commit plan for future spatial free-PFU authority, not transport.
   */
  readonly releasedPfuByCell: readonly number[];
  readonly releasePolicyIdentity: string;
}

export function phageLocalReleasePolicyIdentity(
  policy: PhageLocalReleasePolicy = LOCAL_LYSIS_RELEASE_POLICY,
): string {
  validateReleasePolicy(policy);
  return JSON.stringify({
    schemaVersion: policy.schemaVersion,
    id: policy.id,
    evidenceClass: policy.evidenceClass,
    releaseRule: policy.releaseRule,
  });
}

export function createPhageSpatialInfectionState(
  config: DiscretePopulationAuthorityConfig,
  infectionPolicy: PhageProductiveInfectionPolicy =
    SINGLE_HIT_UNIQUE_HOST_POLICY,
  releasePolicy: PhageLocalReleasePolicy = LOCAL_LYSIS_RELEASE_POLICY,
): PhageSpatialInfectionState {
  const populationConfigurationIdentity =
    discretePopulationConfigurationIdentity(config);
  const infectionPolicyIdentity =
    phageProductiveInfectionPolicyIdentity(infectionPolicy);
  const releasePolicyIdentity = phageLocalReleasePolicyIdentity(releasePolicy);
  const cellCount = config.width * config.height;

  return {
    schemaVersion: PHAGE_SPATIAL_INFECTION_SCHEMA_VERSION,
    populationConfigurationIdentity,
    infectionPolicyIdentity,
    releasePolicyIdentity,
    width: config.width,
    height: config.height,
    lineageIds: [...config.lineageIds],
    infectedHostCounts: config.lineageIds.map(() =>
      Array.from({ length: cellCount }, () => 0),
    ),
    cohortTargets: [],
  };
}

export function validatePhageSpatialInfectionState(
  state: PhageSpatialInfectionState,
  populationState: DiscretePopulationAuthorityState,
  config: DiscretePopulationAuthorityConfig,
  infectionPolicy: PhageProductiveInfectionPolicy =
    SINGLE_HIT_UNIQUE_HOST_POLICY,
  releasePolicy: PhageLocalReleasePolicy = LOCAL_LYSIS_RELEASE_POLICY,
): void {
  validateDiscretePopulationAuthorityState(populationState, config);
  if (!isRecord(state)) {
    throw new TypeError("phage spatial infection state must be an object");
  }
  if (state.schemaVersion !== PHAGE_SPATIAL_INFECTION_SCHEMA_VERSION) {
    throw new Error("unsupported phage spatial infection state schema version");
  }

  const expectedPopulationIdentity =
    discretePopulationConfigurationIdentity(config);
  if (state.populationConfigurationIdentity !== expectedPopulationIdentity) {
    throw new Error(
      "phage spatial infection population configuration identity mismatch",
    );
  }
  if (
    state.infectionPolicyIdentity !==
    phageProductiveInfectionPolicyIdentity(infectionPolicy)
  ) {
    throw new Error("phage spatial infection policy identity mismatch");
  }
  if (
    state.releasePolicyIdentity !==
    phageLocalReleasePolicyIdentity(releasePolicy)
  ) {
    throw new Error("phage spatial release policy identity mismatch");
  }
  if (state.width !== config.width || state.height !== config.height) {
    throw new Error("phage spatial infection dimensions mismatch");
  }
  if (!Array.isArray(state.lineageIds)) {
    throw new TypeError("phage spatial infection lineageIds must be an array");
  }
  if (
    state.lineageIds.length !== config.lineageIds.length ||
    state.lineageIds.some(
      (lineageId, index) => lineageId !== config.lineageIds[index],
    )
  ) {
    throw new Error("phage spatial infection lineage identity mismatch");
  }

  validateCountChannels(
    "phage spatial infected-host counts",
    state.infectedHostCounts,
    config,
  );
  if (!Array.isArray(state.cohortTargets)) {
    throw new TypeError("phage spatial cohortTargets must be an array");
  }

  const targetSums = zeroCountChannels(config);
  const seenSequences = new Set<number>();
  for (let index = 0; index < state.cohortTargets.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(state.cohortTargets, index)) {
      throw new TypeError("phage spatial cohortTargets must be dense");
    }
    const target = state.cohortTargets[index]!;
    if (!isRecord(target)) {
      throw new TypeError("phage spatial cohort target must be an object");
    }
    nonNegativeSafeInteger("phage spatial cohort sequence", target.sequence);
    if (seenSequences.has(target.sequence)) {
      throw new Error("phage spatial cohort sequence must be unique");
    }
    seenSequences.add(target.sequence);

    nonNegativeSafeInteger(
      "phage spatial cohort lineageIndex",
      target.lineageIndex,
    );
    if (target.lineageIndex >= config.lineageIds.length) {
      throw new RangeError("phage spatial cohort lineageIndex is out of range");
    }
    if (target.lineageId !== config.lineageIds[target.lineageIndex]) {
      throw new Error("phage spatial cohort lineage identity mismatch");
    }

    validateCellIndex("phage spatial cohort cellIndex", target.cellIndex, config);
    positiveSafeInteger(
      "phage spatial cohort infectionCount",
      target.infectionCount,
    );
    targetSums[target.lineageIndex]![target.cellIndex] = safeCountAdd(
      "phage spatial cohort occupancy",
      targetSums[target.lineageIndex]![target.cellIndex]!,
      target.infectionCount,
    );
  }

  for (let lineageIndex = 0; lineageIndex < config.lineageIds.length; lineageIndex += 1) {
    for (let cellIndex = 0; cellIndex < config.width * config.height; cellIndex += 1) {
      const infected = state.infectedHostCounts[lineageIndex]![cellIndex]!;
      if (infected !== targetSums[lineageIndex]![cellIndex]) {
        throw new Error(
          "phage spatial infected-host occupancy must equal pending cohort targets",
        );
      }
      const standing =
        populationState.standingHostCounts[lineageIndex]![cellIndex]!;
      if (infected > standing) {
        throw new RangeError(
          "phage spatial infected-host occupancy cannot exceed standing hosts",
        );
      }
    }
  }
}

export function commitPopulationBackedInfections(
  state: PhageSpatialInfectionState,
  lysisTransactionState: PhageLysisTransactionState,
  populationState: DiscretePopulationAuthorityState,
  config: DiscretePopulationAuthorityConfig,
  plan: PopulationBackedInfectionPlan,
  lifeHistoryIdentities: readonly PhageLifeHistoryIdentity[],
  infectionPolicy: PhageProductiveInfectionPolicy =
    SINGLE_HIT_UNIQUE_HOST_POLICY,
  releasePolicy: PhageLocalReleasePolicy = LOCAL_LYSIS_RELEASE_POLICY,
): SpatialInfectionCommitResult {
  validatePhageSpatialInfectionState(
    state,
    populationState,
    config,
    infectionPolicy,
    releasePolicy,
  );
  validatePhageLysisTransactionState(lysisTransactionState);
  validateSpatialCohortAlignment(state, lysisTransactionState.latentQueue);

  if (plan.schemaVersion !== POPULATION_BACKED_INFECTION_PLAN_SCHEMA_VERSION) {
    throw new Error("unsupported population-backed infection plan schema version");
  }
  if (
    plan.populationConfigurationIdentity !==
    state.populationConfigurationIdentity
  ) {
    throw new Error("population-backed infection plan configuration mismatch");
  }
  if (plan.populationRevision !== populationState.revision) {
    throw new Error("population-backed infection plan population revision is stale");
  }
  if (plan.infectionPolicyIdentity !== state.infectionPolicyIdentity) {
    throw new Error("population-backed infection plan policy identity mismatch");
  }
  if (!Array.isArray(lifeHistoryIdentities)) {
    throw new TypeError("lifeHistoryIdentities must be an array");
  }
  if (lifeHistoryIdentities.length !== plan.targets.length) {
    throw new Error(
      "lifeHistoryIdentities must align one-to-one with infection plan targets",
    );
  }

  const infectedHostCounts = cloneCountChannels(state.infectedHostCounts);
  const cohortTargets = [...state.cohortTargets];
  let latentQueue = lysisTransactionState.latentQueue;
  const scheduledCohortSequences: number[] = [];

  for (let index = 0; index < plan.targets.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(plan.targets, index)) {
      throw new TypeError("population-backed infection plan targets must be dense");
    }
    if (!Object.prototype.hasOwnProperty.call(lifeHistoryIdentities, index)) {
      throw new TypeError("lifeHistoryIdentities must be dense");
    }
    const target = plan.targets[index]!;
    const lifeHistoryIdentity = lifeHistoryIdentities[index]!;
    validatePhageLifeHistoryIdentity(lifeHistoryIdentity);

    validateCellIndex("infection plan target cellIndex", target.cellIndex, config);
    if (
      target.lineageIndex < 0 ||
      !Number.isSafeInteger(target.lineageIndex) ||
      target.lineageIndex >= config.lineageIds.length ||
      target.lineageId !== config.lineageIds[target.lineageIndex]
    ) {
      throw new Error("infection plan target lineage identity mismatch");
    }

    const currentInfected =
      infectedHostCounts[target.lineageIndex]![target.cellIndex]!;
    const currentStanding =
      populationState.standingHostCounts[target.lineageIndex]![target.cellIndex]!;
    if (target.infectedHostsBefore !== currentInfected) {
      throw new Error("infection plan infected-host occupancy is stale");
    }
    if (target.standingHosts !== currentStanding) {
      throw new Error("infection plan standing-host count is stale");
    }
    if (
      target.infectedHostsAfter !==
      safeCountAdd(
        "infection plan infected hosts after",
        target.infectedHostsBefore,
        target.productiveInfections,
      )
    ) {
      throw new Error("infection plan infected-host result is inconsistent");
    }
    if (target.infectedHostsAfter > currentStanding) {
      throw new RangeError("infection plan cannot exceed standing host authority");
    }

    infectedHostCounts[target.lineageIndex]![target.cellIndex] =
      target.infectedHostsAfter;

    if (target.productiveInfections === 0) continue;

    const sequence = latentQueue.nextSequence;
    latentQueue = scheduleLatentInfections(latentQueue, {
      infectionCount: target.productiveInfections,
      infectedAtMinutes: latentQueue.currentTimeMinutes,
      lifeHistoryIdentity,
    });
    cohortTargets.push({
      sequence,
      lineageId: target.lineageId,
      lineageIndex: target.lineageIndex,
      cellIndex: target.cellIndex,
      infectionCount: target.productiveInfections,
    });
    scheduledCohortSequences.push(sequence);
  }

  const nextState: PhageSpatialInfectionState = {
    ...state,
    infectedHostCounts,
    cohortTargets,
  };
  const nextLysisTransactionState: PhageLysisTransactionState = {
    ...lysisTransactionState,
    latentQueue,
  };

  validatePhageSpatialInfectionState(
    nextState,
    populationState,
    config,
    infectionPolicy,
    releasePolicy,
  );
  validateSpatialCohortAlignment(nextState, nextLysisTransactionState.latentQueue);

  return {
    state: nextState,
    lysisTransactionState: nextLysisTransactionState,
    scheduledCohortSequences,
  };
}

export function commitSpatialPhageLysis(
  burstPolicy: PhageBurstPolicy,
  state: PhageSpatialInfectionState,
  lysisTransactionState: PhageLysisTransactionState,
  populationState: DiscretePopulationAuthorityState,
  config: DiscretePopulationAuthorityConfig,
  args: {
    readonly throughMinutes: number;
    readonly lifeHistories: readonly PhageLifeHistoryResolution[];
  },
  infectionPolicy: PhageProductiveInfectionPolicy =
    SINGLE_HIT_UNIQUE_HOST_POLICY,
  releasePolicy: PhageLocalReleasePolicy = LOCAL_LYSIS_RELEASE_POLICY,
): SpatialPhageLysisCommitResult {
  validatePhageSpatialInfectionState(
    state,
    populationState,
    config,
    infectionPolicy,
    releasePolicy,
  );
  validatePhageLysisTransactionState(lysisTransactionState);
  validateSpatialCohortAlignment(state, lysisTransactionState.latentQueue);

  const lysisTransaction = applyPhageLysisTransaction(
    burstPolicy,
    lysisTransactionState,
    args,
  );

  const removals = zeroCountChannels(config);
  const infectedHostCounts = cloneCountChannels(state.infectedHostCounts);
  const releasedPfuByCell = Array.from(
    { length: config.width * config.height },
    () => 0,
  );
  const maturedSequences = new Set<number>();

  if (
    lysisTransaction.maturedCohortSequences.length !==
    lysisTransaction.lyses.length
  ) {
    throw new Error("phage lysis cohort/result cardinality mismatch");
  }

  for (let index = 0; index < lysisTransaction.lyses.length; index += 1) {
    const sequence = lysisTransaction.maturedCohortSequences[index]!;
    const lysis = lysisTransaction.lyses[index]!;
    const target = state.cohortTargets.find(
      (candidate) => candidate.sequence === sequence,
    );
    if (target === undefined) {
      throw new Error("matured phage cohort has no spatial target");
    }
    if (maturedSequences.has(sequence)) {
      throw new Error("matured phage cohort sequence was committed twice");
    }
    maturedSequences.add(sequence);

    if (lysis.burst.lysedInfections !== target.infectionCount) {
      throw new Error("spatial phage lysis count does not match cohort target");
    }
    removals[target.lineageIndex]![target.cellIndex] = safeCountAdd(
      "spatial phage host removals",
      removals[target.lineageIndex]![target.cellIndex]!,
      target.infectionCount,
    );
    const nextInfected =
      infectedHostCounts[target.lineageIndex]![target.cellIndex]! -
      target.infectionCount;
    nonNegativeSafeInteger(
      "spatial phage infected hosts after lysis",
      nextInfected,
    );
    infectedHostCounts[target.lineageIndex]![target.cellIndex] = nextInfected;

    releasedPfuByCell[target.cellIndex] = safeCountAdd(
      "spatial phage local progeny release",
      releasedPfuByCell[target.cellIndex]!,
      lysis.burst.releasedPfu,
    );
  }

  const populationRemoval = planDiscreteHostRemoval(
    populationState,
    config,
    removals,
  );
  if (
    populationRemoval.totalRemovedHosts !==
    lysisTransaction.hostDecrementCount
  ) {
    throw new Error(
      "spatial phage host removal must equal lysis transaction decrement",
    );
  }
  if (sumSafeCounts("spatial phage released PFU", releasedPfuByCell) !== lysisTransaction.releasedPfu) {
    throw new Error("spatial phage release delta must equal lysis transaction release");
  }

  const nextState: PhageSpatialInfectionState = {
    ...state,
    infectedHostCounts,
    cohortTargets: state.cohortTargets.filter(
      (target) => !maturedSequences.has(target.sequence),
    ),
  };

  validatePhageSpatialInfectionState(
    nextState,
    populationRemoval.state,
    config,
    infectionPolicy,
    releasePolicy,
  );
  validateSpatialCohortAlignment(
    nextState,
    lysisTransaction.state.latentQueue,
  );

  return {
    state: nextState,
    lysisTransaction,
    populationRemoval,
    releasedPfuByCell,
    releasePolicyIdentity: state.releasePolicyIdentity,
  };
}

function validateSpatialCohortAlignment(
  state: PhageSpatialInfectionState,
  latentQueue: LatentInfectionQueueState,
): void {
  validateLatentInfectionQueue(latentQueue);
  if (state.cohortTargets.length !== latentQueue.cohorts.length) {
    throw new Error(
      "phage spatial cohort targets must align one-to-one with latent queue",
    );
  }

  for (let index = 0; index < latentQueue.cohorts.length; index += 1) {
    const cohort = latentQueue.cohorts[index]!;
    const target = state.cohortTargets.find(
      (candidate) => candidate.sequence === cohort.sequence,
    );
    if (target === undefined) {
      throw new Error("latent phage cohort has no spatial target");
    }
    if (target.infectionCount !== cohort.infectionCount) {
      throw new Error("latent phage cohort count does not match spatial target");
    }
  }
}

function validateReleasePolicy(policy: PhageLocalReleasePolicy): void {
  if (!isRecord(policy)) {
    throw new TypeError("phage local release policy must be an object");
  }
  if (policy.schemaVersion !== PHAGE_LOCAL_RELEASE_POLICY_SCHEMA_VERSION) {
    throw new Error("unsupported phage local release policy schema version");
  }
  if (policy.id !== PHAGE_LOCAL_RELEASE_POLICY_ID) {
    throw new Error("unsupported phage local release policy id");
  }
  if (policy.evidenceClass !== "mechanistic-approximation") {
    throw new Error(
      "phage local release policy must remain a mechanistic approximation",
    );
  }
  if (policy.releaseRule !== "release-at-infected-host-cell") {
    throw new Error("unsupported phage local release rule");
  }
}

function validateCountChannels(
  name: string,
  channels: readonly ArrayLike<number>[],
  config: DiscretePopulationAuthorityConfig,
): void {
  if (!Array.isArray(channels) || channels.length !== config.lineageIds.length) {
    throw new Error(name + " must align with lineage identity");
  }
  const cellCount = config.width * config.height;
  for (let lineageIndex = 0; lineageIndex < channels.length; lineageIndex += 1) {
    if (!Object.prototype.hasOwnProperty.call(channels, lineageIndex)) {
      throw new TypeError(name + " must be dense");
    }
    const channel = channels[lineageIndex]!;
    if (
      channel === null ||
      typeof channel !== "object" ||
      channel.length !== cellCount
    ) {
      throw new Error(name + " channel length mismatch");
    }
    for (let cellIndex = 0; cellIndex < cellCount; cellIndex += 1) {
      const value = channel[cellIndex]!;
      nonNegativeSafeInteger(name + " value", value);
      if (config.mask[cellIndex] === 0 && value !== 0) {
        throw new Error(name + " must be zero outside the population mask");
      }
    }
  }
}

function validateCellIndex(
  name: string,
  cellIndex: number,
  config: DiscretePopulationAuthorityConfig,
): void {
  nonNegativeSafeInteger(name, cellIndex);
  const cellCount = config.width * config.height;
  if (cellIndex >= cellCount) {
    throw new RangeError(name + " must lie within the authoritative grid");
  }
  if (config.mask[cellIndex] !== 1) {
    throw new Error(name + " must lie inside the population mask");
  }
}

function zeroCountChannels(
  config: DiscretePopulationAuthorityConfig,
): number[][] {
  const cellCount = config.width * config.height;
  return config.lineageIds.map(() =>
    Array.from({ length: cellCount }, () => 0),
  );
}

function cloneCountChannels(
  channels: readonly ArrayLike<number>[],
): number[][] {
  return channels.map((channel) => Array.from(channel));
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
    throw new RangeError(name + " exceeds the safe integer count range");
  }
  return value;
}

function nonNegativeSafeInteger(name: string, value: unknown): void {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(name + " must be a non-negative safe integer");
  }
}

function positiveSafeInteger(name: string, value: unknown): void {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(name + " must be a positive safe integer");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
