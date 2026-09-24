import { describe, expect, it } from "vitest";

import { SimulationRng } from "../rng";
import {
  SAMPLING_EXECUTION_POLICY_SCHEMA_VERSION,
  SamplingPolicyRefusalError,
  type SamplingExecutionPolicy,
} from "../samplingPolicy";
import { resolveT4Transport } from "./transport";
import {
  PHAGE_SPATIAL_UNIT_BRIDGE_SCHEMA_VERSION,
  adsorptionHazardPerPfuPerMinute,
  cellEquivalentCalibrationFromPhageSpatialUnitBridge,
  adsorptionProbabilityOverMinutes,
  diffusionCoefficientGridCellsSquaredPerMinute,
  effectiveLayerThicknessMeters,
  freePhageConcentrationPfuPerMl,
  hostConcentrationCellEquivalentsPerMl,
  modelBiomassToCellEquivalents,
  phageSpatialUnitBridgeIdentity,
  resolvePhageAdsorptionExposure,
  sampleAdsorbedPfuWithPolicy,
  sampleExactAdsorbedPfu,
  validatePhageSpatialUnitBridge,
  type PhageSpatialUnitBridge,
  type PhysicalUnitParameter,
} from "./unitBridge";

function parameter(
  value: number,
  classification: "transferred" | "calibrated" | "engineering" = "engineering",
  sourceKeys: readonly string[] = [],
): PhysicalUnitParameter {
  return {
    value,
    provenance: {
      classification,
      sourceKeys,
      limitation: "synthetic arithmetic fixture only",
    },
  };
}

function bridge(): PhageSpatialUnitBridge {
  return {
    schemaVersion: PHAGE_SPATIAL_UNIT_BRIDGE_SCHEMA_VERSION,
    id: "synthetic-test-bridge",
    modelBiomassPerCellEquivalent: parameter(2),
    effectiveInteractionVolumeMl: parameter(0.5),
    gridCellPitchMeters: parameter(1e-3),
  };
}

