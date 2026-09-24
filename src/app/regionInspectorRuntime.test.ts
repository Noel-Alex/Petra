import { describe, expect, it } from "vitest";

import type { AuthoritativeRegionInspection } from "../sim/regionInspector";
import {
  acceptRegionInspectionQueryResult,
  beginRegionInspectionQuery,
  clearRegionInspectorRuntime,
  createRegionInspectorRuntimeState,
  failRegionInspectionQuery,
} from "./regionInspectorRuntime";

function readout(
  selectionId: string,
  stateVersion = 1,
): AuthoritativeRegionInspection {
  return {
    kind: "measured",
    selectionId,
    stateVersion,
    configurationFingerprint: `config-v${stateVersion}`,
    selectedCellCount: 2,
    totalBiomass: 5,
    totalResource: 7,
    biomassUnit: "model-biomass",
    resourceUnit: "model-resource",
    lineageBiomass: [
      {
        lineageId: "ancestor",
        biomass: 5,
        fractionOfRegionBiomass: 1,
      },
    ],
  };
}

const selectionA = {
  id: "region-a",
  centerX: 0.4,
  centerY: 0.5,
  radius: 0.1,
} as const;

describe("region inspector runtime coordinator", () => {
  it("emits monotonic request identity independently of selection identity", () => {
    const initial = createRegionInspectorRuntimeState();
    const first = beginRegionInspectionQuery(initial, selectionA);
    const second = beginRegionInspectionQuery(first.state, selectionA);

    expect(first.request.requestId).toBe(1);
    expect(second.request.requestId).toBe(2);
    expect(first.request.selection.id).toBe("region-a");
    expect(second.request.selection.id).toBe("region-a");
    expect(second.state.presentation).toEqual({
      status: "pending",
      selectionId: "region-a",
    });
  });

  it("rejects an older response when the same selection was re-queried", () => {
    const first = beginRegionInspectionQuery(
      createRegionInspectorRuntimeState(),
      selectionA,
    );
    const second = beginRegionInspectionQuery(first.state, selectionA);

    const late = acceptRegionInspectionQueryResult(second.state, {
      requestId: first.request.requestId,
      readout: readout("region-a", 1),
    });

    expect(late.accepted).toBe(false);
    expect(late.state).toBe(second.state);

    const current = acceptRegionInspectionQueryResult(second.state, {
      requestId: second.request.requestId,
      readout: readout("region-a", 2),
    });

    expect(current.accepted).toBe(true);
    expect(current.state.activeRequest).toBeNull();
    expect(current.state.presentation).toMatchObject({
      status: "ready",
      selectionId: "region-a",
      readout: {
        stateVersion: 2,
      },
    });
  });

  it("keeps the prior authoritative readout explicitly stale while a new selection is pending", () => {
    const first = beginRegionInspectionQuery(
      createRegionInspectorRuntimeState(),
      selectionA,
    );
    const ready = acceptRegionInspectionQueryResult(first.state, {
      requestId: first.request.requestId,
      readout: readout("region-a"),
    }).state;

    const next = beginRegionInspectionQuery(ready, {
      id: "region-b",
      centerX: 0.6,
      centerY: 0.5,
      radius: 0.1,
    });

    expect(next.state.presentation).toMatchObject({
      status: "stale",
      requestedSelectionId: "region-b",
      readout: {
        selectionId: "region-a",
      },
    });
  });

  it("rejects a response whose request id matches but selection identity does not", () => {
    const started = beginRegionInspectionQuery(
      createRegionInspectorRuntimeState(),
      selectionA,
    );

    const corrupted = acceptRegionInspectionQueryResult(started.state, {
      requestId: started.request.requestId,
      readout: readout("region-b"),
    });

    expect(corrupted.accepted).toBe(false);
    expect(corrupted.state).toBe(started.state);
  });

  it("accepts only the active request error and retains any prior readout as stale", () => {
    const first = beginRegionInspectionQuery(
      createRegionInspectorRuntimeState(),
      selectionA,
    );
    const ready = acceptRegionInspectionQueryResult(first.state, {
      requestId: first.request.requestId,
      readout: readout("region-a"),
    }).state;
    const next = beginRegionInspectionQuery(ready, {
      id: "region-b",
      centerX: 0.6,
      centerY: 0.5,
      radius: 0.1,
    });

    const lateFailure = failRegionInspectionQuery(
      next.state,
      first.request.requestId,
      "Old failure.",
    );
    expect(lateFailure.accepted).toBe(false);

    const failure = failRegionInspectionQuery(
      next.state,
      next.request.requestId,
      "Authoritative query failed.",
    );

    expect(failure.accepted).toBe(true);
    expect(failure.state.activeRequest).toBeNull();
    expect(failure.state.presentation).toMatchObject({
      status: "error",
      selectionId: "region-b",
      message: "Authoritative query failed.",
      staleReadout: {
        selectionId: "region-a",
      },
    });
  });

  it("clearing invalidates the active request so a late response cannot restore science", () => {
    const started = beginRegionInspectionQuery(
      createRegionInspectorRuntimeState(),
      selectionA,
    );
    const cleared = clearRegionInspectorRuntime(
      started.state,
      "Selection cleared.",
    );

    const late = acceptRegionInspectionQueryResult(cleared, {
      requestId: started.request.requestId,
      readout: readout("region-a"),
    });

    expect(cleared.presentation).toEqual({
      status: "unavailable",
      reason: "Selection cleared.",
    });
    expect(cleared.activeRequest).toBeNull();
    expect(late.accepted).toBe(false);
    expect(late.state).toBe(cleared);
  });

  it("normalizes selection ids for transport without mutating the caller selection", () => {
    const selection = {
      id: "  region-a  ",
      centerX: 0.4,
      centerY: 0.5,
      radius: 0.1,
    };
    const started = beginRegionInspectionQuery(
      createRegionInspectorRuntimeState(),
      selection,
    );

    expect(started.request.selection.id).toBe("region-a");
    expect(selection.id).toBe("  region-a  ");
    expect(started.request.selection).not.toBe(selection);
  });

  it("fails closed if internal request identity can no longer advance safely", () => {
    expect(() =>
      beginRegionInspectionQuery(
        {
          ...createRegionInspectorRuntimeState(),
          nextRequestId: Number.MAX_SAFE_INTEGER,
        },
        selectionA,
      ),
    ).toThrow(/request id/);
  });
});
