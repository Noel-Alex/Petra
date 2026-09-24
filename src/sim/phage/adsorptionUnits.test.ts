import { describe, expect, it } from "vitest";
import { SimulationRng } from "../rng";
import {
  adsorptionHazardPerFreePhagePerMinute,
  adsorptionProbabilityPerFreePhage,
  biomassToCellEquivalentConcentrationPerMl,
  biomassToCellEquivalentCount,
  expectedAdsorptionsPerMinute,
  freePhagePfuToConcentrationPerMl,
  sampleFreePhageAdsorptionsExact,
  validatePhageAdsorptionUnitBridge,
  type PhageAdsorptionUnitBridge,
} from "./adsorptionUnits";

const BRIDGE: PhageAdsorptionUnitBridge = {
  id: "synthetic-unit-bridge",
  version: "1",
  biomassUnitsPerCellEquivalent: 2,
  interactionVolumeMl: 0.001,
  biomassBasis: "2 synthetic aggregate biomass units per cell-equivalent",
  volumeBasis: "synthetic 0.001 mL interaction volume for deterministic tests",
  provenance: {
    classification: "engineering",
    sourceIds: [],
    note: "Synthetic deterministic unit test only; not a biological default.",
  },
};

describe("phage adsorption unit bridge", () => {
  it("converts aggregate biomass and PFU only through explicit scenario units", () => {
    expect(biomassToCellEquivalentCount(2_000_000, BRIDGE)).toBe(1_000_000);
    expect(
      biomassToCellEquivalentConcentrationPerMl(2_000_000, BRIDGE),
    ).toBe(1_000_000_000);
    expect(freePhagePfuToConcentrationPerMl(1_000, BRIDGE)).toBe(1_000_000);
  });

  it("derives a dimensionally valid per-phage hazard and expected rate", () => {
    const hazard = adsorptionHazardPerFreePhagePerMinute(
      2e-9,
      2_000_000,
      BRIDGE,
    );
    expect(hazard).toBeCloseTo(2, 12);
    expect(
      expectedAdsorptionsPerMinute(2e-9, 2_000_000, 10, BRIDGE),
    ).toBeCloseTo(20, 12);
    expect(
      adsorptionProbabilityPerFreePhage(2e-9, 2_000_000, 0.5, BRIDGE),
    ).toBeCloseTo(1 - Math.exp(-1), 12);
  });

  it("depends on concentration rather than arbitrary grid-cell scaling", () => {
    const doubledBridge: PhageAdsorptionUnitBridge = {
      ...BRIDGE,
      id: "synthetic-double-volume",
      interactionVolumeMl: 0.002,
    };

    const original = adsorptionHazardPerFreePhagePerMinute(
      2e-9,
      2_000_000,
      BRIDGE,
    );
    const doubled = adsorptionHazardPerFreePhagePerMinute(
      2e-9,
      4_000_000,
      doubledBridge,
    );

    expect(doubled).toBeCloseTo(original, 12);
  });

  it("samples bounded low-count adsorption reproducibly", () => {
    const args = {
      adsorptionConstantMlPerMin: 1e-9,
      hostBiomass: 2_000_000,
      freePhagePfu: 25,
      dtMinutes: 0.2,
      bridge: BRIDGE,
    } as const;

    const first = sampleFreePhageAdsorptionsExact({
      ...args,
      rng: new SimulationRng(12345),
    });
    const second = sampleFreePhageAdsorptionsExact({
      ...args,
      rng: new SimulationRng(12345),
    });

    expect(second).toEqual(first);
    expect(first.adsorbedPfu).toBeGreaterThanOrEqual(0);
    expect(first.adsorbedPfu).toBeLessThanOrEqual(args.freePhagePfu);
    expect(first.remainingFreePhagePfu).toBe(
      args.freePhagePfu - first.adsorbedPfu,
    );
  });

  it("continues exactly from an RNG checkpoint", () => {
    const rng = new SimulationRng(90210);
    const args = {
      adsorptionConstantMlPerMin: 1.5e-9,
      hostBiomass: 2_000_000,
      freePhagePfu: 20,
      dtMinutes: 0.3,
      bridge: BRIDGE,
    } as const;

    sampleFreePhageAdsorptionsExact({ ...args, rng });
    const checkpoint = rng.snapshot();
    const continued = sampleFreePhageAdsorptionsExact({ ...args, rng });
    const restored = sampleFreePhageAdsorptionsExact({
      ...args,
      rng: new SimulationRng(checkpoint),
    });

    expect(restored).toEqual(continued);
  });

  it("does not consume RNG when adsorption probability is exactly zero", () => {
    const rng = new SimulationRng(77);
    const before = rng.snapshot();
    const result = sampleFreePhageAdsorptionsExact({
      adsorptionConstantMlPerMin: 2e-9,
      hostBiomass: 0,
      freePhagePfu: 10,
      dtMinutes: 1,
      bridge: BRIDGE,
      rng,
    });

    expect(result.adsorbedPfu).toBe(0);
    expect(result.remainingFreePhagePfu).toBe(10);
    expect(rng.snapshot()).toEqual(before);
  });

  it("rejects opportunistic fractional PFU counts in the exact sampler", () => {
    expect(() =>
      sampleFreePhageAdsorptionsExact({
        adsorptionConstantMlPerMin: 2e-9,
        hostBiomass: 100,
        freePhagePfu: 1.5,
        dtMinutes: 1,
        bridge: BRIDGE,
        rng: new SimulationRng(1),
      }),
    ).toThrow(RangeError);
  });

  it("requires explicit provenance and physical conversion assumptions", () => {
    expect(() =>
      validatePhageAdsorptionUnitBridge({
        ...BRIDGE,
        provenance: {
          classification: "transferred",
          sourceIds: [],
          note: "Missing source should fail.",
        },
      }),
    ).toThrow(TypeError);

    expect(() =>
      validatePhageAdsorptionUnitBridge({
        ...BRIDGE,
        interactionVolumeMl: 0,
      }),
    ).toThrow(RangeError);

    const restored = JSON.parse(JSON.stringify(BRIDGE)) as PhageAdsorptionUnitBridge;
    expect(() => validatePhageAdsorptionUnitBridge(restored)).not.toThrow();
    expect(biomassToCellEquivalentCount(20, restored)).toBe(10);
  });
});
