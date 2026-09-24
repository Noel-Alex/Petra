import type {
  AuthoritativeRegionInspection,
  NormalizedRegionSelection,
} from "../sim/regionInspector";
import {
  acceptRegionInspection,
  activeSelectionId,
  beginRegionInspection,
  clearRegionInspection,
  failRegionInspection,
  type RegionInspectorPresentationState,
} from "../ui/regionInspectorState";

export interface RegionInspectionQuery {
  readonly requestId: number;
  readonly selection: NormalizedRegionSelection;
}

export interface RegionInspectionQueryResult {
  readonly requestId: number;
  readonly readout: AuthoritativeRegionInspection;
}

export interface RegionInspectorRuntimeState {
  readonly presentation: RegionInspectorPresentationState;
  readonly activeRequest: RegionInspectionQuery | null;
  readonly nextRequestId: number;
}

export interface RegionInspectionQueryStart {
  readonly state: RegionInspectorRuntimeState;
  readonly request: RegionInspectionQuery;
}

export interface RegionInspectionRuntimeAcceptance {
  readonly accepted: boolean;
  readonly state: RegionInspectorRuntimeState;
}

export function createRegionInspectorRuntimeState(
  reason = "No region selected.",
): RegionInspectorRuntimeState {
  return {
    presentation: clearRegionInspection(reason),
    activeRequest: null,
    nextRequestId: 1,
  };
}

export function beginRegionInspectionQuery(
  current: RegionInspectorRuntimeState,
  selection: NormalizedRegionSelection,
): RegionInspectionQueryStart {
  assertNextRequestId(current.nextRequestId);
  assertCanonicalSelectionId(selection.id);

  const presentation = beginRegionInspection(current.presentation, selection.id);
  const selectionId = activeSelectionId(presentation);
  if (selectionId !== selection.id) {
    throw new Error(
      "region inspector presentation changed canonical selection identity",
    );
  }

  const request: RegionInspectionQuery = {
    requestId: current.nextRequestId,
    selection: { ...selection },
  };

  return {
    state: {
      presentation,
      activeRequest: request,
      nextRequestId: current.nextRequestId + 1,
    },
    request,
  };
}

export function acceptRegionInspectionQueryResult(
  current: RegionInspectorRuntimeState,
  result: RegionInspectionQueryResult,
): RegionInspectionRuntimeAcceptance {
  if (
    current.activeRequest === null ||
    result.requestId !== current.activeRequest.requestId ||
    result.readout.selectionId !== current.activeRequest.selection.id
  ) {
    return { accepted: false, state: current };
  }

  const accepted = acceptRegionInspection(current.presentation, result.readout);
  if (!accepted.accepted) {
    return { accepted: false, state: current };
  }

  return {
    accepted: true,
    state: {
      ...current,
      presentation: accepted.state,
      activeRequest: null,
    },
  };
}

export function failRegionInspectionQuery(
  current: RegionInspectorRuntimeState,
  requestId: number,
  message: string,
): RegionInspectionRuntimeAcceptance {
  if (
    current.activeRequest === null ||
    requestId !== current.activeRequest.requestId
  ) {
    return { accepted: false, state: current };
  }

  const failed = failRegionInspection(
    current.presentation,
    current.activeRequest.selection.id,
    message,
  );
  if (!failed.accepted) {
    return { accepted: false, state: current };
  }

  return {
    accepted: true,
    state: {
      ...current,
      presentation: failed.state,
      activeRequest: null,
    },
  };
}

export function clearRegionInspectorRuntime(
  current: RegionInspectorRuntimeState,
  reason = "No region selected.",
): RegionInspectorRuntimeState {
  return {
    ...current,
    presentation: clearRegionInspection(reason),
    activeRequest: null,
  };
}

function assertCanonicalSelectionId(value: string): void {
  if (value.length === 0 || value !== value.trim()) {
    throw new Error(
      "region inspector selection id must be non-empty canonical text with no surrounding whitespace",
    );
  }
}

function assertNextRequestId(value: number): void {
  if (
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value >= Number.MAX_SAFE_INTEGER
  ) {
    throw new Error(
      "region inspector next request id must be a positive safe integer with room to advance",
    );
  }
}
