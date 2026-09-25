import {
  cellEquivalentCalibrationIdentity,
  discretePopulationConfigurationIdentity,
  validateDiscretePopulationAuthorityState,
  type DiscretePopulationAuthorityConfig,
  type DiscretePopulationAuthorityState,
} from "../populationAuthority";
import {
  samplingExecutionPolicyIdentity,
  validateSamplingExecutionPolicy,
  type SamplingExecutionPolicy,
} from "../samplingPolicy";
import {
  phageBurstPolicyIdentity,
  type PhageBurstPolicy,
} from "./burstPolicy";
import {
  phageProductiveInfectionPolicyIdentity,
  validatePhageProductiveInfectionPolicy,
  type PhageProductiveInfectionPolicy,
} from "./infectionPolicy";
import {
  createPhageLysisTransactionState,
  validatePhageLysisTransactionState,
  type PhageLysisTransactionState,
} from "./lysisTransaction";
import {
  createPhageSpatialInfectionState,
  phageLocalReleasePolicyIdentity,
  validatePhageSpatialInfectionState,
  type PhageLocalReleasePolicy,
  type PhageSpatialInfectionState,
} from "./spatialInfection";
import {
  cellEquivalentCalibrationFromPhageSpatialUnitBridge,
  phageSpatialUnitBridgeIdentity,
  validatePhageSpatialUnitBridge,
  type PhageSpatialUnitBridge,
} from "./unitBridge";

export const PHAGE_COMPOSITION_CONFIG_SCHEMA_VERSION = 1 as const;
export const PHAGE_COMPOSITION_CHECKPOINT_SCHEMA_VERSION = 1 as const;

export const PHAGE_LIVING_HOST_TRANSPORT_MODE =
  "disabled-out-of-domain" as const;
export const PHAGE_FREE_PHAGE_LOSS_MODE = "disabled-unbound" as const;

export interface PhageCompositionConfig {
  readonly schemaVersion: typeof PHAGE_COMPOSITION_CONFIG_SCHEMA_VERSION;
  readonly spatialUnitBridge: PhageSpatialUnitBridge;
  readonly adsorptionSamplingPolicy: SamplingExecutionPolicy;
  readonly productiveInfectionPolicy: PhageProductiveInfectionPolicy;
  readonly burstPolicy: PhageBurstPolicy;
  readonly localReleasePolicy: PhageLocalReleasePolicy;
  /**
   * No living-host physical transport coefficient is currently source-bound.
   * A later enabled mode requires a new versioned configuration contract.
   */
  readonly livingHostTransport: typeof PHAGE_LIVING_HOST_TRANSPORT_MODE;
  /**
   * No general free-phage loss/decay coefficient is currently source-bound.
   * A later enabled mode requires a new versioned configuration contract.
   */
  readonly freePhageLoss: typeof PHAGE_FREE_PHAGE_LOSS_MODE;
}

export interface PhageCompositionCheckpoint {
  readonly schemaVersion: typeof PHAGE_COMPOSITION_CHECKPOINT_SCHEMA_VERSION;
  readonly configurationIdentity: string;
  readonly populationConfigurationIdentity: string;
  readonly width: number;
  readonly height: number;
  /**
   * Exact copy of the population mask used by this checkpoint. The canonical
   * population configuration identity also binds the mask; carrying it here
   * makes spatial PFU admission self-contained and fail-closed.
   */
  readonly mask: readonly number[];
  readonly freePfuByCell: readonly number[];
  readonly spatialInfectionState: PhageSpatialInfectionState;
  readonly lysisTransactionState: PhageLysisTransactionState;
}

