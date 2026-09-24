import { describe, expect, it } from "vitest";

import {
  CELL_EQUIVALENT_CALIBRATION_SCHEMA_VERSION,
  FRACTIONAL_CARRY_POPULATION_POLICY,
  createDiscretePopulationAuthorityState,
  type CellEquivalentCalibration,
  type DiscretePopulationAuthorityConfig,
} from "../populationAuthority";
import {
  DETERMINISTIC_RESIDUAL_BURST_POLICY,
} from "./burstPolicy";
import {
  createPhageLifeHistoryIdentity,
  resolvePhageLifeHistory,
  T4_MG1655_LIFE_HISTORY,
  type InDomainPhageLifeHistoryResolution,
} from "./lifeHistory";
import {
  createPhageLysisTransactionState,
} from "./lysisTransaction";
import {
  planPopulationBackedProductiveInfections,
} from "./populationInfection";
import {
  commitPopulationBackedInfections,
  commitSpatialPhageLysis,
  createPhageSpatialInfectionState,
  phageLocalReleasePolicyIdentity,
  validatePhageSpatialInfectionState,
} from "./spatialInfection";

function calibration(): CellEquivalentCalibration {
  return {
    schemaVersion: CELL_EQUIVALENT_CALIBRATION_SCHEMA_VERSION,
    id: "fixture-phage-cell-scale",
    modelBiomassPerCellEquivalent: 2,
    provenance: {
      classification: "engineering",
      sourceKeys: [],
      limitation: "Deterministic spatial phage transaction fixture only.",
    },
  };
}

function config(): DiscretePopulationAuthorityConfig {
  return {
    width: 2,
    height: 1,
    mask: [1, 1],
    lineageIds: ["WT", "R1"],
    calibration: calibration(),
    policy: FRACTIONAL_CARRY_POPULATION_POLICY,
  };
}

function lifeHistory(
  growthRatePerHour = 0.06,
): InDomainPhageLifeHistoryResolution {
  const resolved = resolvePhageLifeHistory(
    T4_MG1655_LIFE_HISTORY,
    growthRatePerHour,
  );
  if (resolved.status === "out-of-domain") {
    throw new Error("expected in-domain T4/MG1655 life history");
  }
  return resolved;
}

function preparedInfection() {
  const cfg = config();
  const population = createDiscretePopulationAuthorityState(cfg, [
    [6, 4],
    [2, 0],
  ]);
  const spatial = createPhageSpatialInfectionState(cfg);
  const lysis = createPhageLysisTransactionState(
    DETERMINISTIC_RESIDUAL_BURST_POLICY,
  );
  const history = lifeHistory();
  const plan = planPopulationBackedProductiveInfections(population, cfg, [
    {
      lineageId: "WT",
      cellIndex: 0,
      adsorbedPfu: 2,
      alreadyInfectedHosts: 0,
    },
  ]);
  const committed = commitPopulationBackedInfections(
    spatial,
    lysis,
    population,
    cfg,
    plan,
    [createPhageLifeHistoryIdentity(history)],
  );
  return { cfg, population, history, plan, ...committed };
}

