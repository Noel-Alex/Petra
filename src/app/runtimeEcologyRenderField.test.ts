import { describe, expect, it } from "vitest";

import { ComposedSimulationEngine } from "../sim/composedEngine";
import { buildFlagshipComposedRunPlan } from "../sim/flagshipComposition";
import { projectRuntimeEcologyNetGrowthField } from "./runtimeEcologyRenderField";

const initialization = Object.freeze({
  seed: 0x605,
  initialResourceLevel: 8,
  inocula: Object.freeze([
    Object.freeze({
      lineageId: "founder-wt",
      x: 80,
      y: 80,
      biomass: 1,
    }),
  ]),
});

describe("runtime ecology render field", () => {
  it("projects only an observation bound to the exact snapshot and runtime branch", () => {
    const plan = buildFlagshipComposedRunPlan(initialization);
    const engine = new ComposedSimulationEngine(plan.identity, plan.config);
    const snapshot = engine.execute({ id: "advance", type: "advance", ticks: 1 });
    if (
      snapshot.checkpoint.authority !== "composed" ||
      snapshot.ecologyObservation === undefined
    ) {
      throw new Error("expected composed step-local ecology observation");
    }

    const field = projectRuntimeEcologyNetGrowthField(
      snapshot,
      "branch-0",
      {
        runBranchIdentity: "branch-0",
        envelope: snapshot.ecologyObservation,
      },
    );

    expect(field).toMatchObject({
      kind: "net-growth",
      unit: "model-biomass/hour",
      rangeMode: "snapshot-extrema",
      width: snapshot.checkpoint.composedState.width,
      height: snapshot.checkpoint.composedState.height,
    });
    expect(field?.values.length).toBe(
      snapshot.checkpoint.composedState.width *
        snapshot.checkpoint.composedState.height,
    );
  });

  it("fails closed across branch/state positions and stays absent without step evidence", () => {
    const plan = buildFlagshipComposedRunPlan(initialization);
    const engine = new ComposedSimulationEngine(plan.identity, plan.config);
    const observed = engine.execute({ id: "advance", type: "advance", ticks: 1 });
    if (
      observed.checkpoint.authority !== "composed" ||
      observed.ecologyObservation === undefined
    ) {
      throw new Error("expected composed step-local ecology observation");
    }
    const bound = {
      runBranchIdentity: "branch-0",
      envelope: observed.ecologyObservation,
    };

    expect(() =>
      projectRuntimeEcologyNetGrowthField(observed, "branch-1", bound),
    ).toThrow(/different runtime history generation/);

    const later = engine.execute({
      id: "dose",
      type: "apply-ciprofloxacin",
      intervention: {
        schemaVersion: 1,
        concentrationMgPerL: 0,
        concentrationUnit: "mg/L",
        blendMode: "set",
        geometry: { kind: "global" },
      },
    });
    expect(() =>
      projectRuntimeEcologyNetGrowthField(later, "branch-0", bound),
    ).toThrow(/observation position/i);

    expect(
      projectRuntimeEcologyNetGrowthField(later, "branch-0", null),
    ).toBeNull();
  });
});
