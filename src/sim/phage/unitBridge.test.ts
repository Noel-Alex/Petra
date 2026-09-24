import { describe, expect, it } from "vitest";

import { SimulationRng } from "../rng";
import { resolveT4Transport } from "./transport";
import {
  PHAGE_SPATIAL_UNIT_BRIDGE_SCHEMA_VERSION,
  adsorptionHazardPerPfuPerMinute,
  adsorptionProbabilityOverMinutes,
  diffusionCoefficientGridCellsSquaredPerMinute,
  effectiveLayerThicknessMeters,
  freePhageConcentrationPfuPerMl,
  hostConcentrationCellEquivalentsPerMl,
  modelBiomassToCellEquivalents,
  phageSpatialUnitBridgeIdentity,
  resolvePhageAdsorptionExposure,
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
