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

export interface PreparedMicShiftedRegoes {
  readonly psiMaxLog10PerHour: number;
  readonly psiMinLog10PerHour: number;
  readonly kappa: number;
  readonly referenceZMic: number;
  readonly referenceMic: number;
  readonly genotypeMic: number;
  readonly effectiveZMic: number;
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

function assertConcentration(concentration: number): void {
  assertFinite("concentration", concentration);
  if (concentration < 0) throw new RangeError("concentration must be >= 0");
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

function evaluateRegoesNetRateLog10PerHour(
  concentration: number,
  psiMaxLog10PerHour: number,
  psiMinLog10PerHour: number,
  zMic: number,
  kappa: number,
): number {
  if (concentration === 0) return psiMaxLog10PerHour;

  const scaled = Math.pow(concentration / zMic, kappa);
  const denominator = scaled - psiMinLog10PerHour / psiMaxLog10PerHour;
  return (
    psiMaxLog10PerHour -
    ((psiMaxLog10PerHour - psiMinLog10PerHour) * scaled) / denominator
  );
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
  assertConcentration(concentration);
  validateRegoesParameters(pd);
  return evaluateRegoesNetRateLog10PerHour(
    concentration,
    pd.psiMaxLog10PerHour,
    pd.psiMinLog10PerHour,
    pd.zMic,
    pd.kappa,
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
 * Prepare one genotype-shifted curve once so spatial hot loops do not repeatedly
 * validate/rebuild the same cross-study MIC transformation for every grid cell.
 */
export function prepareMicShiftedRegoes(
  reference: RegoesPharmacodynamics,
  referenceMic: number,
  genotypeMic: number,
): PreparedMicShiftedRegoes {
  assertFinite("referenceMic", referenceMic);
  assertFinite("genotypeMic", genotypeMic);
  if (referenceMic <= 0) throw new RangeError("referenceMic must be > 0");
  if (genotypeMic <= 0) throw new RangeError("genotypeMic must be > 0");
  validateRegoesParameters(reference);

  return {
    psiMaxLog10PerHour: reference.psiMaxLog10PerHour,
    psiMinLog10PerHour: reference.psiMinLog10PerHour,
    kappa: reference.kappa,
    referenceZMic: reference.zMic,
    referenceMic,
    genotypeMic,
    effectiveZMic: reference.zMic * (genotypeMic / referenceMic),
  };
}

export function preparedMicShiftedNetRateLog10PerHour(
  concentration: number,
  prepared: PreparedMicShiftedRegoes,
): number {
  assertConcentration(concentration);
  return evaluateRegoesNetRateLog10PerHour(
    concentration,
    prepared.psiMaxLog10PerHour,
    prepared.psiMinLog10PerHour,
    prepared.effectiveZMic,
    prepared.kappa,
  );
}

export function preparedMicShiftedNetRateNaturalPerHour(
  concentration: number,
  prepared: PreparedMicShiftedRegoes,
): number {
  return log10RateToNaturalPerHour(preparedMicShiftedNetRateLog10PerHour(concentration, prepared));
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
  const prepared = prepareMicShiftedRegoes(reference, referenceMic, genotypeMic);
  const netRateLog10PerHour = preparedMicShiftedNetRateLog10PerHour(concentration, prepared);

  return {
    referenceZMic: prepared.referenceZMic,
    referenceMic: prepared.referenceMic,
    genotypeMic: prepared.genotypeMic,
    effectiveZMic: prepared.effectiveZMic,
    netRateLog10PerHour,
    netRateNaturalPerHour: log10RateToNaturalPerHour(netRateLog10PerHour),
  };
}
