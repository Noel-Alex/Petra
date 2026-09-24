import { describe, expect, it } from "vitest";

import { resolveSourceUncertaintyPresentation } from "./uncertainty";

describe("source uncertainty presentation", () => {
  it("keeps reported statistical meanings distinct", () => {
    expect(
      resolveSourceUncertaintyPresentation({
        kind: "standard-deviation",
        scope: "measurement",
        quantityLabel: "Relative fitness",
        value: 0.03,
        unit: "dimensionless",
        supportingText: "6 independent competition experiments",
      }),
    ).toEqual({
      scope: "measurement",
      kind: "standard-deviation",
      label: "Measurement uncertainty · Relative fitness",
      value:
        "SD 0.03 dimensionless · 6 independent competition experiments",
      ariaText:
        "Measurement uncertainty · Relative fitness: SD 0.03 dimensionless · 6 independent competition experiments",
    });

    expect(
      resolveSourceUncertaintyPresentation({
        kind: "standard-error",
        scope: "measurement",
        quantityLabel: "Growth rate",
        value: 0.1,
        unit: "1/h",
      }).value,
    ).toBe("SE 0.1 1/h");

    expect(
      resolveSourceUncertaintyPresentation({
        kind: "confidence-interval",
        scope: "measurement",
        quantityLabel: "MIC",
        confidenceLevelPercent: 95,
        lower: 0.01,
        upper: 0.02,
        unit: "mg/L",
      }).value,
    ).toBe("95% CI 0.01–0.02 mg/L");

    expect(
      resolveSourceUncertaintyPresentation({
        kind: "range",
        scope: "calibration",
        quantityLabel: "Accepted target",
        lower: -1,
        upper: 2,
      }),
    ).toMatchObject({
      label: "Calibration uncertainty · Accepted target",
      value: "Range -1–2",
    });
  });

  it("preserves a source-reported ordinal margin without calling it a range", () => {
    const resolved = resolveSourceUncertaintyPresentation({
      kind: "reported-margin",
      scope: "measurement",
      quantityLabel: "Ciprofloxacin MIC",
      plusMinus: 1,
      unit: "half-doubling step",
    });

    expect(resolved.value).toBe("Reported margin ±1 half-doubling step");
    expect(resolved.value).not.toMatch(/CI|range/i);
  });

  it("makes an explicit not-quantified state visible without inventing precision", () => {
    const resolved = resolveSourceUncertaintyPresentation({
      kind: "not-quantified",
      scope: "transfer",
      quantityLabel: "Cross-study transfer",
    });

    expect(resolved).toMatchObject({
      label: "Transfer uncertainty · Cross-study transfer",
      value: "Not quantified in selected source.",
    });
    expect(resolved.ariaText).not.toMatch(/confidence score|% confidence/i);
  });

  it("fails closed on malformed numeric bounds and metadata", () => {
    expect(() =>
      resolveSourceUncertaintyPresentation({
        kind: "standard-deviation",
        scope: "measurement",
        quantityLabel: "Fitness",
        value: -0.1,
      }),
    ).toThrow(/must be non-negative/);

    expect(() =>
      resolveSourceUncertaintyPresentation({
        kind: "confidence-interval",
        scope: "measurement",
        quantityLabel: "Fitness",
        confidenceLevelPercent: 95,
        lower: 2,
        upper: 1,
      }),
    ).toThrow(/lower bound cannot exceed upper bound/);

    expect(() =>
      resolveSourceUncertaintyPresentation({
        kind: "confidence-interval",
        scope: "measurement",
        quantityLabel: "Fitness",
        confidenceLevelPercent: 100,
        lower: 1,
        upper: 2,
      }),
    ).toThrow(/greater than 0 and less than 100/);

    expect(() =>
      resolveSourceUncertaintyPresentation({
        kind: "range",
        scope: "model",
        quantityLabel: " ",
        lower: 1,
        upper: 2,
      }),
    ).toThrow(/quantityLabel must be a trimmed non-empty string/);

    expect(() =>
      resolveSourceUncertaintyPresentation({
        kind: "standard-error",
        scope: "measurement",
        quantityLabel: "Fitness",
        value: Number.NaN,
      }),
    ).toThrow(/must be finite/);
  });
});
