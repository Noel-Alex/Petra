export const PRESENTATION_PERFORMANCE_TIER_SCHEMA_VERSION = 1 as const;

export type PresentationPerformanceTier = "low" | "standard" | "high";

export interface PresentationPerformancePolicy {
  readonly schemaVersion: typeof PRESENTATION_PERFORMANCE_TIER_SCHEMA_VERSION;
  readonly tier: PresentationPerformanceTier;
  /**
   * Hard cap on representative organism proxies. This is presentation work
   * only; glyph count is never a biological cell/population count.
   */
  readonly maxRepresentativeGlyphs: number;
  /**
   * Upper bound for renderer backing resolution in device pixels per CSS
   * pixel. This may reduce raster/display work only; scientific source grids
   * and arrays remain untouched.
   */
  readonly maxRendererResolution: number;
  readonly simulationFidelity: "unchanged";
}

export const DEFAULT_PRESENTATION_PERFORMANCE_TIER =
  "standard" as const satisfies PresentationPerformanceTier;

/**
 * These are explicit renderer engineering budgets, not measured device
 * recommendations. Standard mirrors today's renderer defaults. Low is a
 * manual fallback; High raises only bounded representative detail.
 *
 * Automatic tier selection remains disabled until browser evidence under
 * #850/#59 establishes an honest capability policy.
 */
const POLICIES: Readonly<
  Record<PresentationPerformanceTier, PresentationPerformancePolicy>
> = Object.freeze({
  low: Object.freeze({
    schemaVersion: PRESENTATION_PERFORMANCE_TIER_SCHEMA_VERSION,
    tier: "low",
    maxRepresentativeGlyphs: 96,
    maxRendererResolution: 1,
    simulationFidelity: "unchanged",
  }),
  standard: Object.freeze({
    schemaVersion: PRESENTATION_PERFORMANCE_TIER_SCHEMA_VERSION,
    tier: "standard",
    maxRepresentativeGlyphs: 180,
    maxRendererResolution: 2,
    simulationFidelity: "unchanged",
  }),
  high: Object.freeze({
    schemaVersion: PRESENTATION_PERFORMANCE_TIER_SCHEMA_VERSION,
    tier: "high",
    maxRepresentativeGlyphs: 260,
    maxRendererResolution: 2,
    simulationFidelity: "unchanged",
  }),
});

export function parsePresentationPerformanceTier(
  value: unknown,
): PresentationPerformanceTier {
  if (value === "low" || value === "standard" || value === "high") {
    return value;
  }
  throw new RangeError(
    "presentation performance tier must be low, standard, or high",
  );
}

/**
 * Parse an explicitly persisted manual preference.
 *
 * null means no explicit preference. Corrupt/unknown stored values fail
 * closed instead of silently selecting a different quality policy.
 */
export function parseStoredPresentationPerformanceTier(
  value: string | null,
): PresentationPerformanceTier | null {
  return value === null ? null : parsePresentationPerformanceTier(value);
}

export function resolvePresentationPerformancePolicy(
  tier: PresentationPerformanceTier,
): PresentationPerformancePolicy {
  return POLICIES[parsePresentationPerformanceTier(tier)];
}

/**
 * Stable presentation-only identity for evidence/UI bookkeeping.
 *
 * This identity must never enter simulation/checkpoint/replay identity.
 */
export function presentationPerformancePolicyIdentity(
  tier: PresentationPerformanceTier,
): string {
  const policy = resolvePresentationPerformancePolicy(tier);
  return [
    "petra-presentation-performance-tier",
    "v" + policy.schemaVersion,
    policy.tier,
    "glyphs=" + policy.maxRepresentativeGlyphs,
    "resolution=" + policy.maxRendererResolution,
  ].join("|");
}
