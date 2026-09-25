import { describe, expect, it } from "vitest";

import { ComposedSimulationEngine } from "../sim/composedEngine";
import { buildFlagshipComposedRunPlan } from "../sim/flagshipComposition";
import {
  projectRuntimeEcologyNetGrowthField,
  projectRuntimeEcologyRateFields,
} from "./runtimeEcologyRenderField";

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

describe("runtime ecology render fields", () => {
  it("projects one coherent rate-field bundle only from the exact snapshot and runtime branch", () => {
    const plan = buildFlagshipComposedRunPlan(initialization);
    const engine = new ComposedSimulationEngine(plan.identity, plan.config);
    const snapshot = engine.execute({ id: "advance", type: "advance", ticks: 1 });
    if (
      snapshot.checkpoint.authority !== "composed" ||
      snapshot.ecologyObservation === undefined
    ) {
      throw new Error("expected composed step-local ecology observation");
    }

    const bound = {
      runBranchIdentity: "branch-0",
      envelope: snapshot.ecologyObservation,
    };
    const fields = projectRuntimeEcologyRateFields(
      snapshot,
      "branch-0",
      bound,
    );

    expect(fields.map((field) => field.kind)).toEqual([
      "net-growth",
      "division-rate",
      "death-rate",
    ]);
    for (const field of fields) {
      expect(field).toMatchObject({
        unit: "model-biomass/hour",
        rangeMode: "snapshot-extrema",
        width: snapshot.checkpoint.composedState.width,
        height: snapshot.checkpoint.composedState.height,
      });
      expect(field.values.length).toBe(
        snapshot.checkpoint.composedState.width *
          snapshot.checkpoint.composedState.height,
      );
    }

    expect(
      projectRuntimeEcologyNetGrowthField(snapshot, "branch-0", bound),
    ).toMatchObject({ kind: "net-growth" });
  });

  it("fails closed across branch/state positions and stays atomically absent without step evidence", () => {
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
      projectRuntimeEcologyRateFields(observed, "branch-1", bound),
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
      projectRuntimeEcologyRateFields(later, "branch-0", bound),
    ).toThrow(/observation position/i);

    expect(
      projectRuntimeEcologyRateFields(later, "branch-0", null),
    ).toEqual([]);
    expect(
      projectRuntimeEcologyNetGrowthField(later, "branch-0", null),
    ).toBeNull();
  });
});
