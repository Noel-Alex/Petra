import { describe, expect, it } from "vitest";

import {
  checkSurrogateDomain,
  resolveExecutionMode,
  type SurrogateInput,
  type SurrogateModelCard,
} from "./runtime";

const model: SurrogateModelCard = {
  modelId: "aggregate-baseline",
  modelVersion: "1",
  datasetVersion: "mechanistic-v1",
  engineVersion: "engine-a",
  promotionStatus: "validated",
  domain: {
    numeric: {
      initialPopulation: { minimum: 10, maximum: 1_000_000 },
      horizonHours: { minimum: 0.1, maximum: 24 },
    },
    categorical: {
      scenarioId: ["selection-not-mutation", "fitness-tradeoff"],
    },
  },
};

const inDomain: SurrogateInput = {
  numeric: {
    initialPopulation: 1000,
    horizonHours: 4,
  },
  categorical: {
    scenarioId: "selection-not-mutation",
  },
};

describe("surrogate runtime safety gates", () => {
  it("always permits explicit mechanistic execution", () => {
    expect(
      resolveExecutionMode({
        requested: "mechanistic",
        activeEngineVersion: "engine-a",
        emulatedFeatureEnabled: false,
        model: { ...model, promotionStatus: "experimental" },
        input: {
          numeric: { initialPopulation: Number.NaN },
          categorical: { scenarioId: "unknown" },
        },
      }),
    ).toEqual({
      mode: "mechanistic",
      requested: "mechanistic",
      violations: [],
    });
  });

  it("keeps Emulated mode behind an explicit feature flag", () => {
    expect(
      resolveExecutionMode({
        requested: "emulated",
        activeEngineVersion: "engine-a",
        emulatedFeatureEnabled: false,
        model,
        input: inDomain,
      }),
    ).toMatchObject({
      mode: "mechanistic",
      requested: "emulated",
      refusalReason: "feature-disabled",
    });
  });

  it("refuses experimental/unpromoted models", () => {
    expect(
      resolveExecutionMode({
        requested: "emulated",
        activeEngineVersion: "engine-a",
        emulatedFeatureEnabled: true,
        model: { ...model, promotionStatus: "experimental" },
        input: inDomain,
      }),
    ).toMatchObject({
      mode: "mechanistic",
      requested: "emulated",
      refusalReason: "model-not-promoted",
    });
  });

  it("refuses a model trained against a different engine version", () => {
    expect(
      resolveExecutionMode({
        requested: "emulated",
        activeEngineVersion: "engine-b",
        emulatedFeatureEnabled: true,
        model,
        input: inDomain,
      }),
    ).toMatchObject({
      mode: "mechanistic",
      requested: "emulated",
      refusalReason: "engine-version-mismatch",
    });
  });

  it("refuses out-of-domain inputs instead of silently extrapolating", () => {
    const decision = resolveExecutionMode({
      requested: "emulated",
      activeEngineVersion: "engine-a",
      emulatedFeatureEnabled: true,
      model,
      input: {
        numeric: {
          initialPopulation: 5_000_000,
          horizonHours: 4,
        },
        categorical: {
          scenarioId: "unseen-scenario",
        },
      },
    });

    expect(decision.mode).toBe("mechanistic");
    expect(decision.requested).toBe("emulated");
    if (decision.requested === "emulated" && decision.mode === "mechanistic") {
      expect(decision.refusalReason).toBe("out-of-domain");
      expect(decision.violations.map((item) => item.kind)).toEqual([
        "numeric-out-of-range",
        "categorical-out-of-domain",
      ]);
    }
  });

  it("accepts only complete declared input contracts", () => {
    expect(checkSurrogateDomain(inDomain, model.domain)).toEqual([]);

    expect(
      checkSurrogateDomain(
        {
          numeric: {
            initialPopulation: 1000,
            horizonHours: 4,
            mystery: 1,
          },
          categorical: {
            scenarioId: "selection-not-mutation",
          },
        },
        model.domain,
      ).map((item) => item.kind),
    ).toContain("unknown-numeric");
  });

  it("allows Emulated mode only after every safety gate passes", () => {
    expect(
      resolveExecutionMode({
        requested: "emulated",
        activeEngineVersion: "engine-a",
        emulatedFeatureEnabled: true,
        model,
        input: inDomain,
      }),
    ).toEqual({
      mode: "emulated",
      requested: "emulated",
      modelId: "aggregate-baseline",
      modelVersion: "1",
      violations: [],
    });
  });
});
