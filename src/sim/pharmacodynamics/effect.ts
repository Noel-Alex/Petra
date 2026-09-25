export interface AntimicrobialEffect {
  /**
   * Multiplicative factor applied to the source-compatible positive division/growth
   * channel. One is a no-op; zero is complete growth arrest.
   */
  readonly divisionMultiplier: number;
  /**
   * Additional first-order population-loss hazard in inverse hours. This remains
   * independent from growth suppression so bacteriostatic and bactericidal
   * authorities are not forced into one mechanism.
   */
  readonly incrementalLossHazardPerHour: number;
}

export function validateAntimicrobialEffect(effect: AntimicrobialEffect): void {
  if (
    !Number.isFinite(effect.divisionMultiplier) ||
    effect.divisionMultiplier < 0 ||
    effect.divisionMultiplier > 1
  ) {
    throw new RangeError("divisionMultiplier must be finite and in [0, 1]");
  }
  if (
    !Number.isFinite(effect.incrementalLossHazardPerHour) ||
    effect.incrementalLossHazardPerHour < 0
  ) {
    throw new RangeError(
      "incrementalLossHazardPerHour must be finite and >= 0",
    );
  }
}
