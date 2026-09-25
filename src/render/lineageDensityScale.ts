export const LINEAGE_DENSITY_PRESENTATION_SCALE_SCHEMA_VERSION = 1 as const;

export const LINEAGE_DENSITY_PRESENTATION_SCALE_MODES = [
  "source-owned-fixed",
  "snapshot-extrema",
] as const;

export type LineageDensityPresentationScaleMode =
  (typeof LINEAGE_DENSITY_PRESENTATION_SCALE_MODES)[number];

interface LineageDensityPresentationScaleBase {
  readonly schemaVersion:
    typeof LINEAGE_DENSITY_PRESENTATION_SCALE_SCHEMA_VERSION;
  readonly unit: string;
  readonly maximum: number;
}

/**
 * Stable presentation denominator supplied by an exact source/configuration
 * authority. overflowTolerance is numerical representation allowance supplied
 * by that source. The renderer must never invent or widen it.
 */
export interface SourceOwnedFixedLineageDensityPresentationScale
  extends LineageDensityPresentationScaleBase {
  readonly mode: "source-owned-fixed";
  readonly sourceIdentity: string;
  readonly overflowTolerance: number;
}

/**
 * Per-snapshot fallback for authorities that do not supply a stable scale.
 *
 * This mode is intentionally not temporally comparable: equal absolute density
 * may map to different presentation intensity when snapshot extrema change.
 */
export interface SnapshotExtremaLineageDensityPresentationScale
  extends LineageDensityPresentationScaleBase {
  readonly mode: "snapshot-extrema";
  readonly snapshotId: string;
}

export type LineageDensityPresentationScale =
  | SourceOwnedFixedLineageDensityPresentationScale
  | SnapshotExtremaLineageDensityPresentationScale;

const FIXED_KEYS = new Set([
  "schemaVersion",
  "mode",
  "unit",
  "maximum",
  "sourceIdentity",
  "overflowTolerance",
]);

const SNAPSHOT_EXTREMA_KEYS = new Set([
  "schemaVersion",
  "mode",
  "unit",
  "maximum",
  "snapshotId",
]);

export function validateLineageDensityPresentationScale(
  value: unknown,
): asserts value is LineageDensityPresentationScale {
  const scale = requireRecord(value, "lineage density presentation scale");

  if (
    scale.schemaVersion !== LINEAGE_DENSITY_PRESENTATION_SCALE_SCHEMA_VERSION
  ) {
    throw new RangeError(
      "unsupported lineage density presentation scale schema version",
    );
  }

  canonicalText("lineage density presentation scale unit", scale.unit);

  if (scale.mode === "source-owned-fixed") {
    assertOnlyKeys(
      scale,
      FIXED_KEYS,
      "source-owned lineage density presentation scale",
    );
    canonicalText(
      "lineage density presentation scale source identity",
      scale.sourceIdentity,
    );
    const maximum = requireFinitePositive(
      "source-owned lineage density presentation maximum",
      scale.maximum,
    );
    const overflowTolerance = requireFiniteNonNegative(
      "source-owned lineage density overflow tolerance",
      scale.overflowTolerance,
    );
    if (!Number.isFinite(maximum + overflowTolerance)) {
      throw new RangeError(
        "source-owned lineage density presentation maximum plus tolerance must be finite",
      );
    }
    return;
  }

  if (scale.mode === "snapshot-extrema") {
    assertOnlyKeys(
      scale,
      SNAPSHOT_EXTREMA_KEYS,
      "snapshot-extrema lineage density presentation scale",
    );
    canonicalText(
      "lineage density presentation scale snapshot id",
      scale.snapshotId,
    );
    requireFiniteNonNegative(
      "snapshot-extrema lineage density presentation maximum",
      scale.maximum,
    );
    return;
  }

  throw new RangeError(
    "unsupported lineage density presentation scale mode: " + String(scale.mode),
  );
}

/**
 * Returns the denominator consumed by existing presentation transfer functions.
 * It performs no density scan and does not derive source authority.
 */
export function lineageDensityPresentationMaximum(
  scale: LineageDensityPresentationScale,
): number {
  validateLineageDensityPresentationScale(scale);
  return scale.maximum;
}

/**
 * Fail-closed admission for one source density against its declared scale.
 *
 * Fixed-mode overflow allowance is caller/source supplied so renderer code does
 * not invent an epsilon or silently clamp a scientific state-domain violation.
 */
export function assertLineageDensityWithinPresentationScale(
  density: number,
  scale: LineageDensityPresentationScale,
): void {
  validateLineageDensityPresentationScale(scale);
  const value = requireFiniteNonNegative("lineage density", density);
  const upperBound =
    scale.mode === "source-owned-fixed"
      ? scale.maximum + scale.overflowTolerance
      : scale.maximum;

  if (value > upperBound) {
    throw new RangeError(
      "lineage density " +
        value +
        " exceeds declared " +
        scale.mode +
        " presentation maximum " +
        scale.maximum,
    );
  }
}

function requireRecord(
  value: unknown,
  name: string,
): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new TypeError(name + " must be an object");
  }
  return value as Record<string, unknown>;
}

function assertOnlyKeys(
  record: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  name: string,
): void {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      throw new TypeError(
        name + " contains unsupported field " + JSON.stringify(key),
      );
    }
  }
}

function canonicalText(name: string, value: unknown): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value !== value.trim()
  ) {
    throw new TypeError(name + " must be canonical non-empty text");
  }
}

function requireFinitePositive(name: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new RangeError(name + " must be finite and > 0");
  }
  return value;
}

function requireFiniteNonNegative(name: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new RangeError(name + " must be finite and non-negative");
  }
  return value;
}
