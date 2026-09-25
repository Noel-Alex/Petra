export const COLONY_MASS_PRESENTATION_POLICY_VERSION = 1 as const;

export interface ColonyMassPresentationPolicy {
  readonly version: typeof COLONY_MASS_PRESENTATION_POLICY_VERSION;
  /** Maximum composited alpha contributed by one lineage at the shared density maximum. */
  readonly maximumAlpha: number;
  /** Presentation-only contrast shaping. Values >1 keep low-density support visually sparse. */
  readonly densityExponent: number;
}

/**
 * Reference-oriented presentation defaults. These values shape pixels only:
 * they are not biomass thresholds, CFU boundaries, colony fronts, or biology.
 */
export const DEFAULT_COLONY_MASS_PRESENTATION_POLICY: ColonyMassPresentationPolicy =
  Object.freeze({
    version: COLONY_MASS_PRESENTATION_POLICY_VERSION,
    maximumAlpha: 0.78,
    densityExponent: 1.2,
  });

export function validateColonyMassPresentationPolicy(
  policy: ColonyMassPresentationPolicy,
): void {
  if (policy.version !== COLONY_MASS_PRESENTATION_POLICY_VERSION) {
    throw new RangeError("unsupported colony-mass presentation policy version");
  }
  if (
    !Number.isFinite(policy.maximumAlpha) ||
    policy.maximumAlpha <= 0 ||
    policy.maximumAlpha > 1
  ) {
    throw new RangeError("colony-mass maximumAlpha must be finite in (0, 1]");
  }
  if (
    !Number.isFinite(policy.densityExponent) ||
    policy.densityExponent <= 0
  ) {
    throw new RangeError(
      "colony-mass densityExponent must be finite and positive",
    );
  }
}

/**
 * Maps one authoritative/composed lineage-density sample into presentation
 * alpha using a caller-supplied snapshot-wide density maximum.
 *
 * The shared maximum is intentionally external to this function so every
 * lineage in one dish transaction is comparable. Per-lineage normalization is
 * forbidden because it can make a rare lineage look as visually strong as the
 * dominant population.
 */
export function projectColonyMassAlpha(
  density: number,
  sharedDensityMaximum: number,
  policy: ColonyMassPresentationPolicy =
    DEFAULT_COLONY_MASS_PRESENTATION_POLICY,
): number {
  validateColonyMassPresentationPolicy(policy);

  if (!Number.isFinite(density) || density < 0) {
    throw new RangeError("colony-mass density must be finite and non-negative");
  }
  if (
    !Number.isFinite(sharedDensityMaximum) ||
    sharedDensityMaximum < 0
  ) {
    throw new RangeError(
      "colony-mass shared density maximum must be finite and non-negative",
    );
  }
  if (sharedDensityMaximum === 0) {
    if (density !== 0) {
      throw new RangeError(
        "positive colony density cannot use a zero shared density maximum",
      );
    }
    return 0;
  }
  if (density > sharedDensityMaximum) {
    throw new RangeError(
      "colony density cannot exceed the shared density maximum",
    );
  }
  if (density === 0) return 0;

  const normalized = density / sharedDensityMaximum;
  return Math.pow(normalized, policy.densityExponent) * policy.maximumAlpha;
}
