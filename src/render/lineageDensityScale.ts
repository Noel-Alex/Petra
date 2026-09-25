export const LINEAGE_DENSITY_PRESENTATION_SCALE_VERSION = 1 as const;

export interface SnapshotExtremaLineageDensityScale {
  readonly version: typeof LINEAGE_DENSITY_PRESENTATION_SCALE_VERSION;
  /**
   * Per-snapshot fallback. This mode is explicitly not temporally comparable.
   */
  readonly mode: "snapshot-extrema";
}

export interface StableSourceLineageDensityScale {
  readonly version: typeof LINEAGE_DENSITY_PRESENTATION_SCALE_VERSION;
  readonly mode: "stable-source";
  /** Exact source quantity unit for the supplied maximum. */
  readonly unit: string;
  /** Stable source-owned ceiling shared by every lineage channel. */
  readonly maximum: number;
  /**
   * Source-owned numerical representation allowance above maximum.
   * This is not biological headroom and must never be invented by rendering.
   */
  readonly maximumTolerance: number;
  /**
   * Exact accepted source/configuration identity. Live composed adapters should
   * bind run-branch + configuration fingerprint so cross-branch reuse fails.
   */
  readonly sourceIdentity: string;
}

export type LineageDensityPresentationScale =
  | SnapshotExtremaLineageDensityScale
  | StableSourceLineageDensityScale;

const BACKWARD_COMPATIBLE_SNAPSHOT_EXTREMA_SCALE: SnapshotExtremaLineageDensityScale =
  Object.freeze({
    version: LINEAGE_DENSITY_PRESENTATION_SCALE_VERSION,
    mode: "snapshot-extrema",
  });

export function resolveLineageDensityPresentationScale(
  scale: LineageDensityPresentationScale | undefined,
): LineageDensityPresentationScale {
  if (scale === undefined) {
    return BACKWARD_COMPATIBLE_SNAPSHOT_EXTREMA_SCALE;
  }
  assertLineageDensityPresentationScale(scale);
  return scale;
}

export function assertLineageDensityPresentationScale(
  scale: LineageDensityPresentationScale,
): void {
  if (scale.version !== LINEAGE_DENSITY_PRESENTATION_SCALE_VERSION) {
    throw new RangeError("unsupported lineage-density presentation scale version");
  }
  if (scale.mode === "snapshot-extrema") return;
  if (scale.mode !== "stable-source") {
    throw new RangeError("unsupported lineage-density presentation scale mode");
  }

  canonicalText("lineage-density scale unit", scale.unit);
  canonicalText("lineage-density scale sourceIdentity", scale.sourceIdentity);
  positiveFinite("lineage-density scale maximum", scale.maximum);
  finiteNonNegative(
    "lineage-density scale maximumTolerance",
    scale.maximumTolerance,
  );
}

/**
 * Validate one already-authoritative density against a stable source ceiling.
 *
 * Call this while an existing consumer is already visiting a density value; it
 * is deliberately O(1) so stable-source scaling does not require a second
 * whole-grid maximum scan.
 */
export function assertLineageDensityWithinPresentationScale(
  density: number,
  scale: LineageDensityPresentationScale | undefined,
): void {
  finiteNonNegative("lineage density", density);
  const resolved = resolveLineageDensityPresentationScale(scale);
  if (resolved.mode !== "stable-source") return;

  if (density - resolved.maximum > resolved.maximumTolerance) {
    throw new RangeError(
      "lineage density exceeds stable source maximum beyond source-owned representation tolerance",
    );
  }
}

export function lineageDensityPresentationScaleEqual(
  left: LineageDensityPresentationScale | undefined,
  right: LineageDensityPresentationScale | undefined,
): boolean {
  const a = resolveLineageDensityPresentationScale(left);
  const b = resolveLineageDensityPresentationScale(right);
  if (a.mode !== b.mode || a.version !== b.version) return false;
  if (a.mode === "snapshot-extrema" || b.mode === "snapshot-extrema") {
    return a.mode === b.mode;
  }
  return (
    a.unit === b.unit &&
    a.maximum === b.maximum &&
    a.maximumTolerance === b.maximumTolerance &&
    a.sourceIdentity === b.sourceIdentity
  );
}

/**
 * Return the stable denominator without visiting any grid values.
 * Snapshot-extrema callers must continue to resolve their observed maximum
 * from the current snapshot.
 */
export function stableLineageDensityMaximum(
  scale: LineageDensityPresentationScale | undefined,
): number | null {
  const resolved = resolveLineageDensityPresentationScale(scale);
  return resolved.mode === "stable-source" ? resolved.maximum : null;
}

function canonicalText(name: string, value: string): void {
  if (value.length === 0 || value.trim() !== value) {
    throw new TypeError(`${name} must be canonical non-empty text`);
  }
}

function positiveFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be finite and positive`);
  }
}

function finiteNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be finite and non-negative`);
  }
}