describe("spatial phage infection and lysis commit seam", () => {
  it("schedules productive infections with exact lineage/cell cohort identity", () => {
    const { cfg, population, state, lysisTransactionState } =
      preparedInfection();

    expect(state.infectedHostCounts).toEqual([
      [2, 0],
      [0, 0],
    ]);
    expect(state.cohortTargets).toEqual([
      {
        sequence: 0,
        lineageId: "WT",
        lineageIndex: 0,
        cellIndex: 0,
        infectionCount: 2,
      },
    ]);
    expect(lysisTransactionState.latentQueue.cohorts).toHaveLength(1);
    expect(lysisTransactionState.latentQueue.cohorts[0]).toMatchObject({
      sequence: 0,
      infectionCount: 2,
    });
    expect(() =>
      validatePhageSpatialInfectionState(state, population, cfg),
    ).not.toThrow();
  });

  it("keeps pre-maturity hosts and local progeny unchanged", () => {
    const {
      cfg,
      population,
      history,
      state,
      lysisTransactionState,
    } = preparedInfection();

    const result = commitSpatialPhageLysis(
      DETERMINISTIC_RESIDUAL_BURST_POLICY,
      state,
      lysisTransactionState,
      population,
      cfg,
      {
        throughMinutes: history.values.latentPeriodMinutes - 0.001,
        lifeHistories: [],
      },
    );

    expect(result.lysisTransaction.hostDecrementCount).toBe(0);
    expect(result.lysisTransaction.releasedPfu).toBe(0);
    expect(result.populationRemoval.totalRemovedHosts).toBe(0);
    expect(result.releasedPfuByCell).toEqual([0, 0]);
    expect(result.state.infectedHostCounts).toEqual([
      [2, 0],
      [0, 0],
    ]);
    expect(result.state.cohortTargets).toHaveLength(1);
  });

  it("commits exact host removal and places progeny at the lysis cell", () => {
    const {
      cfg,
      population,
      history,
      state,
      lysisTransactionState,
    } = preparedInfection();

    const result = commitSpatialPhageLysis(
      DETERMINISTIC_RESIDUAL_BURST_POLICY,
      state,
      lysisTransactionState,
      population,
      cfg,
      {
        throughMinutes: history.values.latentPeriodMinutes,
        lifeHistories: [history],
      },
    );

    expect(result.lysisTransaction.hostDecrementCount).toBe(2);
    expect(result.lysisTransaction.releasedPfu).toBe(16);
    expect(result.populationRemoval.totalRemovedHosts).toBe(2);
    expect(result.populationRemoval.state.standingHostCounts).toEqual([
      [1, 2],
      [1, 0],
    ]);
    expect(result.populationRemoval.modelBiomassToRemove).toEqual([
      [4, 0],
      [0, 0],
    ]);
    expect(result.state.infectedHostCounts).toEqual([
      [0, 0],
      [0, 0],
    ]);
    expect(result.state.cohortTargets).toEqual([]);
    expect(result.releasedPfuByCell).toEqual([16, 0]);
    expect(result.releasePolicyIdentity).toBe(
      phageLocalReleasePolicyIdentity(),
    );
  });

  it("preserves independent spatial targets for equal-time cohorts", () => {
    const cfg = config();
    const population = createDiscretePopulationAuthorityState(cfg, [
      [4, 4],
      [0, 0],
    ]);
    const spatial = createPhageSpatialInfectionState(cfg);
    const lysis = createPhageLysisTransactionState(
      DETERMINISTIC_RESIDUAL_BURST_POLICY,
    );
    const history = lifeHistory();

    const plan = planPopulationBackedProductiveInfections(population, cfg, [
      {
        lineageId: "WT",
        cellIndex: 0,
        adsorbedPfu: 1,
        alreadyInfectedHosts: 0,
      },
      {
        lineageId: "WT",
        cellIndex: 1,
        adsorbedPfu: 1,
        alreadyInfectedHosts: 0,
      },
    ]);
    const committed = commitPopulationBackedInfections(
      spatial,
      lysis,
      population,
      cfg,
      plan,
      [
        createPhageLifeHistoryIdentity(history),
        createPhageLifeHistoryIdentity(history),
      ],
    );

    const result = commitSpatialPhageLysis(
      DETERMINISTIC_RESIDUAL_BURST_POLICY,
      committed.state,
      committed.lysisTransactionState,
      population,
      cfg,
      {
        throughMinutes: history.values.latentPeriodMinutes,
        lifeHistories: [history],
      },
    );

    expect(result.lysisTransaction.maturedCohortSequences).toEqual([0, 1]);
    expect(result.releasedPfuByCell).toEqual([8, 8]);
    expect(result.populationRemoval.modelBiomassToRemove).toEqual([
      [2, 2],
      [0, 0],
    ]);
  });

  it("refuses a stale population-backed infection plan before scheduling", () => {
    const cfg = config();
    const population = createDiscretePopulationAuthorityState(cfg, [
      [6, 0],
      [0, 0],
    ]);
    const plan = planPopulationBackedProductiveInfections(population, cfg, [
      {
        lineageId: "WT",
        cellIndex: 0,
        adsorbedPfu: 1,
        alreadyInfectedHosts: 0,
      },
    ]);
    const advancedRevision = {
      ...population,
      revision: population.revision + 1,
    };
    const spatial = createPhageSpatialInfectionState(cfg);
    const lysis = createPhageLysisTransactionState(
      DETERMINISTIC_RESIDUAL_BURST_POLICY,
    );
    const history = lifeHistory();

    expect(() =>
      commitPopulationBackedInfections(
        spatial,
        lysis,
        advancedRevision,
        cfg,
        plan,
        [createPhageLifeHistoryIdentity(history)],
      ),
    ).toThrow(/population revision is stale/);

    expect(spatial.infectedHostCounts).toEqual([
      [0, 0],
      [0, 0],
    ]);
    expect(lysis.latentQueue.cohorts).toEqual([]);
  });

  it("refuses orphan latent/spatial cohort state and keeps caller state untouched", () => {
    const {
      cfg,
      population,
      history,
      state,
      lysisTransactionState,
    } = preparedInfection();
    const beforeSpatial = JSON.parse(JSON.stringify(state));
    const beforeLysis = JSON.parse(JSON.stringify(lysisTransactionState));
    const orphanSpatial = {
      ...state,
      cohortTargets: [],
      infectedHostCounts: [
        [0, 0],
        [0, 0],
      ],
    };

    expect(() =>
      commitSpatialPhageLysis(
        DETERMINISTIC_RESIDUAL_BURST_POLICY,
        orphanSpatial,
        lysisTransactionState,
        population,
        cfg,
        {
          throughMinutes: history.values.latentPeriodMinutes,
          lifeHistories: [history],
        },
      ),
    ).toThrow(/align one-to-one/);

    expect(state).toEqual(beforeSpatial);
    expect(lysisTransactionState).toEqual(beforeLysis);
  });

  it("fails atomically when aggregate PFU overflow prevents lysis publication", () => {
    const cfg = config();
    const population = createDiscretePopulationAuthorityState(cfg, [
      [2, 0],
      [0, 0],
    ]);
    const spatial = createPhageSpatialInfectionState(cfg);
    const history = lifeHistory();
    const plan = planPopulationBackedProductiveInfections(population, cfg, [
      {
        lineageId: "WT",
        cellIndex: 0,
        adsorbedPfu: 1,
        alreadyInfectedHosts: 0,
      },
    ]);
    const lysis = createPhageLysisTransactionState(
      DETERMINISTIC_RESIDUAL_BURST_POLICY,
      { freePfu: Number.MAX_SAFE_INTEGER - 5 },
    );
    const committed = commitPopulationBackedInfections(
      spatial,
      lysis,
      population,
      cfg,
      plan,
      [createPhageLifeHistoryIdentity(history)],
    );
    const beforeSpatial = JSON.parse(JSON.stringify(committed.state));
    const beforeLysis = JSON.parse(
      JSON.stringify(committed.lysisTransactionState),
    );

    expect(() =>
      commitSpatialPhageLysis(
        DETERMINISTIC_RESIDUAL_BURST_POLICY,
        committed.state,
        committed.lysisTransactionState,
        population,
        cfg,
        {
          throughMinutes: history.values.latentPeriodMinutes,
          lifeHistories: [history],
        },
      ),
    ).toThrow(/free PFU after phage lysis exceeds/);

    expect(committed.state).toEqual(beforeSpatial);
    expect(committed.lysisTransactionState).toEqual(beforeLysis);
  });
});
