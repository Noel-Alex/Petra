import type { AuthoritativeRegionInspection } from "../sim/regionInspector";

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
      readout: AuthoritativeRegionInspection;
    }>
  | Readonly<{
      status: "ready";
      selectionId: string;
      readout: AuthoritativeRegionInspection;
    }>
  | Readonly<{
      status: "error";
      selectionId: string | null;
      message: string;
      staleReadout: AuthoritativeRegionInspection | null;
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
 * Accepts only a readout for the currently requested selection.
 * Superseded async responses are ignored deterministically rather than
 * overwriting the visible inspector with stale scientific state.
 */
export function acceptRegionInspection(
  current: RegionInspectorPresentationState,
  readout: AuthoritativeRegionInspection,
): RegionInspectionAcceptance {
  const requestedSelectionId = activeSelectionId(current);
  if (
    requestedSelectionId === null ||
    readout.selectionId !== requestedSelectionId
  ) {
    return { accepted: false, state: current };
  }

  return {
    accepted: true,
    state: {
      status: "ready",
      selectionId: requestedSelectionId,
      readout,
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
): AuthoritativeRegionInspection | null {
  switch (state.status) {
    case "ready":
    case "stale":
      return state.readout;
    case "error":
      return state.staleReadout;
    case "pending":
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
