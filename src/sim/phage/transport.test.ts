import { describe, expect, it } from "vitest";

import {
  T4_TRANSPORT_EVIDENCE,
  resolveT4Transport,
} from "./transport";

describe("T4 matrix-specific transport calibration", () => {
  it("preserves the measured Hu transport anchors", () => {
    expect(T4_TRANSPORT_EVIDENCE.schemaVersion).toBe(2);
    expect(
      T4_TRANSPORT_EVIDENCE.measurements.map((measurement) => [
        measurement.id,
        measurement.apparentDiffusionCoefficientM2PerS,
      ]),
    ).toEqual([
      ["hu2010-water-filter-paper", 2.8e-11],
      ["hu2012-agarose-0.5-no-host", 4.2e-12],
      ["hu2012-agarose-0.5-dead-k12", 2.4e-12],
    ]);
  });

  it("resolves only the selected 0.5% host-free agarose Petra context", () => {
    const resolution = resolveT4Transport({
      material: "agarose",
      agarosePercent: 0.5,
      embeddedHostCondition: "none",
    });

    expect(resolution.status).toBe("calibrated");
    if (resolution.status !== "calibrated") return;

    expect(resolution.evidenceClass).toBe("transferred");
    expect(resolution.diffusionCoefficientM2PerS).toBe(4.2e-12);
    expect(resolution.sourceMeasurement.classification).toBe("measured");
    expect(resolution.sourceMeasurement.id).toBe(
      "hu2012-agarose-0.5-no-host",
    );
    expect(resolution.calibration.freePhageLoss.status).toBe("unbound");
    expect(resolution.calibration.livingHostTransport).toMatchObject({
      status: "out-of-domain",
      evidenceClass: null,
    });
  });

  it("refuses to reuse the baseline inside living host-bearing regions", () => {
    const resolution = resolveT4Transport({
      material: "agarose",
      agarosePercent: 0.5,
      embeddedHostCondition: "living",
    });

    expect(resolution).toMatchObject({
      status: "out-of-domain",
      evidenceClass: null,
      reasons: ["embedded-host-condition"],
    });
    expect(
      resolution.calibration.livingHostTransport.basisSourceKeys,
    ).toEqual([
      "hu_2012_t4_biofilm_diffusion",
      "lisac_2022_t4_mg1655_biofilm",
      "lisac_podgornik_2025_t4_starvation",
    ]);
  });

  it("refuses other agarose concentrations rather than extrapolating", () => {
    const resolution = resolveT4Transport({
      material: "agarose",
      agarosePercent: 1,
      embeddedHostCondition: "none",
    });

    expect(resolution).toMatchObject({
      status: "out-of-domain",
      reasons: ["agarose-concentration"],
    });
  });

  it("refuses liquid transport even though a water comparison anchor exists", () => {
    const resolution = resolveT4Transport({
      material: "water",
      agarosePercent: null,
      embeddedHostCondition: "none",
    });

    expect(resolution).toMatchObject({
      status: "out-of-domain",
      reasons: ["matrix-material", "agarose-concentration"],
    });
  });

  it("keeps dead-host adsorption-confounded transport as evidence, not the Petra baseline", () => {
    const deadHost = T4_TRANSPORT_EVIDENCE.measurements.find(
      (measurement) =>
        measurement.id === "hu2012-agarose-0.5-dead-k12",
    );
    expect(deadHost?.apparentDiffusionCoefficientM2PerS).toBe(2.4e-12);

    const resolution = resolveT4Transport({
      material: "agarose",
      agarosePercent: 0.5,
      embeddedHostCondition: "dead-escherichia-coli-k12",
    });
    expect(resolution.status).toBe("out-of-domain");
  });
});