export function validatePhageCompositionConfig(
  config: PhageCompositionConfig,
  populationConfig: DiscretePopulationAuthorityConfig,
): void {
  if (!isRecord(config)) {
    throw new TypeError("phage composition config must be an object");
  }
  if (config.schemaVersion !== PHAGE_COMPOSITION_CONFIG_SCHEMA_VERSION) {
    throw new Error("unsupported phage composition config schema version");
  }

  validatePhageSpatialUnitBridge(config.spatialUnitBridge);
  validateSamplingExecutionPolicy(config.adsorptionSamplingPolicy);
  validatePhageProductiveInfectionPolicy(config.productiveInfectionPolicy);
  phageBurstPolicyIdentity(config.burstPolicy);
  phageLocalReleasePolicyIdentity(config.localReleasePolicy);

  if (config.livingHostTransport !== PHAGE_LIVING_HOST_TRANSPORT_MODE) {
    throw new Error(
      "phage living-host transport must remain disabled/out-of-domain in v1",
    );
  }
  if (config.freePhageLoss !== PHAGE_FREE_PHAGE_LOSS_MODE) {
    throw new Error("phage free-phage loss must remain disabled/unbound in v1");
  }

  const projectedCalibration =
    cellEquivalentCalibrationFromPhageSpatialUnitBridge(
      config.spatialUnitBridge,
    );
  if (
    cellEquivalentCalibrationIdentity(projectedCalibration) !==
    cellEquivalentCalibrationIdentity(populationConfig.calibration)
  ) {
    throw new Error(
      "phage spatial-unit calibration must exactly match shared population authority",
    );
  }

  // Also validates dimensions, binary mask, policy, and calibration.
  discretePopulationConfigurationIdentity(populationConfig);
}

export function phageCompositionConfigurationIdentity(
  config: PhageCompositionConfig,
  populationConfig: DiscretePopulationAuthorityConfig,
): string {
  validatePhageCompositionConfig(config, populationConfig);
  return JSON.stringify({
    schemaVersion: config.schemaVersion,
    populationConfigurationIdentity:
      discretePopulationConfigurationIdentity(populationConfig),
    populationCalibrationIdentity: cellEquivalentCalibrationIdentity(
      populationConfig.calibration,
    ),
    spatialUnitBridgeIdentity: phageSpatialUnitBridgeIdentity(
      config.spatialUnitBridge,
    ),
    adsorptionSamplingPolicyIdentity: samplingExecutionPolicyIdentity(
      config.adsorptionSamplingPolicy,
    ),
    productiveInfectionPolicyIdentity:
      phageProductiveInfectionPolicyIdentity(
        config.productiveInfectionPolicy,
      ),
    burstPolicyIdentity: phageBurstPolicyIdentity(config.burstPolicy),
    localReleasePolicyIdentity: phageLocalReleasePolicyIdentity(
      config.localReleasePolicy,
    ),
    livingHostTransport: config.livingHostTransport,
    freePhageLoss: config.freePhageLoss,
  });
}

export function createInitialPhageCompositionCheckpoint(
  config: PhageCompositionConfig,
  populationConfig: DiscretePopulationAuthorityConfig,
  populationState: DiscretePopulationAuthorityState,
  args: {
    readonly freePfuByCell?: readonly number[];
  } = {},
): PhageCompositionCheckpoint {
  validatePhageCompositionConfig(config, populationConfig);
  validateDiscretePopulationAuthorityState(
    populationState,
    populationConfig,
  );

  const freePfuByCell =
    args.freePfuByCell === undefined
      ? Array.from(
          { length: populationConfig.width * populationConfig.height },
          () => 0,
        )
      : Array.from(args.freePfuByCell);
  validateFreePfuByCell(freePfuByCell, populationConfig);
  const totalFreePfu = sumSafeCounts(
    "phage composition free PFU",
    freePfuByCell,
  );

  return assemblePhageCompositionCheckpoint(
    config,
    populationConfig,
    populationState,
    {
      freePfuByCell,
      spatialInfectionState: createPhageSpatialInfectionState(
        populationConfig,
        config.productiveInfectionPolicy,
        config.localReleasePolicy,
      ),
      lysisTransactionState: createPhageLysisTransactionState(
        config.burstPolicy,
        { freePfu: totalFreePfu },
      ),
    },
  );
}

/**
 * Assemble one detached phage checkpoint from already-authoritative mechanism
 * state. This is the future composed-engine atomic publication boundary: all
 * constituent pieces are validated together or no checkpoint is returned.
 */
