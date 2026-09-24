import { describe, expect, it } from "vitest";

import type {
  SurrogateBenchmarkEvidence,
  SurrogateCompatibilityIdentity,
  SurrogatePromotionRequirements,
} from "./benchmark";
import {
  checkSurrogateDomain,
  resolveExecutionMode,
  type ActiveSurrogateCompatibility,
  type SurrogateInput,
  type SurrogateModelCard,
} from "./runtime";

const compatibility: SurrogateCompatibilityIdentity = {
  schemaVersion: "surrogate-compatibility-v1",
  supportedScenarios: [
    { scenarioId: "selection-not-mutation", scenarioVersion: "1" },
    { scenarioId: "fitness-tradeoff", scenarioVersion: "2" },
  ],
  normalizationProfileId: "aggregate-normalization-v1",
  inputSchemaVersion: "aggregate-input-v1",
  targetSchemaVersion: "aggregate-target-v1",
};

const activeSelection: ActiveSurrogateCompatibility = {
  schemaVersion: "surrogate-compatibility-v1",
  scenarioId: "selection-not-mutation",
  scenarioVersion: "1",
  normalizationProfileId: "aggregate-normalization-v1",
  inputSchemaVersion: "aggregate-input-v1",
  targetSchemaVersion: "aggregate-target-v1",
};

const promotionRequirements: SurrogatePromotionRequirements = {
  splitPolicyVersion: "trajectory-group-v1",
  splitCoveragePolicyVersion: "held-out-group-coverage-v1",
  heldOutSplit: "test",
  targetIds: ["population"],
};

const promotionEvidence: SurrogateBenchmarkEvidence = {
  schemaVersion: "surrogate-benchmark-evidence-v3",
  modelId: "aggregate-baseline",
  modelVersion: "1",
  baselineId: "mean-by-scenario-v1",
  datasetVersion: "mechanistic-v1",
  engineVersion: "engine-a",
  compatibility,
  splitPolicyVersion: "trajectory-group-v1",
  splitCoveragePolicyVersion: "held-out-group-coverage-v1",
  heldOutSplit: "test",
  candidate: {
    population: { mae: 1, rmse: 1.2, count: 20 },
  },
  baseline: {
    population: { mae: 2, rmse: 2.4, count: 20 },
  },
};

