export interface AntimicrobialEffect {
  /**
   * Multiplicative effect on the caller's already-authorized drug-free division
   * or growth channel. 1 is neutral and 0 is complete suppression.
   */
  readonly divisionMultiplier: number;
  /**
   * Additional first-order loss hazard contributed by the antimicrobial.
   * This axis is independent from growth suppression.
   */
  readonly incrementalLossHazardPerHour: number;
}

export function validateAntimicrobialEffect(
  effect: AntimicrobialEffect,
): Readonly<AntimicrobialEffect> {
  if (
    !Number.isFinite(effect.divisionMultiplier) ||
    effect.divisionMultiplier < 0 ||
    effect.divisionMultiplier > 1
  ) {
    throw new RangeError(
      "antimicrobial divisionMultiplier must be finite and within [0, 1]",
    );
  }
  if (
    !Number.isFinite(effect.incrementalLossHazardPerHour) ||
    effect.incrementalLossHazardPerHour < 0
  ) {
    throw new RangeError(
      "antimicrobial incrementalLossHazardPerHour must be finite and non-negative",
    );
  }

  return Object.freeze({
    divisionMultiplier: effect.divisionMultiplier,
    incrementalLossHazardPerHour: effect.incrementalLossHazardPerHour,
  });
}