describe("phage spatial unit bridge", () => {
  it("rejects invalid physical conversion scales and missing provenance", () => {
    for (const key of [
      "modelBiomassPerCellEquivalent",
      "effectiveInteractionVolumeMl",
      "gridCellPitchMeters",
    ] as const) {
      expect(() =>
        validatePhageSpatialUnitBridge({
          ...bridge(),
          [key]: parameter(0),
        }),
      ).toThrow(/finite and positive/);
    }

    expect(() =>
      validatePhageSpatialUnitBridge({
        ...bridge(),
        effectiveInteractionVolumeMl: parameter(0.5, "transferred"),
      }),
    ).toThrow(/requires source keys/);
  });

  it("canonicalizes replay identity and changes when a conversion changes", () => {
    const first = bridge();
    const withSourcesA: PhageSpatialUnitBridge = {
      ...first,
      modelBiomassPerCellEquivalent: parameter(
        2,
        "transferred",
        ["source-b", "source-a"],
      ),
    };
    const withSourcesB: PhageSpatialUnitBridge = {
      ...first,
      modelBiomassPerCellEquivalent: parameter(
        2,
        "transferred",
        ["source-a", "source-b"],
      ),
    };

    expect(phageSpatialUnitBridgeIdentity(withSourcesA)).toBe(
      phageSpatialUnitBridgeIdentity(withSourcesB),
    );

    expect(
      phageSpatialUnitBridgeIdentity({
        ...withSourcesB,
        effectiveInteractionVolumeMl: parameter(0.25),
      }),
    ).not.toBe(phageSpatialUnitBridgeIdentity(withSourcesB));
  });

  it("projects the exact biomass-per-cell calibration into shared population authority", () => {
    const projected =
      cellEquivalentCalibrationFromPhageSpatialUnitBridge(bridge());

    expect(projected.id).toBe(
      "synthetic-test-bridge/model-biomass-cell-equivalent",
    );
    expect(projected.modelBiomassPerCellEquivalent).toBe(2);
    expect(projected.provenance).toEqual(
      bridge().modelBiomassPerCellEquivalent.provenance,
    );
  });

  it("converts continuous model biomass without opportunistic rounding", () => {
    expect(modelBiomassToCellEquivalents(20, bridge())).toBe(10);
    expect(modelBiomassToCellEquivalents(5, bridge())).toBe(2.5);
    expect(hostConcentrationCellEquivalentsPerMl(20, bridge())).toBe(20);
    expect(freePhageConcentrationPfuPerMl(5, bridge())).toBe(10);
  });

  it("derives dimensionally valid adsorption exposure", () => {
    const exposure = resolvePhageAdsorptionExposure({
      adsorptionConstantMlPerMinute: 0.01,
      hostModelBiomass: 20,
      freePhagePfu: 5,
      durationMinutes: 1,
      bridge: bridge(),
    });

    expect(exposure.hostCellEquivalents).toBe(10);
    expect(exposure.hostConcentrationCellEquivalentsPerMl).toBe(20);
    expect(exposure.freePhageConcentrationPfuPerMl).toBe(10);
    expect(exposure.perPfuHazardPerMinute).toBeCloseTo(0.2, 14);
    expect(exposure.expectedAdsorptionRatePfuPerMinute).toBeCloseTo(1, 14);
    expect(exposure.adsorptionProbability).toBeCloseTo(
      0.18126924692201815,
      14,
    );
    expect(exposure.expectedAdsorbedPfu).toBeCloseTo(
      5 * exposure.adsorptionProbability,
      14,
    );
  });

  it("has exact zero limits for no adsorption exposure", () => {
    expect(
      adsorptionHazardPerPfuPerMinute({
        adsorptionConstantMlPerMinute: 0,
        hostModelBiomass: 20,
        bridge: bridge(),
      }),
    ).toBe(0);
    expect(
      adsorptionHazardPerPfuPerMinute({
        adsorptionConstantMlPerMinute: 0.01,
        hostModelBiomass: 0,
        bridge: bridge(),
      }),
    ).toBe(0);
    expect(adsorptionProbabilityOverMinutes(0.2, 0)).toBe(0);

    const noPhage = resolvePhageAdsorptionExposure({
      adsorptionConstantMlPerMinute: 0.01,
      hostModelBiomass: 20,
      freePhagePfu: 0,
      durationMinutes: 1,
      bridge: bridge(),
    });
    expect(noPhage.expectedAdsorptionRatePfuPerMinute).toBe(0);
    expect(noPhage.expectedAdsorbedPfu).toBe(0);
  });

  it("samples free-PFU adsorption deterministically and within bounds", () => {
    const a = sampleExactAdsorbedPfu(100, 0.2, new SimulationRng(2026));
    const b = sampleExactAdsorbedPfu(100, 0.2, new SimulationRng(2026));

    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThanOrEqual(100);
    expect(sampleExactAdsorbedPfu(7, 0, new SimulationRng(1))).toBe(0);
    expect(sampleExactAdsorbedPfu(7, 1, new SimulationRng(1))).toBe(7);
  });

  it("converts the curated host-free T4 transport coefficient through the same pitch", () => {
    const resolved = resolveT4Transport({
      material: "agarose",
      agarosePercent: 0.5,
      embeddedHostCondition: "none",
    });
    expect(resolved.status).toBe("calibrated");
    if (resolved.status !== "calibrated") throw new Error("expected calibration");

    const expected =
      (resolved.diffusionCoefficientM2PerS * 60) /
      (bridge().gridCellPitchMeters.value ** 2);
    expect(
      diffusionCoefficientGridCellsSquaredPerMinute(
        resolved.diffusionCoefficientM2PerS,
        bridge(),
      ),
    ).toBeCloseTo(expected, 14);
  });

  it("exposes the effective layer thickness implied by volume and pitch", () => {
    expect(effectiveLayerThicknessMeters(bridge())).toBeCloseTo(0.5, 14);
  });

  it("rejects non-discrete PFU state rather than rounding", () => {
    expect(() => freePhageConcentrationPfuPerMl(1.5, bridge())).toThrow(
      /safe integer/,
    );
    expect(() =>
      sampleExactAdsorbedPfu(1.5, 0.2, new SimulationRng(1)),
    ).toThrow(/safe integer/);
  });
});


