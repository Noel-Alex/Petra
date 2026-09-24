export interface RegoesPharmacodynamics {
  /** Drug-free net growth in the source paper's log10 density per hour convention. */
  psiMaxLog10PerHour: number;
  /** High-concentration lower asymptote in log10 density per hour. */
  psiMinLog10PerHour: number;
  /** Concentration where the fitted net response is zero. */
  zMic: number;
  /** Hill/slope coefficient. */
  kappa: number;
}

export interface MicShiftedResponse {
  referenceZMic: number;
  referenceMic: number;
  genotypeMic: number;
  effectiveZMic: number;
  netRateLog10PerHour: number;
  netRateNaturalPerHour: number;
}

const LN_10 = Math.log(10);

function assertFinite(name: string, value: number): void {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite`);
}

export function validateRegoesParameters(pd: RegoesPharmacodynamics): void {
  assertFinite("psiMaxLog10PerHour", pd.psiMaxLog10PerHour);
  assertFinite("psiMinLog10PerHour", pd.psiMinLog10PerHour);
  assertFinite("zMic", pd.zMic);
  assertFinite("kappa", pd.kappa);
  if (pd.psiMaxLog10PerHour <= 0) throw new RangeError("psiMaxLog10PerHour must be > 0");
  if (pd.psiMinLog10PerHour >= 0) throw new RangeError("psiMinLog10PerHour must be < 0");
  if (pd.zMic <= 0) throw new RangeError("zMic must be > 0");
  if (pd.kappa <= 0) throw new RangeError("kappa must be > 0");
}

/**
 * Regoes et al. (2004) four-parameter concentration-response relation.
 *
 * Input concentration and zMIC must use the same concentration unit. The return
 * value deliberately remains in the source paper's log10-density/hour rate
 * convention so callers cannot silently mix logarithm bases.
 */
export function regoesNetRateLog10PerHour(
  concentration: number,
  pd: RegoesPharmacodynamics,
): number {
  assertFinite("concentration", concentration);
  if (concentration < 0) throw new RangeError("concentration must be >= 0");
  validateRegoesParameters(pd);
  if (concentration === 0) return pd.psiMaxLog10PerHour;

  const scaled = Math.pow(concentration / pd.zMic, pd.kappa);
  const denominator = scaled - pd.psiMinLog10PerHour / pd.psiMaxLog10PerHour;
  return (
    pd.psiMaxLog10PerHour -
    ((pd.psiMaxLog10PerHour - pd.psiMinLog10PerHour) * scaled) / denominator
  );
}

/** Convert a log10 population slope per hour to the equivalent natural-log rate. */
export function log10RateToNaturalPerHour(rateLog10PerHour: number): number {
  assertFinite("rateLog10PerHour", rateLog10PerHour);
  return rateLog10PerHour * LN_10;
}

/** Convert a natural-log population rate per hour to a log10 slope per hour. */
export function naturalRateToLog10PerHour(rateNaturalPerHour: number): number {
  assertFinite("rateNaturalPerHour", rateNaturalPerHour);
  return rateNaturalPerHour / LN_10;
}

/**
 * Transfer the reference curve horizontally by the ratio of genotype MIC to
 * reference MIC. This is an explicit cross-study composition assumption, not a
 * genotype-specific time-kill measurement.
 */
export function micShiftedRegoesResponse(
  concentration: number,
  reference: RegoesPharmacodynamics,
  referenceMic: number,
  genotypeMic: number,
): MicShiftedResponse {
  assertFinite("referenceMic", referenceMic);
  assertFinite("genotypeMic", genotypeMic);
  if (referenceMic <= 0) throw new RangeError("referenceMic must be > 0");
  if (genotypeMic <= 0) throw new RangeError("genotypeMic must be > 0");
  validateRegoesParameters(reference);

  const effectiveZMic = reference.zMic * (genotypeMic / referenceMic);
  const shifted = { ...reference, zMic: effectiveZMic };
  const netRateLog10PerHour = regoesNetRateLog10PerHour(concentration, shifted);

  return {
    referenceZMic: reference.zMic,
    referenceMic,
    genotypeMic,
    effectiveZMic,
    netRateLog10PerHour,
    netRateNaturalPerHour: log10RateToNaturalPerHour(netRateLog10PerHour),
  };
}
