import { describe, expect, it } from "vitest";

import { PROTOCOL_VERSION } from "../sim/protocol";
import type { AuthoritativeRegionInspection } from "../sim/regionInspector";
import {
  acceptRegionInspection,
  activeSelectionId,
  beginRegionInspection,
  clearRegionInspection,
  failRegionInspection,
  unavailableRegionInspector,
  visibleReadout,
} from "./regionInspectorState";

const runIdentityFixture = {
  engineVersion: "petra-ts-core/0.1.0",
  protocolVersion: PROTOCOL_VERSION,
  scenarioId: "region-inspector-ui",
  scenarioVersion: "1",
  parameterSetId: "fixture:region-inspector-ui",
  parameterSetVersion: "1",
  parameterSetBinding: {
    schemaVersion: 1,
    authority: "fixture",
    parameterSetId: "fixture:region-inspector-ui",
    parameterSetVersion: "1",
    configurationFingerprint: "config-fingerprint-v1",
  },
  seed: 17,
} as const;

function readout(
  selectionId: string,
  stateVersion = 1,
): AuthoritativeRegionInspection {
  return {
    kind: "measured",
    selectionId,
    stateVersion,
    configurationFingerprint: "config-v1",
    runIdentity: runIdentityFixture,
    tick: 3,
    simulationTimeHours: 0.03,
    commandCount: 2,
    selectedCellCount: 1,
    totalBiomass: 4,
    totalResource: 3,
    biomassUnit: "model-biomass",
    resourceUnit: "model-resource",
    lineageBiomass: [
      {
        lineageId: "ancestor",
        genotypeId: "WT",
        biomass: 4,
        fractionOfRegionBiomass: 1,
      },
    ],
  };
}

function noCoverage(
  selectionId: string,
  stateVersion = 1,
): AuthoritativeRegionInspection {
  return {
    kind: "no-grid-coverage",
    selectionId,
    stateVersion,
    configurationFingerprint: "config-v1",
    runIdentity: runIdentityFixture,
    tick: 3,
    simulationTimeHours: 0.03,
    commandCount: 2,
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

  it("preserves explicit no-grid-coverage as an authoritative result across stale-safe state", () => {
    let state = beginRegionInspection(
      unavailableRegionInspector("No region selected."),
      "region-empty",
    );
    state = acceptRegionInspection(state, noCoverage("region-empty")).state;

    expect(state.status).toBe("ready");
    expect(visibleReadout(state)).toMatchObject({
      kind: "no-grid-coverage",
      selectionId: "region-empty",
    });

    state = beginRegionInspection(state, "region-next");
    expect(state.status).toBe("stale");
    expect(activeSelectionId(state)).toBe("region-next");
    expect(visibleReadout(state)).toMatchObject({
      kind: "no-grid-coverage",
      selectionId: "region-empty",
    });
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
