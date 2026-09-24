import { describe, expect, it } from "vitest";

import {
  CELL_EQUIVALENT_CALIBRATION_SCHEMA_VERSION,
  FRACTIONAL_CARRY_POPULATION_POLICY,
  createDiscretePopulationAuthorityState,
  type CellEquivalentCalibration,
  type DiscretePopulationAuthorityConfig,
} from "../populationAuthority";
import { phageProductiveInfectionPolicyIdentity } from "./infectionPolicy";
import { planPopulationBackedProductiveInfections } from "./populationInfection";

function calibration(): CellEquivalentCalibration {
  return {
    schemaVersion: CELL_EQUIVALENT_CALIBRATION_SCHEMA_VERSION,
    id: "fixture-phage-cell-scale",
    modelBiomassPerCellEquivalent: 2,
    provenance: {
      classification: "engineering",
      sourceKeys: [],
      limitation: "Deterministic unit fixture only.",
    },
  };
}

function config(
  overrides: Partial<DiscretePopulationAuthorityConfig> = {},
): DiscretePopulationAuthorityConfig {
  return {
    width: 2,
    height: 1,
    mask: [1, 1],
    lineageIds: ["WT", "R1"],
    calibration: calibration(),
    policy: FRACTIONAL_CARRY_POPULATION_POLICY,
    ...overrides,
  };
}

describe("population-backed phage productive infection planning", () => {
  it("subtracts already-infected occupancy before applying infection policy", () => {
    const cfg = config();
    const population = createDiscretePopulationAuthorityState(cfg, [
      [6, 4],
      [2, 0],
    ]);

    const plan = planPopulationBackedProductiveInfections(population, cfg, [
      {
        lineageId: "WT",
        cellIndex: 0,
        adsorbedPfu: 5,
        alreadyInfectedHosts: 1,
      },
    ]);

    expect(plan.populationRevision).toBe(0);
    expect(plan.populationConfigurationIdentity).toBe(
      population.configurationIdentity,
    );
    expect(plan.infectionPolicyIdentity).toBe(
      phageProductiveInfectionPolicyIdentity(),
    );
    expect(plan.targets).toEqual([
      {
        lineageId: "WT",
        lineageIndex: 0,
        cellIndex: 0,
        adsorbedPfu: 5,
        standingHosts: 3,
        infectedHostsBefore: 1,
        susceptibleHostOpportunities: 2,
        productiveInfections: 2,
        nonProductiveAdsorptions: 3,
        infectedHostsAfter: 3,
      },
    ]);
    expect(plan.totalProductiveInfections).toBe(2);
    expect(plan.totalNonProductiveAdsorptions).toBe(3);

    // Planning cannot silently mutate #562 standing-host authority.
    expect(population.standingHostCounts[0]![0]).toBe(3);
    expect(population.revision).toBe(0);
  });

  it("preserves explicit lineage/cell identity across a multi-target batch", () => {
    const cfg = config();
    const population = createDiscretePopulationAuthorityState(cfg, [
      new Uint32Array([8, 4]),
      new Uint32Array([2, 2]),
    ]);

    const plan = planPopulationBackedProductiveInfections(population, cfg, [
      {
        lineageId: "WT",
        cellIndex: 1,
        adsorbedPfu: 4,
        alreadyInfectedHosts: 0,
      },
      {
        lineageId: "R1",
        cellIndex: 0,
        adsorbedPfu: 1,
        alreadyInfectedHosts: 0,
      },
    ]);

    expect(plan.targets.map((target) => [
      target.lineageId,
      target.cellIndex,
      target.productiveInfections,
    ])).toEqual([
      ["WT", 1, 2],
      ["R1", 0, 1],
    ]);
    expect(plan.totalAdsorbedPfu).toBe(5);
    expect(plan.totalProductiveInfections).toBe(3);
    expect(plan.totalNonProductiveAdsorptions).toBe(2);
  });

  it("refuses superinfection occupancy that already exceeds standing authority", () => {
    const cfg = config();
    const population = createDiscretePopulationAuthorityState(cfg, [
      [2, 0],
      [0, 0],
    ]);

    expect(() =>
      planPopulationBackedProductiveInfections(population, cfg, [
        {
          lineageId: "WT",
          cellIndex: 0,
          adsorbedPfu: 1,
          alreadyInfectedHosts: 2,
        },
      ]),
    ).toThrow(/already-infected hosts cannot exceed/);
  });

  it("refuses duplicate lineage/cell targets before one susceptible pool can be spent twice", () => {
    const cfg = config();
    const population = createDiscretePopulationAuthorityState(cfg, [
      [6, 0],
      [0, 0],
    ]);

    expect(() =>
      planPopulationBackedProductiveInfections(population, cfg, [
        {
          lineageId: "WT",
          cellIndex: 0,
          adsorbedPfu: 1,
          alreadyInfectedHosts: 0,
        },
        {
          lineageId: "WT",
          cellIndex: 0,
          adsorbedPfu: 1,
          alreadyInfectedHosts: 0,
        },
      ]),
    ).toThrow(/must not spend one lineage\/cell susceptible pool twice/);
  });

  it("fails closed on unknown lineage, masked cell, and stale configuration identity", () => {
    const cfg = config({ mask: [1, 0] });
    const population = createDiscretePopulationAuthorityState(cfg, [
      [4, 0],
      [0, 0],
    ]);

    expect(() =>
      planPopulationBackedProductiveInfections(population, cfg, [
        {
          lineageId: "missing",
          cellIndex: 0,
          adsorbedPfu: 1,
          alreadyInfectedHosts: 0,
        },
      ]),
    ).toThrow(/lineageId is not present/);

    expect(() =>
      planPopulationBackedProductiveInfections(population, cfg, [
        {
          lineageId: "WT",
          cellIndex: 1,
          adsorbedPfu: 1,
          alreadyInfectedHosts: 0,
        },
      ]),
    ).toThrow(/inside the population mask/);

    const drifted = config({
      calibration: {
        ...calibration(),
        id: "fixture-phage-cell-scale-v2",
      },
    });
    expect(() =>
      planPopulationBackedProductiveInfections(population, drifted, []),
    ).toThrow(/configuration identity mismatch/);
  });

  it("rejects fractional phage occupancy and adsorption counts", () => {
    const cfg = config();
    const population = createDiscretePopulationAuthorityState(cfg, [
      [4, 0],
      [0, 0],
    ]);

    expect(() =>
      planPopulationBackedProductiveInfections(population, cfg, [
        {
          lineageId: "WT",
          cellIndex: 0,
          adsorbedPfu: 0.5,
          alreadyInfectedHosts: 0,
        },
      ]),
    ).toThrow(/safe integer/);

    expect(() =>
      planPopulationBackedProductiveInfections(population, cfg, [
        {
          lineageId: "WT",
          cellIndex: 0,
          adsorbedPfu: 1,
          alreadyInfectedHosts: 0.5,
        },
      ]),
    ).toThrow(/safe integer/);
  });
});
