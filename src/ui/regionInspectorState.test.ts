import { describe, expect, it } from "vitest";

import type {
  AuthoritativeRegionInspection,
  AuthoritativeRegionReadout,
} from "../sim/regionInspector";
import {
  acceptRegionInspection,
  activeSelectionId,
  beginRegionInspection,
  clearRegionInspection,
  failRegionInspection,
  unavailableRegionInspector,
  visibleReadout,
} from "./regionInspectorState";

function readout(
  selectionId: string,
  stateVersion = 1,
): AuthoritativeRegionReadout {
  return {
    coverage: "covered",
    selectionId,
    stateVersion,
    configurationFingerprint: "config-v1",
    selectedCellCount: 1,
    totalBiomass: 4,
    totalResource: 3,
    biomassUnit: "model-biomass",
    resourceUnit: "model-resource",
    lineageBiomass: [
      {
        lineageId: "ancestor",
        biomass: 4,
        fractionOfRegionBiomass: 1,
      },
    ],
  };
}

function noGridCoverage(
  selectionId: string,
  stateVersion = 1,
): AuthoritativeRegionInspection {
  return {
    coverage: "no-grid-coverage",
    selectionId,
    stateVersion,
    configurationFingerprint: "config-v1",
    selectedCellCount: 0,
  };
}

describe("region inspector presentation state", () => {
  it("starts pending when no authoritative readout exists", () => {
    const state = beginRegionInspection(
      unavailableRegionInspector("Runtime unavailable."),
      "region-a",
    );

    expect(state).toEqual({
      status: "pending",
      selectionId: "region-a",
    });
    expect(visibleReadout(state)).toBeNull();
  });

  it("accepts no-grid coverage without exposing a scientific readout", () => {
    const pending = beginRegionInspection(
      unavailableRegionInspector("No region selected."),
      "region-empty",
    );

    const accepted = acceptRegionInspection(
      pending,
      noGridCoverage("region-empty", 2),
    );

    expect(accepted.accepted).toBe(true);
    expect(accepted.state).toEqual({
      status: "no-grid-coverage",
      selectionId: "region-empty",
      outcome: {
        coverage: "no-grid-coverage",
        selectionId: "region-empty",
        stateVersion: 2,
        configurationFingerprint: "config-v1",
        selectedCellCount: 0,
      },
    });
    expect(activeSelectionId(accepted.state)).toBe("region-empty");
    expect(visibleReadout(accepted.state)).toBeNull();
  });

  it("does not retain a no-grid outcome as stale scientific data", () => {
    const noCoverage = acceptRegionInspection(
      beginRegionInspection(
        unavailableRegionInspector("No region selected."),
        "region-empty",
      ),
      noGridCoverage("region-empty"),
    ).state;

    const next = beginRegionInspection(noCoverage, "region-next");

    expect(next).toEqual({
      status: "pending",
      selectionId: "region-next",
    });
    expect(visibleReadout(next)).toBeNull();
  });

  it("marks an old readout stale immediately when selection changes", () => {
    const ready = acceptRegionInspection(
      beginRegionInspection(
        unavailableRegionInspector("No region selected."),
        "region-a",
      ),
      readout("region-a"),
    ).state;

    const next = beginRegionInspection(ready, "region-b");

    expect(next.status).toBe("stale");
    expect(activeSelectionId(next)).toBe("region-b");
    expect(visibleReadout(next)?.selectionId).toBe("region-a");
  });

  it("ignores a late response for a superseded selection", () => {
    let state = beginRegionInspection(
      unavailableRegionInspector("No region selected."),
      "region-a",
    );
    state = beginRegionInspection(state, "region-b");

    const late = acceptRegionInspection(state, readout("region-a"));
    expect(late.accepted).toBe(false);
    expect(late.state).toBe(state);

    const current = acceptRegionInspection(state, readout("region-b", 2));
    expect(current.accepted).toBe(true);
    expect(current.state.status).toBe("ready");
    expect(visibleReadout(current.state)?.selectionId).toBe("region-b");
  });

  it("ignores a late no-grid outcome for a superseded selection", () => {
    let state = beginRegionInspection(
      unavailableRegionInspector("No region selected."),
      "region-a",
    );
    state = beginRegionInspection(state, "region-b");

    const late = acceptRegionInspection(
      state,
      noGridCoverage("region-a"),
    );

    expect(late.accepted).toBe(false);
    expect(late.state).toBe(state);
  });

  it("keeps any previous readout visibly stale when the current query fails", () => {
    let state = beginRegionInspection(
      unavailableRegionInspector("No region selected."),
      "region-a",
    );
    state = acceptRegionInspection(state, readout("region-a")).state;
    state = beginRegionInspection(state, "region-b");

    const failed = failRegionInspection(state, "region-b", "Query failed.");

    expect(failed.accepted).toBe(true);
    expect(failed.state).toMatchObject({
      status: "error",
      selectionId: "region-b",
      message: "Query failed.",
    });
    expect(visibleReadout(failed.state)?.selectionId).toBe("region-a");
  });

  it("ignores stale errors from superseded requests", () => {
    const state = beginRegionInspection(
      unavailableRegionInspector("No region selected."),
      "region-b",
    );

    const late = failRegionInspection(state, "region-a", "Old failure.");
    expect(late.accepted).toBe(false);
    expect(late.state).toBe(state);
  });

  it("clears scientific readout explicitly", () => {
    const cleared = clearRegionInspection();
    expect(cleared).toEqual({
      status: "unavailable",
      reason: "No region selected.",
    });
    expect(activeSelectionId(cleared)).toBeNull();
    expect(visibleReadout(cleared)).toBeNull();
  });

  it("rejects blank request/error identities", () => {
    expect(() =>
      beginRegionInspection(
        unavailableRegionInspector("Unavailable."),
        "   ",
      ),
    ).toThrow(/selectionId/);

    const state = beginRegionInspection(
      unavailableRegionInspector("Unavailable."),
      "region-a",
    );
    expect(() => failRegionInspection(state, "region-a", " ")).toThrow(
      /error message/,
    );
  });
});