function adsorptionSamplingPolicy(
  overrides: Partial<SamplingExecutionPolicy> = {},
): SamplingExecutionPolicy {
  return {
    schemaVersion: SAMPLING_EXECUTION_POLICY_SCHEMA_VERSION,
    id: "synthetic-phage-sampling-policy",
    exactTrialLimit: 100,
    acceleration: "exact-sparse-binomial-v1",
    maximumExpectedAcceleratedDraws: 2_000,
    maximumAcceleratedDraws: 4_000,
    ...overrides,
  };
}

describe("policy-bounded phage adsorption sampling", () => {
  it("preserves exact reference output and RNG state below the exact budget", () => {
    const directRng = new SimulationRng(44);
    const policyRng = new SimulationRng(44);
    const direct = sampleExactAdsorbedPfu(100, 0.2, directRng);
    const bounded = sampleAdsorbedPfuWithPolicy(
      100,
      0.2,
      policyRng,
      adsorptionSamplingPolicy(),
    );

    expect(bounded.adsorbedPfu).toBe(direct);
    expect(bounded.diagnostics.mode).toBe("exact-reference");
    expect(policyRng.snapshot()).toEqual(directRng.snapshot());
  });

  it("samples billion-PFU rare adsorption in bounded sparse work", () => {
    const freePfu = 1_000_000_000;
    const sample = sampleAdsorbedPfuWithPolicy(
      freePfu,
      1e-8,
      new SimulationRng(2026),
      adsorptionSamplingPolicy(),
    );

    expect(sample.diagnostics.mode).toBe("exact-sparse-binomial");
    expect(sample.diagnostics.rngDraws).toBeLessThan(100);
    expect(sample.adsorbedPfu).toBeGreaterThanOrEqual(0);
    expect(sample.adsorbedPfu).toBeLessThanOrEqual(freePfu);
  });

  it("preserves exact zero/one limits for large PFU counts", () => {
    const freePfu = 1_000_000_000;
    expect(
      sampleAdsorbedPfuWithPolicy(
        freePfu,
        0,
        new SimulationRng(1),
        adsorptionSamplingPolicy(),
      ).adsorbedPfu,
    ).toBe(0);
    expect(
      sampleAdsorbedPfuWithPolicy(
        freePfu,
        1,
        new SimulationRng(1),
        adsorptionSamplingPolicy(),
      ).adsorbedPfu,
    ).toBe(freePfu);
  });

  it("refuses unsupported large-count regimes without consuming caller RNG", () => {
    const rng = new SimulationRng(123);
    const before = rng.snapshot();

    expect(() =>
      sampleAdsorbedPfuWithPolicy(
        1_000_000,
        0.5,
        rng,
        adsorptionSamplingPolicy({
          maximumExpectedAcceleratedDraws: 100,
          maximumAcceleratedDraws: 200,
        }),
      ),
    ).toThrow(SamplingPolicyRefusalError);
    expect(rng.snapshot()).toEqual(before);
  });

  it("matches the exact reference distribution over deterministic seeds", () => {
    const freePfu = 300;
    const probability = 0.02;
    const seeds = 3_000;
    let exactTotal = 0;
    let acceleratedTotal = 0;
    let exactTail = 0;
    let acceleratedTail = 0;
    const acceleratedPolicy = adsorptionSamplingPolicy({ exactTrialLimit: 0 });

    for (let seed = 1; seed <= seeds; seed += 1) {
      const exact = sampleExactAdsorbedPfu(
        freePfu,
        probability,
        new SimulationRng(seed),
      );
      const accelerated = sampleAdsorbedPfuWithPolicy(
        freePfu,
        probability,
        new SimulationRng(seed),
        acceleratedPolicy,
      ).adsorbedPfu;
      exactTotal += exact;
      acceleratedTotal += accelerated;
      if (exact >= 11) exactTail += 1;
      if (accelerated >= 11) acceleratedTail += 1;
    }

    expect(
      Math.abs(acceleratedTotal / seeds - exactTotal / seeds),
    ).toBeLessThan(0.2);
    expect(
      Math.abs(acceleratedTail / seeds - exactTail / seeds),
    ).toBeLessThan(0.02);
  });
});
