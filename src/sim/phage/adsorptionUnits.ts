import { SimulationRng } from "../rng";

export type UnitBridgeEvidenceClass =
  | "measured"
  | "transferred"
  | "calibrated"
  | "engineering";

export interface UnitBridgeProvenance {
  readonly classification: UnitBridgeEvidenceClass;
  readonly sourceIds: readonly string[];
  readonly note: string;
}

export interface PhageAdsorptionUnitBridge {
  /** Stable scenario-owned identifier included in configuration/replay identity. */
  readonly id: string;
  /** Version changes whenever a conversion assumption changes. */
  readonly version: string;
  /**
   * Ecology biomass units represented by one biological cell-equivalent.
   * This is an explicit scenario calibration, never an implicit rounding rule.
   */
  readonly biomassUnitsPerCellEquivalent: number;
  /** Effective interaction volume represented by one authoritative grid cell. */
  readonly interactionVolumeMl: number;
  /** Human-readable basis for the biomass-to-cell-equivalent conversion. */
  readonly biomassBasis: string;
  /** Human-readable geometric/physical basis for the interaction volume. */
  readonly volumeBasis: string;
  readonly provenance: UnitBridgeProvenance;
}

export interface ExactAdsorptionSample {
  readonly adsorbedPfu: number;
  readonly remainingFreePhagePfu: number;
  readonly probabilityPerFreePhage: number;
  readonly hazardPerFreePhagePerMinute: number;
}

/** Validate a scenario-owned dimensional bridge without supplying any defaults. */
export function validatePhageAdsorptionUnitBridge(
  bridge: PhageAdsorptionUnitBridge,
): void {
  nonEmpty("bridge.id", bridge.id);
  nonEmpty("bridge.version", bridge.version);
  finitePositive(
    "bridge.biomassUnitsPerCellEquivalent",
    bridge.biomassUnitsPerCellEquivalent,
  );
  finitePositive("bridge.interactionVolumeMl", bridge.interactionVolumeMl);
  nonEmpty("bridge.biomassBasis", bridge.biomassBasis);
  nonEmpty("bridge.volumeBasis", bridge.volumeBasis);
  nonEmpty("bridge.provenance.note", bridge.provenance.note);

  if (
    bridge.provenance.classification !== "measured" &&
    bridge.provenance.classification !== "transferred" &&
    bridge.provenance.classification !== "calibrated" &&
    bridge.provenance.classification !== "engineering"
  ) {
    throw new TypeError("unsupported unit-bridge provenance classification");
  }

  const ids = new Set<string>();
  for (const sourceId of bridge.provenance.sourceIds) {
    nonEmpty("bridge.provenance.sourceIds[]", sourceId);
    if (ids.has(sourceId)) {
      throw new TypeError("unit-bridge provenance source IDs must be unique");
    }
    ids.add(sourceId);
  }

  if (
    (bridge.provenance.classification === "measured" ||
      bridge.provenance.classification === "transferred") &&
    bridge.provenance.sourceIds.length === 0
  ) {
    throw new TypeError(
      "measured/transferred unit bridges require at least one source ID",
    );
  }
}

/**
 * Convert aggregate ecology biomass to a continuous cell-equivalent count.
 *
 * This is intentionally not rounded. Exact infection/event code must not treat
 * the returned value as an integer host count unless a separate reviewed
 * discrete-population contract supplies that authority.
 */
export function biomassToCellEquivalentCount(
  biomass: number,
  bridge: PhageAdsorptionUnitBridge,
): number {
  validatePhageAdsorptionUnitBridge(bridge);
  finiteNonNegative("biomass", biomass);
  return biomass / bridge.biomassUnitsPerCellEquivalent;
}

/** Convert aggregate biomass to cell-equivalents per mL. */
export function biomassToCellEquivalentConcentrationPerMl(
  biomass: number,
  bridge: PhageAdsorptionUnitBridge,
): number {
  return (
    biomassToCellEquivalentCount(biomass, bridge) / bridge.interactionVolumeMl
  );
}

/** Convert free PFU represented in one grid cell to PFU/mL. */
export function freePhagePfuToConcentrationPerMl(
  freePhagePfu: number,
  bridge: PhageAdsorptionUnitBridge,
): number {
  validatePhageAdsorptionUnitBridge(bridge);
  finiteNonNegative("freePhagePfu", freePhagePfu);
  return freePhagePfu / bridge.interactionVolumeMl;
}

/**
 * Per-free-phage adsorption hazard in 1/min.
 *
 * k [mL/min] * B [cell-equivalents/mL] -> hazard [1/min].
 * Entity counts are dimensionless in the mass-action convention.
 */