export function assemblePhageCompositionCheckpoint(
  config: PhageCompositionConfig,
  populationConfig: DiscretePopulationAuthorityConfig,
  populationState: DiscretePopulationAuthorityState,
  state: {
    readonly freePfuByCell: readonly number[];
    readonly spatialInfectionState: PhageSpatialInfectionState;
    readonly lysisTransactionState: PhageLysisTransactionState;
  },
): PhageCompositionCheckpoint {
  validatePhageCompositionConfig(config, populationConfig);
  validateDiscretePopulationAuthorityState(
    populationState,
    populationConfig,
  );

  const checkpoint: PhageCompositionCheckpoint = {
    schemaVersion: PHAGE_COMPOSITION_CHECKPOINT_SCHEMA_VERSION,
    configurationIdentity: phageCompositionConfigurationIdentity(
      config,
      populationConfig,
    ),
    populationConfigurationIdentity:
      discretePopulationConfigurationIdentity(populationConfig),
    width: populationConfig.width,
    height: populationConfig.height,
    mask: Array.from(populationConfig.mask),
    freePfuByCell: Array.from(state.freePfuByCell),
    spatialInfectionState: cloneSpatialInfectionState(
      state.spatialInfectionState,
    ),
    lysisTransactionState: cloneLysisTransactionState(
      state.lysisTransactionState,
    ),
  };

  validatePhageCompositionCheckpoint(
    checkpoint,
    config,
    populationConfig,
    populationState,
  );
  return checkpoint;
}

export function validatePhageCompositionCheckpoint(
  checkpoint: PhageCompositionCheckpoint,
  config: PhageCompositionConfig,
  populationConfig: DiscretePopulationAuthorityConfig,
  populationState: DiscretePopulationAuthorityState,
): void {
  validatePhageCompositionConfig(config, populationConfig);
  validateDiscretePopulationAuthorityState(
    populationState,
    populationConfig,
  );
  if (!isRecord(checkpoint)) {
    throw new TypeError("phage composition checkpoint must be an object");
  }
  if (
    checkpoint.schemaVersion !== PHAGE_COMPOSITION_CHECKPOINT_SCHEMA_VERSION
  ) {
    throw new Error(
      "unsupported phage composition checkpoint schema version",
    );
  }

  const expectedConfigurationIdentity =
    phageCompositionConfigurationIdentity(config, populationConfig);
  if (checkpoint.configurationIdentity !== expectedConfigurationIdentity) {
    throw new Error("phage composition configuration identity mismatch");
  }

  const expectedPopulationIdentity =
    discretePopulationConfigurationIdentity(populationConfig);
  if (
    checkpoint.populationConfigurationIdentity !== expectedPopulationIdentity
  ) {
    throw new Error(
      "phage composition population configuration identity mismatch",
    );
  }
  if (
    checkpoint.width !== populationConfig.width ||
    checkpoint.height !== populationConfig.height
  ) {
    throw new Error("phage composition checkpoint dimensions mismatch");
  }
  validateCheckpointMask(checkpoint.mask, populationConfig.mask);

  validateFreePfuByCell(checkpoint.freePfuByCell, populationConfig);
  validatePhageLysisTransactionState(checkpoint.lysisTransactionState);
  if (
    checkpoint.lysisTransactionState.burstPolicyState.policyIdentity !==
    phageBurstPolicyIdentity(config.burstPolicy)
  ) {
    throw new Error("phage composition burst policy identity mismatch");
  }

  const totalFreePfu = sumSafeCounts(
    "phage composition free PFU",
    checkpoint.freePfuByCell,
  );
  if (checkpoint.lysisTransactionState.freePfu !== totalFreePfu) {
    throw new Error(
      "phage composition aggregate free PFU must equal spatial free-PFU sum",
    );
  }

  validatePhageSpatialInfectionState(
    checkpoint.spatialInfectionState,
    populationState,
    populationConfig,
    config.productiveInfectionPolicy,
    config.localReleasePolicy,
  );
  validateCohortAlignment(
    checkpoint.spatialInfectionState,
    checkpoint.lysisTransactionState,
  );
}

/**
 * Restore/promotion boundary for serialized phage state. Validation happens
 * before cloning so a stale or malformed checkpoint cannot be silently
 * re-stamped with the current configuration identity.
 */
export function restorePhageCompositionCheckpoint(
  serialized: PhageCompositionCheckpoint,
  config: PhageCompositionConfig,
  populationConfig: DiscretePopulationAuthorityConfig,
  populationState: DiscretePopulationAuthorityState,
): PhageCompositionCheckpoint {
  validatePhageCompositionCheckpoint(
    serialized,
    config,
    populationConfig,
    populationState,
  );

  return assemblePhageCompositionCheckpoint(
    config,
    populationConfig,
    populationState,
    {
      freePfuByCell: serialized.freePfuByCell,
      spatialInfectionState: serialized.spatialInfectionState,
      lysisTransactionState: serialized.lysisTransactionState,
    },
  );
}

