import { describe, expect, it } from "vitest";

import {
  FRACTIONAL_CARRY_POPULATION_POLICY,
  createDiscretePopulationAuthorityState,
  type DiscretePopulationAuthorityConfig,
} from "../populationAuthority";
import {
  SAMPLING_EXECUTION_POLICY_SCHEMA_VERSION,
  type SamplingExecutionPolicy,
} from "../samplingPolicy";
import {
  DETERMINISTIC_RESIDUAL_BURST_POLICY,
} from "./burstPolicy";
import {
  PHAGE_COMPOSITION_CONFIG_SCHEMA_VERSION,
  PHAGE_FREE_PHAGE_LOSS_MODE,
  PHAGE_LIVING_HOST_TRANSPORT_MODE,
  assemblePhageCompositionCheckpoint,
  createInitialPhageCompositionCheckpoint,
  phageCompositionConfigurationIdentity,
  restorePhageCompositionCheckpoint,
  validatePhageCompositionCheckpoint,
  type PhageCompositionConfig,
} from "./compositionCheckpoint";
import {
  SINGLE_HIT_UNIQUE_HOST_POLICY,
} from "./infectionPolicy";
import {
  createPhageLifeHistoryIdentity,
  resolvePhageLifeHistory,
  T4_MG1655_LIFE_HISTORY,
} from "./lifeHistory";
import {
  planPopulationBackedProductiveInfections,
} from "./populationInfection";
import {
  LOCAL_LYSIS_RELEASE_POLICY,
  commitPopulationBackedInfections,
} from "./spatialInfection";
import {
  PHAGE_SPATIAL_UNIT_BRIDGE_SCHEMA_VERSION,
  cellEquivalentCalibrationFromPhageSpatialUnitBridge,
  type PhageSpatialUnitBridge,
  type PhysicalUnitParameter,
} from "./unitBridge";

function parameter(value: number): PhysicalUnitParameter {
  return {
    value,
    provenance: {
      classification: "engineering",
      sourceKeys: [],
      limitation: "Deterministic phage composition fixture only.",
    },
  };
}

function bridge(): PhageSpatialUnitBridge {
  return {
    schemaVersion: PHAGE_SPATIAL_UNIT_BRIDGE_SCHEMA_VERSION,
    id: "fixture-phage-composition-bridge",
    modelBiomassPerCellEquivalent: parameter(2),
    effectiveInteractionVolumeMl: parameter(0.5),
    gridCellPitchMeters: parameter(1e-3),
  };
}

function samplingPolicy(): SamplingExecutionPolicy {
  return {
    schemaVersion: SAMPLING_EXECUTION_POLICY_SCHEMA_VERSION,
    id: "fixture-phage-adsorption-sampling",
    exactTrialLimit: 64,
    acceleration: "exact-sparse-binomial-v1",
    maximumExpectedAcceleratedDraws: 128,
    maximumAcceleratedDraws: 256,
  };
}

function populationConfig(
  mask: readonly number[] = [1, 1],
): DiscretePopulationAuthorityConfig {
  const unitBridge = bridge();
  return {
    width: 2,
    height: 1,
    mask,
    lineageIds: ["WT"],
    calibration:
      cellEquivalentCalibrationFromPhageSpatialUnitBridge(unitBridge),
    policy: FRACTIONAL_CARRY_POPULATION_POLICY,
  };
}

function config(): PhageCompositionConfig {
  return {
    schemaVersion: PHAGE_COMPOSITION_CONFIG_SCHEMA_VERSION,
    spatialUnitBridge: bridge(),
    adsorptionSamplingPolicy: samplingPolicy(),
    productiveInfectionPolicy: SINGLE_HIT_UNIQUE_HOST_POLICY,
    burstPolicy: DETERMINISTIC_RESIDUAL_BURST_POLICY,
    localReleasePolicy: LOCAL_LYSIS_RELEASE_POLICY,
    livingHostTransport: PHAGE_LIVING_HOST_TRANSPORT_MODE,
    freePhageLoss: PHAGE_FREE_PHAGE_LOSS_MODE,
  };
}

function populationState(cfg: DiscretePopulationAuthorityConfig) {
  return createDiscretePopulationAuthorityState(cfg, [[4, 2]]);
}

function inDomainLifeHistory() {
  const resolved = resolvePhageLifeHistory(T4_MG1655_LIFE_HISTORY, 0.06);
  if (resolved.status === "out-of-domain") {
    throw new Error("expected in-domain T4/MG1655 fixture");
  }
  return resolved;
}

