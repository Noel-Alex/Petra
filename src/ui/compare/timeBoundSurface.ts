export interface CompareSurfaceIdentity {
  readonly branchId: string;
  readonly sampleId: string;
  readonly simulationTimeHours: number;
  readonly kind: "authoritative-sample";
}

export interface TimeBoundCompareSurface<T> {
  readonly identity: CompareSurfaceIdentity;
  readonly content: T;
}

export type CompareSurfaceMismatchReason = "branch" | "time";

export interface ResolvedTimeBoundCompareSurface<T> {
  readonly status: "ready" | "mismatch";
  readonly expectedBranchId: string;
  readonly expectedTimeHours: number;
  readonly surface: TimeBoundCompareSurface<T>;
  readonly mismatchReason: CompareSurfaceMismatchReason | null;
  readonly warning: string | null;
}

/**
 * Binds one already-authoritative scientific surface to the exact branch/time
 * the compare shell intends to display.
 *
 * This is intentionally exact for authoritative samples. Presentation
 * interpolation is not silently accepted here; a future interpolation mode
 * must be an explicit, separately labelled contract.
 */
export function resolveTimeBoundCompareSurface<T>(args: {
  readonly expectedBranchId: string;
  readonly expectedTimeHours: number;
  readonly surface: TimeBoundCompareSurface<T>;
}): ResolvedTimeBoundCompareSurface<T> {
  const { expectedBranchId, expectedTimeHours, surface } = args;
  validateExpected(expectedBranchId, expectedTimeHours);
  validateIdentity(surface.identity);

  if (surface.identity.branchId !== expectedBranchId) {
    return {
      status: "mismatch",
      expectedBranchId,
      expectedTimeHours,
      surface,
      mismatchReason: "branch",
      warning:
        `Surface branch ${surface.identity.branchId} does not match expected branch ${expectedBranchId}.`,
    };
  }

  if (surface.identity.simulationTimeHours !== expectedTimeHours) {
    return {
      status: "mismatch",
      expectedBranchId,
      expectedTimeHours,
      surface,
      mismatchReason: "time",
      warning:
        `Surface sample time ${surface.identity.simulationTimeHours} h does not match expected synchronized time ${expectedTimeHours} h.`,
    };
  }

  return {
    status: "ready",
    expectedBranchId,
    expectedTimeHours,
    surface,
    mismatchReason: null,
    warning: null,
  };
}

function validateExpected(branchId: string, simulationTimeHours: number): void {
  if (branchId.trim().length === 0) {
    throw new TypeError("expected branch id must be non-empty");
  }
  assertTime("expectedTimeHours", simulationTimeHours);
}

function validateIdentity(identity: CompareSurfaceIdentity): void {
  if (identity.kind !== "authoritative-sample") {
    throw new TypeError("compare surface must declare authoritative-sample identity");
  }
  if (identity.branchId.trim().length === 0) {
    throw new TypeError("surface branch id must be non-empty");
  }
  if (identity.sampleId.trim().length === 0) {
    throw new TypeError("surface sample id must be non-empty");
  }
  assertTime("surface simulationTimeHours", identity.simulationTimeHours);
}

function assertTime(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be finite and non-negative`);
  }
}
