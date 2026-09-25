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
  createInitialPhageCompositionCheckpoint,
  validatePhageCompositionCheckpoint,
  type PhageCompositionConfig,
} from "./compositionCheckpoint";
import {
  commitPhageLysisToComposition,
  commitPopulationBackedInfectionsToPhageComposition,
} from "./compositionTransactions";
import {
  SINGLE_HIT_UNIQUE_HOST_POLICY,
} from "./infectionPolicy";
import {
  T4_MG1655_LIFE_HISTORY,
  createPhageLifeHistoryIdentity,
  resolvePhageLifeHistory,
} from "./lifeHistory";
import {
  planPopulationBackedProductiveInfections,
} from "./populationInfection";
import {
  LOCAL_LYSIS_RELEASE_POLICY,
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
      limitation: "Deterministic phage composition transaction fixture only.",
    },
  };
}

function bridge(): PhageSpatialUnitBridge {
  return {
    schemaVersion: PHAGE_SPATIAL_UNIT_BRIDGE_SCHEMA_VERSION,
    id: "fixture-phage-composition-transaction-bridge",
    modelBiomassPerCellEquivalent: parameter(2),
    effectiveInteractionVolumeMl: parameter(0.5),
    gridCellPitchMeters: parameter(1e-3),
  };
}

function samplingPolicy(): SamplingExecutionPolicy {
  return {
    schemaVersion: SAMPLING_EXECUTION_POLICY_SCHEMA_VERSION,
    id: "fixture-phage-composition-transaction-sampling",
    exactTrialLimit: 64,
    acceleration: "exact-sparse-binomial-v1",
    maximumExpectedAcceleratedDraws: 128,
    maximumAcceleratedDraws: 256,
  };
}