function validateCheckpointMask(
  mask: readonly number[],
  expected: readonly number[],
): void {
  if (!Array.isArray(mask) || mask.length !== expected.length) {
    throw new Error("phage composition checkpoint mask length mismatch");
  }
  for (let index = 0; index < expected.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(mask, index)) {
      throw new TypeError("phage composition checkpoint mask must be dense");
    }
    if (mask[index] !== expected[index]) {
      throw new Error("phage composition checkpoint mask mismatch");
    }
  }
}

function validateFreePfuByCell(
  values: readonly number[],
  populationConfig: DiscretePopulationAuthorityConfig,
): void {
  const cellCount = populationConfig.width * populationConfig.height;
  if (!Array.isArray(values) || values.length !== cellCount) {
    throw new Error(
      "phage composition spatial free-PFU state must match grid dimensions",
    );
  }
  for (let cell = 0; cell < cellCount; cell += 1) {
    if (!Object.prototype.hasOwnProperty.call(values, cell)) {
      throw new TypeError(
        "phage composition spatial free-PFU state must be dense",
      );
    }
    nonNegativeSafeInteger(
      "phage composition free PFU by cell",
      values[cell],
    );
    if (populationConfig.mask[cell] === 0 && values[cell] !== 0) {
      throw new Error(
        "phage composition free PFU must remain zero outside population mask",
      );
    }
  }
}

function validateCohortAlignment(
  spatial: PhageSpatialInfectionState,
  lysis: PhageLysisTransactionState,
): void {
  const cohorts = lysis.latentQueue.cohorts;
  if (spatial.cohortTargets.length !== cohorts.length) {
    throw new Error(
      "phage composition spatial targets must align one-to-one with latent cohorts",
    );
  }

  const targetsBySequence = new Map(
    spatial.cohortTargets.map((target) => [target.sequence, target]),
  );
  for (const cohort of cohorts) {
    const target = targetsBySequence.get(cohort.sequence);
    if (target === undefined) {
      throw new Error(
        "phage composition latent cohort has no spatial target",
      );
    }
    if (target.infectionCount !== cohort.infectionCount) {
      throw new Error(
        "phage composition latent cohort count does not match spatial target",
      );
    }
  }
}

function cloneSpatialInfectionState(
  state: PhageSpatialInfectionState,
): PhageSpatialInfectionState {
  return {
    schemaVersion: state.schemaVersion,
    populationConfigurationIdentity: state.populationConfigurationIdentity,
    infectionPolicyIdentity: state.infectionPolicyIdentity,
    releasePolicyIdentity: state.releasePolicyIdentity,
    width: state.width,
    height: state.height,
    lineageIds: [...state.lineageIds],
    infectedHostCounts: state.infectedHostCounts.map((channel) =>
      Array.from(channel),
    ),
    cohortTargets: state.cohortTargets.map((target) => ({ ...target })),
  };
}

function cloneLysisTransactionState(
  state: PhageLysisTransactionState,
): PhageLysisTransactionState {
  return {
    schemaVersion: state.schemaVersion,
    freePfu: state.freePfu,
    burstPolicyState: { ...state.burstPolicyState },
    latentQueue: {
      schemaVersion: state.latentQueue.schemaVersion,
      currentTimeMinutes: state.latentQueue.currentTimeMinutes,
      nextSequence: state.latentQueue.nextSequence,
      cohorts: state.latentQueue.cohorts.map((cohort) => ({
        sequence: cohort.sequence,
        infectionCount: cohort.infectionCount,
        infectedAtMinutes: cohort.infectedAtMinutes,
        lifeHistoryIdentity: { ...cohort.lifeHistoryIdentity },
      })),
    },
  };
}

function sumSafeCounts(name: string, values: readonly number[]): number {
  let total = 0;
  for (const value of values) {
    nonNegativeSafeInteger(name + " value", value);
    total += value;
    if (!Number.isSafeInteger(total) || total < 0) {
      throw new RangeError(name + " exceeds safe integer range");
    }
  }
  return total;
}

function nonNegativeSafeInteger(name: string, value: unknown): void {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(name + " must be a non-negative safe integer");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