export function adsorptionHazardPerFreePhagePerMinute(
  adsorptionConstantMlPerMin: number,
  hostBiomass: number,
  bridge: PhageAdsorptionUnitBridge,
): number {
  finiteNonNegative(
    "adsorptionConstantMlPerMin",
    adsorptionConstantMlPerMin,
  );
  const hostConcentration = biomassToCellEquivalentConcentrationPerMl(
    hostBiomass,
    bridge,
  );
  const hazard = adsorptionConstantMlPerMin * hostConcentration;
  if (!Number.isFinite(hazard)) {
    throw new RangeError("adsorption hazard became non-finite");
  }
  return hazard;
}

/** Expected adsorption-event rate for the currently represented free PFU. */
export function expectedAdsorptionsPerMinute(
  adsorptionConstantMlPerMin: number,
  hostBiomass: number,
  freePhagePfu: number,
  bridge: PhageAdsorptionUnitBridge,
): number {
  finiteNonNegative("freePhagePfu", freePhagePfu);
  const rate =
    adsorptionHazardPerFreePhagePerMinute(
      adsorptionConstantMlPerMin,
      hostBiomass,
      bridge,
    ) * freePhagePfu;
  if (!Number.isFinite(rate)) {
    throw new RangeError("expected adsorption rate became non-finite");
  }
  return rate;
}

/** Exact constant-hazard adsorption probability for one free PFU over dt. */
export function adsorptionProbabilityPerFreePhage(
  adsorptionConstantMlPerMin: number,
  hostBiomass: number,
  dtMinutes: number,
  bridge: PhageAdsorptionUnitBridge,
): number {
  finiteNonNegative("dtMinutes", dtMinutes);
  const hazard = adsorptionHazardPerFreePhagePerMinute(
    adsorptionConstantMlPerMin,
    hostBiomass,
    bridge,
  );
  const probability = -Math.expm1(-hazard * dtMinutes);
  if (
    !Number.isFinite(probability) ||
    probability < 0 ||
    probability > 1
  ) {
    throw new RangeError("adsorption probability became invalid");
  }
  return probability;
}

/**
 * Bounded low-count reference sampler for adsorption of free PFU.
 *
 * Each represented free PFU receives one Bernoulli adsorption opportunity, so
 * sampled adsorptions cannot exceed available PFU and remaining PFU can never
 * become negative. Host biomass is read-only here: adsorption is not silently
 * promoted to a discrete infected-host transition.
 */
export function sampleFreePhageAdsorptionsExact(args: {
  readonly adsorptionConstantMlPerMin: number;
  readonly hostBiomass: number;
  readonly freePhagePfu: number;
  readonly dtMinutes: number;
  readonly bridge: PhageAdsorptionUnitBridge;
  readonly rng: SimulationRng;
}): ExactAdsorptionSample {
  assertNonNegativeSafeInteger("freePhagePfu", args.freePhagePfu);
  const hazardPerFreePhagePerMinute =
    adsorptionHazardPerFreePhagePerMinute(
      args.adsorptionConstantMlPerMin,
      args.hostBiomass,
      args.bridge,
    );
  finiteNonNegative("dtMinutes", args.dtMinutes);

  const probabilityPerFreePhage = -Math.expm1(
    -hazardPerFreePhagePerMinute * args.dtMinutes,
  );
  if (
    !Number.isFinite(probabilityPerFreePhage) ||
    probabilityPerFreePhage < 0 ||
    probabilityPerFreePhage > 1
  ) {
    throw new RangeError("adsorption probability became invalid");
  }

  if (args.freePhagePfu === 0 || probabilityPerFreePhage === 0) {
    return {
      adsorbedPfu: 0,
      remainingFreePhagePfu: args.freePhagePfu,
      probabilityPerFreePhage,
      hazardPerFreePhagePerMinute,
    };
  }

  if (probabilityPerFreePhage === 1) {
    return {
      adsorbedPfu: args.freePhagePfu,
      remainingFreePhagePfu: 0,
      probabilityPerFreePhage,
      hazardPerFreePhagePerMinute,
    };
  }

  let adsorbedPfu = 0;
  for (let index = 0; index < args.freePhagePfu; index += 1) {
    if (args.rng.nextFloat() < probabilityPerFreePhage) {
      adsorbedPfu += 1;
    }
  }

  return {
    adsorbedPfu,
    remainingFreePhagePfu: args.freePhagePfu - adsorbedPfu,
    probabilityPerFreePhage,
    hazardPerFreePhagePerMinute,
  };
}

function assertNonNegativeSafeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
}

function finiteNonNegative(name: string, value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be finite and non-negative`);
  }
  return value;
}

function finitePositive(name: string, value: number): number {
  const checked = finiteNonNegative(name, value);
  if (checked === 0) throw new RangeError(`${name} must be positive`);
  return checked;
}

function nonEmpty(name: string, value: string): void {
  if (value.trim().length === 0) {
    throw new TypeError(`${name} must be non-empty`);
  }
}