function populationConfig(): DiscretePopulationAuthorityConfig {
  const unitBridge = bridge();
  return {
    width: 2,
    height: 1,
    mask: [1, 1],
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

function lifeHistory() {
  const resolved = resolvePhageLifeHistory(T4_MG1655_LIFE_HISTORY, 0.06);
  if (resolved.status === "out-of-domain") {
    throw new Error("expected in-domain T4/MG1655 transaction fixture");
  }
  return resolved;
}

describe("phage composition transactions", () => {
  it("consumes productive and non-productive adsorption from the exact target-cell PFU pool", () => {
    const populationCfg = populationConfig();
    const population = populationState(populationCfg);
    const initial = createInitialPhageCompositionCheckpoint(
      config(),
      populationCfg,
      population,
      { freePfuByCell: [4, 0] },
    );
    const plan = planPopulationBackedProductiveInfections(
      population,
      populationCfg,
      [
        {
          lineageId: "WT",
          cellIndex: 0,
          adsorbedPfu: 3,
          alreadyInfectedHosts: 0,
        },
      ],
    );
    const history = lifeHistory();

    const committed =
      commitPopulationBackedInfectionsToPhageComposition(
        initial,
        config(),
        population,
        populationCfg,
        plan,
        {
          infectedAtMinutes: 0,
          lifeHistoryIdentities: [
            createPhageLifeHistoryIdentity(history),
          ],
        },
      );

    expect(plan.totalProductiveInfections).toBe(2);
    expect(plan.totalNonProductiveAdsorptions).toBe(1);
    expect(committed.consumedPfuByCell).toEqual([3, 0]);
    expect(committed.totalAdsorbedPfu).toBe(3);
    expect(committed.totalProductiveInfections).toBe(2);
    expect(committed.totalNonProductiveAdsorptions).toBe(1);
    expect(committed.checkpoint.freePfuByCell).toEqual([1, 0]);
    expect(committed.checkpoint.lysisTransactionState.freePfu).toBe(1);
    expect(
      committed.checkpoint.spatialInfectionState.infectedHostCounts,
    ).toEqual([[2, 0]]);
    expect(
      committed.checkpoint.lysisTransactionState.latentQueue.cohorts,
    ).toHaveLength(1);
    expect(
      committed.checkpoint.lysisTransactionState.latentQueue.cohorts[0],
    ).toMatchObject({ infectionCount: 2 });

    // Caller-owned inputs remain detached and unchanged.
    expect(initial.freePfuByCell).toEqual([4, 0]);
    expect(initial.lysisTransactionState.freePfu).toBe(4);
    expect(initial.spatialInfectionState.infectedHostCounts).toEqual([
      [0, 0],
    ]);
    expect(() =>
      validatePhageCompositionCheckpoint(
        committed.checkpoint,
        config(),
        populationCfg,
        population,
      ),
    ).not.toThrow();
  });

  it("refuses to borrow PFU from another cell even when whole-dish aggregate PFU is sufficient", () => {
    const populationCfg = populationConfig();
    const population = populationState(populationCfg);
    const initial = createInitialPhageCompositionCheckpoint(
      config(),
      populationCfg,
      population,
      { freePfuByCell: [1, 5] },
    );
    const plan = planPopulationBackedProductiveInfections(
      population,
      populationCfg,
      [
        {
          lineageId: "WT",
          cellIndex: 0,
          adsorbedPfu: 2,
          alreadyInfectedHosts: 0,
        },
      ],
    );
    const history = lifeHistory();

    expect(() =>
      commitPopulationBackedInfectionsToPhageComposition(
        initial,
        config(),
        population,
        populationCfg,
        plan,
        {
          infectedAtMinutes: 0,
          lifeHistoryIdentities: [
            createPhageLifeHistoryIdentity(history),
          ],
        },
      ),
    ).toThrow(/target cell contains/);

    expect(initial.freePfuByCell).toEqual([1, 5]);
    expect(initial.lysisTransactionState.freePfu).toBe(6);
    expect(initial.spatialInfectionState.infectedHostCounts).toEqual([
      [0, 0],
    ]);
  });

  it("places lysis progeny at the infected cell while returning the exact higher-level biomass-removal obligation", () => {
    const populationCfg = populationConfig();
    const population = populationState(populationCfg);
    const initial = createInitialPhageCompositionCheckpoint(
      config(),
      populationCfg,
      population,
      { freePfuByCell: [4, 0] },
    );
    const plan = planPopulationBackedProductiveInfections(
      population,
      populationCfg,
      [
        {
          lineageId: "WT",
          cellIndex: 0,
          adsorbedPfu: 1,
          alreadyInfectedHosts: 0,
        },
      ],
    );
    const history = lifeHistory();
    const infected =
      commitPopulationBackedInfectionsToPhageComposition(
        initial,
        config(),
        population,
        populationCfg,
        plan,
        {
          infectedAtMinutes: 0,
          lifeHistoryIdentities: [
            createPhageLifeHistoryIdentity(history),
          ],
        },
      );

    expect(infected.checkpoint.freePfuByCell).toEqual([3, 0]);
    expect(infected.checkpoint.lysisTransactionState.freePfu).toBe(3);

    const lysed = commitPhageLysisToComposition(
      infected.checkpoint,
      config(),
      population,
      populationCfg,
      {
        throughMinutes: history.values.latentPeriodMinutes,
        lifeHistories: [history],
      },
    );

    expect(lysed.hostDecrementCount).toBe(1);
    expect(lysed.releasedPfu).toBe(8);
    expect(lysed.releasedPfuByCell).toEqual([8, 0]);
    expect(lysed.checkpoint.freePfuByCell).toEqual([11, 0]);
    expect(lysed.checkpoint.lysisTransactionState.freePfu).toBe(11);
    expect(
      lysed.checkpoint.spatialInfectionState.infectedHostCounts,
    ).toEqual([[0, 0]]);
    expect(
      lysed.checkpoint.lysisTransactionState.latentQueue.cohorts,
    ).toEqual([]);

    expect(lysed.populationRemoval.totalRemovedHosts).toBe(1);
    expect(lysed.populationRemoval.state.standingHostCounts).toEqual([
      [1, 1],
    ]);
    expect(lysed.populationRemoval.modelBiomassToRemove).toEqual([
      [2, 0],
    ]);

    // The original authoritative population state is still caller-owned; the
    // returned removal plan is not silently published as continuous ecology.
    expect(population.standingHostCounts).toEqual([[2, 1]]);
    expect(population.revision).toBe(0);
    expect(() =>
      validatePhageCompositionCheckpoint(
        lysed.checkpoint,
        config(),
        populationCfg,
        lysed.populationRemoval.state,
      ),
    ).not.toThrow();
  });

  it("keeps adsorption and lysis conservation exact over one complete cohort cycle", () => {
    const populationCfg = populationConfig();
    const population = populationState(populationCfg);
    const initial = createInitialPhageCompositionCheckpoint(
      config(),
      populationCfg,
      population,
      { freePfuByCell: [10, 2] },
    );
    const plan = planPopulationBackedProductiveInfections(
      population,
      populationCfg,
      [
        {
          lineageId: "WT",
          cellIndex: 0,
          adsorbedPfu: 2,
          alreadyInfectedHosts: 0,
        },
      ],
    );
    const history = lifeHistory();
    const infected =
      commitPopulationBackedInfectionsToPhageComposition(
        initial,
        config(),
        population,
        populationCfg,
        plan,
        {
          infectedAtMinutes: 0,
          lifeHistoryIdentities: [
            createPhageLifeHistoryIdentity(history),
          ],
        },
      );

    const afterInfectionTotal =
      infected.checkpoint.freePfuByCell.reduce(
        (sum, value) => sum + value,
        0,
      );
    expect(afterInfectionTotal).toBe(12 - plan.totalAdsorbedPfu);
    expect(infected.checkpoint.lysisTransactionState.freePfu).toBe(
      afterInfectionTotal,
    );

    const lysed = commitPhageLysisToComposition(
      infected.checkpoint,
      config(),
      population,
      populationCfg,
      {
        throughMinutes: history.values.latentPeriodMinutes,
        lifeHistories: [history],
      },
    );
    const afterLysisTotal = lysed.checkpoint.freePfuByCell.reduce(
      (sum, value) => sum + value,
      0,
    );

    expect(afterLysisTotal).toBe(
      afterInfectionTotal + lysed.releasedPfu,
    );
    expect(lysed.checkpoint.lysisTransactionState.freePfu).toBe(
      afterLysisTotal,
    );
  });
});