const model: SurrogateModelCard = {
  modelId: "aggregate-baseline",
  modelVersion: "1",
  datasetVersion: "mechanistic-v1",
  engineVersion: "engine-a",
  compatibility,
  promotionStatus: "validated",
  promotionEvidence,
  promotionRequirements,
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

function resolve(
  overrides: Partial<Parameters<typeof resolveExecutionMode>[0]> = {},
) {
  return resolveExecutionMode({
    requested: "emulated",
    activeEngineVersion: "engine-a",
    activeCompatibility: activeSelection,
    emulatedFeatureEnabled: true,
    model,
    input: inDomain,
    ...overrides,
  });
}

describe("surrogate runtime safety gates", () => {
  it("always permits explicit mechanistic execution", () => {
    expect(
      resolveExecutionMode({
        requested: "mechanistic",
        activeEngineVersion: "engine-a",
        emulatedFeatureEnabled: false,
        model: {
          modelId: model.modelId,
          modelVersion: model.modelVersion,
          datasetVersion: model.datasetVersion,
          engineVersion: model.engineVersion,
          compatibility: model.compatibility,
          promotionStatus: "experimental",
          domain: model.domain,
        },
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

  it("requires runtime compatibility only when Emulated mode is requested", () => {
    expect(
      resolveExecutionMode({
        requested: "emulated",
        activeEngineVersion: "engine-a",
        emulatedFeatureEnabled: true,
        model,
        input: inDomain,
      }),
    ).toMatchObject({
      mode: "mechanistic",
      requested: "emulated",
      refusalReason: "runtime-compatibility-missing",
    });
  });

  it("keeps Emulated mode behind an explicit feature flag", () => {
    expect(resolve({ emulatedFeatureEnabled: false })).toMatchObject({
      mode: "mechanistic",
      requested: "emulated",
      refusalReason: "feature-disabled",
    });
  });

  it("refuses experimental/unpromoted models", () => {
    expect(
      resolve({
        model: {
          modelId: model.modelId,
          modelVersion: model.modelVersion,
          datasetVersion: model.datasetVersion,
          engineVersion: model.engineVersion,
          compatibility: model.compatibility,
          promotionStatus: "experimental",
          domain: model.domain,
        },
      }),
    ).toMatchObject({
      mode: "mechanistic",
      requested: "emulated",
      refusalReason: "model-not-promoted",
    });
  });

  it("refuses a model trained against a different engine version", () => {
    expect(resolve({ activeEngineVersion: "engine-b" })).toMatchObject({
      mode: "mechanistic",
      requested: "emulated",
      refusalReason: "engine-version-mismatch",
    });
  });

  it("refuses the same scenario id under an unsupported scenario version", () => {
    expect(
      resolve({
        activeCompatibility: {
          ...activeSelection,
          scenarioVersion: "2",
        },
      }),
    ).toMatchObject({
      mode: "mechanistic",
      requested: "emulated",
      refusalReason: "scenario-compatibility-mismatch",
    });
  });

  it("refuses normalization-profile mismatches even when numeric inputs are in range", () => {
    expect(
      resolve({
        activeCompatibility: {
          ...activeSelection,
          normalizationProfileId: "aggregate-normalization-v2",
        },
      }),
    ).toMatchObject({
      mode: "mechanistic",
      requested: "emulated",
      refusalReason: "normalization-profile-mismatch",
    });
  });

  it("refuses input and target schema mismatches explicitly", () => {
    expect(
      resolve({
        activeCompatibility: {
          ...activeSelection,
          inputSchemaVersion: "aggregate-input-v2",
        },
      }),
    ).toMatchObject({
      mode: "mechanistic",
      refusalReason: "input-schema-mismatch",
    });

    expect(
      resolve({
        activeCompatibility: {
          ...activeSelection,
          targetSchemaVersion: "aggregate-target-v2",
        },
      }),
    ).toMatchObject({
      mode: "mechanistic",
      refusalReason: "target-schema-mismatch",
    });
  });

  it("fails closed when the compatibility schema version changes", () => {
    const incompatible = {
      ...activeSelection,
      schemaVersion: "surrogate-compatibility-v2",
    } as unknown as ActiveSurrogateCompatibility;

    expect(resolve({ activeCompatibility: incompatible })).toMatchObject({
      mode: "mechanistic",
      refusalReason: "compatibility-schema-mismatch",
    });
  });

  it("allows an explicitly declared second scenario/version pair", () => {
    expect(
      resolve({
        activeCompatibility: {
          ...activeSelection,
          scenarioId: "fitness-tradeoff",
          scenarioVersion: "2",
        },
        input: {
          ...inDomain,
          categorical: { scenarioId: "fitness-tradeoff" },
        },
      }),
    ).toMatchObject({
      mode: "emulated",
      requested: "emulated",
      modelId: "aggregate-baseline",
    });
  });

  it("refuses benchmark evidence bound to a different compatibility identity", () => {
    const decision = resolve({
      model: {
        ...model,
        promotionEvidence: {
          ...promotionEvidence,
          compatibility: {
            ...compatibility,
            normalizationProfileId: "aggregate-normalization-v0",
          },
        },
      },
    });

    expect(decision).toMatchObject({
      mode: "mechanistic",
      requested: "emulated",
      refusalReason: "promotion-evidence-invalid",
    });
    if (
      decision.mode === "mechanistic" &&
      decision.requested === "emulated" &&
      decision.refusalReason === "promotion-evidence-invalid"
    ) {
      expect(decision.promotionIssues?.map((issue) => issue.kind)).toContain(
        "compatibility-mismatch",
      );
    }
  });

  it("refuses stale or non-promotable benchmark evidence", () => {
    const decision = resolve({
      model: {
        ...model,
        promotionEvidence: {
          ...promotionEvidence,
          candidate: {
            population: { mae: 2, rmse: 2.4, count: 20 },
          },
        },
      },
    });

    expect(decision).toMatchObject({
      mode: "mechanistic",
      requested: "emulated",
      refusalReason: "promotion-evidence-invalid",
    });
    if (
      decision.mode === "mechanistic" &&
      decision.requested === "emulated" &&
      decision.refusalReason === "promotion-evidence-invalid"
    ) {
      expect(decision.promotionIssues?.map((issue) => issue.kind)).toContain(
        "baseline-not-beaten",
      );
    }
  });

  it("refuses out-of-domain inputs instead of silently extrapolating", () => {
    const decision = resolve({
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
    expect(resolve()).toEqual({
      mode: "emulated",
      requested: "emulated",
      modelId: "aggregate-baseline",
      modelVersion: "1",
      violations: [],
    });
  });
});