describe("phage composition checkpoint contract", () => {
  it("binds all reviewed policy/calibration identities and creates detached spatial PFU state", () => {
    const cfg = populationConfig();
    const population = populationState(cfg);
    const checkpoint = createInitialPhageCompositionCheckpoint(
      config(),
      cfg,
      population,
      { freePfuByCell: [7, 3] },
    );

    expect(checkpoint.configurationIdentity).toBe(
      phageCompositionConfigurationIdentity(config(), cfg),
    );
    expect(checkpoint.populationConfigurationIdentity).toBe(
      checkpoint.spatialInfectionState.populationConfigurationIdentity,
    );
    expect(checkpoint.mask).toEqual([1, 1]);
    expect(checkpoint.freePfuByCell).toEqual([7, 3]);
    expect(checkpoint.lysisTransactionState.freePfu).toBe(10);
    expect(checkpoint.spatialInfectionState.infectedHostCounts).toEqual([
      [0, 0],
    ]);
    expect(() =>
      validatePhageCompositionCheckpoint(
        checkpoint,
        config(),
        cfg,
        population,
      ),
    ).not.toThrow();
  });

  it("requires the phage unit bridge to project the exact shared population calibration", () => {
    const cfg = populationConfig();
    const mismatched: DiscretePopulationAuthorityConfig = {
      ...cfg,
      calibration: {
        ...cfg.calibration,
        id: "different-calibration-authority",
      },
    };

    expect(() =>
      phageCompositionConfigurationIdentity(config(), mismatched),
    ).toThrow(/exactly match shared population authority/);
  });

  it("keeps living-host transport and free-phage loss fail-closed in v1 identity", () => {
    const cfg = populationConfig();
    expect(() =>
      phageCompositionConfigurationIdentity(
        {
          ...config(),
          livingHostTransport: "enabled" as never,
        },
        cfg,
      ),
    ).toThrow(/transport must remain disabled/);

    expect(() =>
      phageCompositionConfigurationIdentity(
        {
          ...config(),
          freePhageLoss: "enabled" as never,
        },
        cfg,
      ),
    ).toThrow(/loss must remain disabled/);
  });

  it("rejects off-mask PFU and aggregate/spatial PFU mismatch", () => {
    const maskedConfig = populationConfig([1, 0]);
    const maskedPopulation = createDiscretePopulationAuthorityState(
      maskedConfig,
      [[4, 0]],
    );
    expect(() =>
      createInitialPhageCompositionCheckpoint(
        config(),
        maskedConfig,
        maskedPopulation,
        { freePfuByCell: [0, 1] },
      ),
    ).toThrow(/zero outside population mask/);

    const cfg = populationConfig();
    const population = populationState(cfg);
    const checkpoint = createInitialPhageCompositionCheckpoint(
      config(),
      cfg,
      population,
      { freePfuByCell: [5, 0] },
    );
    const mismatched = {
      ...checkpoint,
      lysisTransactionState: {
        ...checkpoint.lysisTransactionState,
        freePfu: 4,
      },
    };

    expect(() =>
      validatePhageCompositionCheckpoint(
        mismatched,
        config(),
        cfg,
        population,
      ),
    ).toThrow(/aggregate free PFU/);
  });

  it("rejects stale configuration identity when a replay-critical sampling policy changes", () => {
    const cfg = populationConfig();
    const population = populationState(cfg);
    const checkpoint = createInitialPhageCompositionCheckpoint(
      config(),
      cfg,
      population,
    );
    const changedConfig: PhageCompositionConfig = {
      ...config(),
      adsorptionSamplingPolicy: {
        ...samplingPolicy(),
        maximumAcceleratedDraws: 257,
      },
    };

    expect(() =>
      validatePhageCompositionCheckpoint(
        checkpoint,
        changedConfig,
        cfg,
        population,
      ),
    ).toThrow(/configuration identity mismatch/);
  });

  it("binds pending latent cohorts one-to-one to exact infected-host spatial targets", () => {
    const cfg = populationConfig();
    const population = populationState(cfg);
    const initial = createInitialPhageCompositionCheckpoint(
      config(),
      cfg,
      population,
      { freePfuByCell: [5, 0] },
    );
    const plan = planPopulationBackedProductiveInfections(
      population,
      cfg,
      [
        {
          lineageId: "WT",
          cellIndex: 0,
          adsorbedPfu: 1,
          alreadyInfectedHosts: 0,
        },
      ],
    );
    const history = inDomainLifeHistory();
    const committed = commitPopulationBackedInfections(
      initial.spatialInfectionState,
      initial.lysisTransactionState,
      population,
      cfg,
      plan,
      {
        infectedAtMinutes: 0,
        lifeHistoryIdentities: [createPhageLifeHistoryIdentity(history)],
      },
    );

    const checkpoint = assemblePhageCompositionCheckpoint(
      config(),
      cfg,
      population,
      {
        freePfuByCell: initial.freePfuByCell,
        spatialInfectionState: committed.state,
        lysisTransactionState: committed.lysisTransactionState,
      },
    );
    expect(checkpoint.spatialInfectionState.cohortTargets).toHaveLength(1);
    expect(
      checkpoint.lysisTransactionState.latentQueue.cohorts,
    ).toHaveLength(1);

    const missingLatentCohort = {
      ...checkpoint,
      lysisTransactionState: {
        ...checkpoint.lysisTransactionState,
        latentQueue: {
          ...checkpoint.lysisTransactionState.latentQueue,
          cohorts: [],
        },
      },
    };
    expect(() =>
      validatePhageCompositionCheckpoint(
        missingLatentCohort,
        config(),
        cfg,
        population,
      ),
    ).toThrow(/align one-to-one/);
  });

  it("restores only after validation and detaches every mutable array/object layer", () => {
    const cfg = populationConfig();
    const population = populationState(cfg);
    const checkpoint = createInitialPhageCompositionCheckpoint(
      config(),
      cfg,
      population,
      { freePfuByCell: [2, 1] },
    );
    const restored = restorePhageCompositionCheckpoint(
      checkpoint,
      config(),
      cfg,
      population,
    );

    expect(restored).toEqual(checkpoint);
    expect(restored).not.toBe(checkpoint);
    expect(restored.mask).not.toBe(checkpoint.mask);
    expect(restored.freePfuByCell).not.toBe(checkpoint.freePfuByCell);
    expect(restored.spatialInfectionState).not.toBe(
      checkpoint.spatialInfectionState,
    );
    expect(restored.spatialInfectionState.infectedHostCounts[0]).not.toBe(
      checkpoint.spatialInfectionState.infectedHostCounts[0],
    );
    expect(restored.lysisTransactionState).not.toBe(
      checkpoint.lysisTransactionState,
    );
    expect(restored.lysisTransactionState.latentQueue).not.toBe(
      checkpoint.lysisTransactionState.latentQueue,
    );
  });
});
