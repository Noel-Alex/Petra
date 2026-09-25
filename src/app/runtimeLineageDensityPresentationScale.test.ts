import { describe, expect, it } from "vitest";

import { buildFlagshipComposedRunPlan } from "../sim/flagshipComposition";
import { createRunBranchIdentity } from "./runBranchIdentity";
import { projectRuntimeLineageDensityPresentationScale } from "./runtimeLineageDensityPresentationScale";

const initialization = {
  seed: 424242,
  initialResourceLevel: 8,
  inocula: [
    {
      lineageId: "founder-wt",
      x: 0.5,
      y: 0.5,
      radiusCells: 2,
      totalBiomass: 1,
    },
  ],
} as const;

describe("runtime lineage-density presentation scale", () => {
  it("binds localCapacity to exact model-biomass/config/branch authority", () => {
    const plan = buildFlagshipComposedRunPlan(initialization);
    const branch = createRunBranchIdentity(plan.identity, 0);
    const scale = projectRuntimeLineageDensityPresentationScale(
      plan.config,
      plan.identity,
      branch,
    );

    expect(scale.mode).toBe("source-owned-fixed");
    expect(scale.unit).toBe("model-biomass");
    expect(scale.maximum).toBe(plan.config.growth.localCapacity);
    expect(scale.overflowTolerance).toBeGreaterThan(0);
    expect(scale.sourceIdentity).toContain(
      plan.parameterSetBinding.configurationFingerprint,
    );
    expect(scale.sourceIdentity).toContain(branch);
  });

  it("preserves the denominator but rotates source identity across runtime branches", () => {
    const plan = buildFlagshipComposedRunPlan(initialization);
    const first = projectRuntimeLineageDensityPresentationScale(
      plan.config,
      plan.identity,
      createRunBranchIdentity(plan.identity, 0),
    );
    const second = projectRuntimeLineageDensityPresentationScale(
      plan.config,
      plan.identity,
      createRunBranchIdentity(plan.identity, 1),
    );

    expect(second.maximum).toBe(first.maximum);
    expect(second.overflowTolerance).toBe(first.overflowTolerance);
    expect(second.sourceIdentity).not.toBe(first.sourceIdentity);
  });

  it("fails closed when the named parameter binding does not own the supplied config", () => {
    const plan = buildFlagshipComposedRunPlan(initialization);
    const drifted = {
      ...plan.config,
      growth: {
        ...plan.config.growth,
        localCapacity: plan.config.growth.localCapacity * 2,
      },
    };

    expect(() =>
      projectRuntimeLineageDensityPresentationScale(
        drifted,
        plan.identity,
        createRunBranchIdentity(plan.identity, 0),
      ),
    ).toThrow(/configuration fingerprint does not match parameter-set binding/);
  });
});
