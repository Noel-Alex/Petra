import type { NormalizedDishPoint } from "../ui/interventionPreview";
import {
  unavailableRegionInspector,
  type RegionInspectorPresentationState,
} from "../ui/regionInspectorState";
import {
  inspectAuthoritativeRegion,
  type NormalizedRegionSelection,
} from "../sim/regionInspector";
import type { RunIdentity, SimulationSnapshot } from "../sim/protocol";

export const DEFAULT_REGION_INSPECTION_RADIUS = 0.06;

export interface RegionInspectionRequest {
  readonly selection: NormalizedRegionSelection;
  readonly runIdentity: RunIdentity;
}

export interface RegionInspectionSourceIdentity {
  readonly runIdentity: RunIdentity;
  readonly tick: number;
  readonly simulationTimeHours: number;
  readonly commandCount: number;
  readonly traceHash: string;
}

export interface RegionInspectorProjection {
  readonly state: RegionInspectorPresentationState;
  readonly source: RegionInspectionSourceIdentity | null;
}

/**
 * Creates a local-region request only from a composed authoritative snapshot.
 * The radius is normalized query geometry, not a biological parameter and not
 * an inferred physical colony footprint.
 */
export function createRegionInspectionRequest(
  snapshot: SimulationSnapshot | null,
  point: NormalizedDishPoint,
  radius = DEFAULT_REGION_INSPECTION_RADIUS,
): RegionInspectionRequest | null {
  if (snapshot?.checkpoint.authority !== "composed") return null;
  assertUnitInterval("region inspection x", point.x);
  assertUnitInterval("region inspection y", point.y);
  if (!Number.isFinite(radius) || radius <= 0 || radius > 1) {
    throw new RangeError(
      "region inspection radius must be finite and within (0, 1]",
    );
  }

  return {
    selection: {
      id: [
        "region-v1",
        point.x.toFixed(6),
        point.y.toFixed(6),
        radius.toFixed(6),
      ].join(":"),
      centerX: point.x,
      centerY: point.y,
      radius,
    },
    runIdentity: structuredClone(snapshot.checkpoint.identity),
  };
}

/**
 * Projects scientific values from the exact composed checkpoint owned by the
 * runtime. Renderer glyphs, overlays, camera state and visual interpolation do
 * not participate in the measurement.
 */
export function projectRegionInspector(
  snapshot: SimulationSnapshot | null,
  request: RegionInspectionRequest | null,
): RegionInspectorProjection {
  if (request === null) {
    return {
      state: unavailableRegionInspector(
        snapshot?.checkpoint.authority === "composed"
          ? "Select a point on the dish to inspect authoritative local state."
          : "Region inspection requires an authoritative composed simulation snapshot.",
      ),
      source: null,
    };
  }

  if (snapshot?.checkpoint.authority !== "composed") {
    return {
      state: unavailableRegionInspector(
        "The selected region is unavailable until composed simulation authority returns.",
      ),
      source: null,
    };
  }

  if (!sameRunIdentity(request.runIdentity, snapshot.checkpoint.identity)) {
    return {
      state: unavailableRegionInspector(
        "This region selection belongs to an earlier run. Select a region again.",
      ),
      source: null,
    };
  }

  const source: RegionInspectionSourceIdentity = {
    runIdentity: structuredClone(snapshot.checkpoint.identity),
    tick: snapshot.checkpoint.tick,
    simulationTimeHours: snapshot.checkpoint.simulationTimeHours,
    commandCount: snapshot.checkpoint.commandCount,
    traceHash: snapshot.traceHash,
  };

  try {
    const readout = inspectAuthoritativeRegion(
      snapshot.checkpoint,
      request.selection,
    );
    return {
      state: {
        status: "ready",
        selectionId: request.selection.id,
        readout,
      },
      source,
    };
  } catch {
    return {
      state: {
        status: "error",
        selectionId: request.selection.id,
        message: "Authoritative region inspection failed.",
        staleReadout: null,
      },
      source,
    };
  }
}

function sameRunIdentity(left: RunIdentity, right: RunIdentity): boolean {
  return (
    left.engineVersion === right.engineVersion &&
    left.protocolVersion === right.protocolVersion &&
    left.scenarioId === right.scenarioId &&
    left.scenarioVersion === right.scenarioVersion &&
    left.parameterSetId === right.parameterSetId &&
    left.parameterSetVersion === right.parameterSetVersion &&
    left.seed === right.seed &&
    JSON.stringify(left.parameterSetBinding ?? null) ===
      JSON.stringify(right.parameterSetBinding ?? null)
  );
}

function assertUnitInterval(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${name} must be finite and within [0, 1]`);
  }
}
