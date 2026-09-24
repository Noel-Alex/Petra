import type {
  AuthoritativeRegionInspection,
  AuthoritativeRegionNoGridCoverage,
  AuthoritativeRegionReadout,
} from "../sim/regionInspector";

export type RegionInspectorPresentationState =
  | Readonly<{
      status: "unavailable";
      reason: string;
    }>
  | Readonly<{
      status: "pending";
      selectionId: string;
    }>
  | Readonly<{
      status: "stale";
      requestedSelectionId: string;
      readout: AuthoritativeRegionReadout;
    }>
  | Readonly<{
      status: "ready";
      selectionId: string;
      readout: AuthoritativeRegionReadout;
    }>
  | Readonly<{
      status: "no-grid-coverage";
      selectionId: string;
      outcome: AuthoritativeRegionNoGridCoverage;
    }>
  | Readonly<{
      status: "error";
      selectionId: string | null;
      message: string;
      staleReadout: AuthoritativeRegionReadout | null;
    }>;

export interface RegionInspectionAcceptance {
  readonly accepted: boolean;
  readonly state: RegionInspectorPresentationState;
}

export function unavailableRegionInspector(
  reason: string,
): RegionInspectorPresentationState {
  return {
    status: "unavailable",
    reason: requireText("region inspector unavailable reason", reason),
  };
}

/**
 * Starts a new authoritative region query.
 *
 * If a prior scientific readout exists it may remain visible only as an
 * explicitly stale readout carrying its original selection identity. This
 * prevents a new selection from silently inheriting the old values.
 *
 * A prior no-grid-coverage outcome is not a scientific readout and is not
 * retained as stale data for a different selection.
 */
export function beginRegionInspection(
  current: RegionInspectorPresentationState,
  selectionId: string,
): RegionInspectorPresentationState {
  const requestedSelectionId = requireText(
    "region inspector selectionId",
    selectionId,
  );
  const previous = visibleReadout(current);

  if (previous !== null) {
    return {
      status: "stale",
      requestedSelectionId,
      readout: previous,
    };
  }

  return {
    status: "pending",
    selectionId: requestedSelectionId,
  };
}

/**
 * Accepts only an outcome for the currently requested selection.
 * Superseded async responses are ignored deterministically rather than
 * overwriting the visible inspector with stale scientific state.
 */
export function acceptRegionInspection(
  current: RegionInspectorPresentationState,
  inspection: AuthoritativeRegionInspection,
): RegionInspectionAcceptance {
  const requestedSelectionId = activeSelectionId(current);
  if (
    requestedSelectionId === null ||
    inspection.selectionId !== requestedSelectionId
  ) {
    return { accepted: false, state: current };
  }

  if (inspection.coverage === "no-grid-coverage") {
    return {
      accepted: true,
      state: {
        status: "no-grid-coverage",
        selectionId: requestedSelectionId,
        outcome: inspection,
      },
    };
  }

  return {
    accepted: true,
    state: {
      status: "ready",
      selectionId: requestedSelectionId,
      readout: inspection,
    },
  };
}

export function failRegionInspection(
  current: RegionInspectorPresentationState,
  selectionId: string,
  message: string,
): RegionInspectionAcceptance {
  const failedSelectionId = requireText(
    "region inspector failed selectionId",
    selectionId,
  );
  if (activeSelectionId(current) !== failedSelectionId) {
    return { accepted: false, state: current };
  }

  return {
    accepted: true,
    state: {
      status: "error",
      selectionId: failedSelectionId,
      message: requireText("region inspector error message", message),
      staleReadout: visibleReadout(current),
    },
  };
}

export function clearRegionInspection(
  reason = "No region selected.",
): RegionInspectorPresentationState {
  return unavailableRegionInspector(reason);
}

export function activeSelectionId(
  state: RegionInspectorPresentationState,
): string | null {
  switch (state.status) {
    case "pending":
    case "ready":
    case "no-grid-coverage":
      return state.selectionId;
    case "stale":
      return state.requestedSelectionId;
    case "error":
      return state.selectionId;
    case "unavailable":
      return null;
  }
}

export function visibleReadout(
  state: RegionInspectorPresentationState,
): AuthoritativeRegionReadout | null {
  switch (state.status) {
    case "ready":
    case "stale":
      return state.readout;
    case "error":
      return state.staleReadout;
    case "pending":
    case "no-grid-coverage":
    case "unavailable":
      return null;
  }
}

function requireText(name: string, value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`${name} must be non-empty`);
  }
  return trimmed;
}
