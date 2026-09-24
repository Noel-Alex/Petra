import { SimulationRng } from "../rng";
import {
  createSamplingDrawBudget,
  expectedSparseBinomialDraws,
  requireAcceleratedSampling,
  runSamplingTransaction,
  sampleExactSparseBinomial,
  samplingExecutionPolicyIdentity,
  validateSamplingExecutionPolicy,
  type SamplingExecutionPolicy,
} from "../samplingPolicy";

export const PHAGE_SPATIAL_UNIT_BRIDGE_SCHEMA_VERSION = 1 as const;

export type PhysicalUnitEvidenceClass =
  | "transferred"
  | "calibrated"
  | "engineering";

export interface PhysicalUnitParameter {
  readonly value: number;
  readonly provenance: Readonly<{
    readonly classification: PhysicalUnitEvidenceClass;
    readonly sourceKeys: readonly string[];
    readonly limitation: string;
  }>;
}

export interface PhageSpatialUnitBridge {
  readonly schemaVersion: typeof PHAGE_SPATIAL_UNIT_BRIDGE_SCHEMA_VERSION;
  readonly id: string;
  readonly modelBiomassPerCellEquivalent: PhysicalUnitParameter;
  readonly effectiveInteractionVolumeMl: PhysicalUnitParameter;
  readonly gridCellPitchMeters: PhysicalUnitParameter;
}

export interface PhageAdsorptionExposure {
  readonly hostCellEquivalents: number;
  readonly hostConcentrationCellEquivalentsPerMl: number;
  readonly freePhageConcentrationPfuPerMl: number;
  readonly perPfuHazardPerMinute: number;
  readonly expectedAdsorptionRatePfuPerMinute: number;
  readonly adsorptionProbability: number;
  readonly expectedAdsorbedPfu: number;
}

export function validatePhageSpatialUnitBridge(
  bridge: PhageSpatialUnitBridge,
): void {
  if (bridge.schemaVersion !== PHAGE_SPATIAL_UNIT_BRIDGE_SCHEMA_VERSION) {
    throw new Error("unsupported phage spatial unit bridge version");
  }
  if (bridge.id.trim().length === 0 || bridge.id !== bridge.id.trim()) {
    throw new Error(
      "phage spatial unit bridge id must be a trimmed non-empty string",
    );
  }

  validatePhysicalParameter(
    "modelBiomassPerCellEquivalent",
    bridge.modelBiomassPerCellEquivalent,
  );
  validatePhysicalParameter(
    "effectiveInteractionVolumeMl",
    bridge.effectiveInteractionVolumeMl,
  );
  validatePhysicalParameter("gridCellPitchMeters", bridge.gridCellPitchMeters);
}

export function phageSpatialUnitBridgeIdentity(
  bridge: PhageSpatialUnitBridge,
): string {
  validatePhageSpatialUnitBridge(bridge);
  return JSON.stringify({
    schemaVersion: bridge.schemaVersion,
    id: bridge.id,
    modelBiomassPerCellEquivalent: identityParameter(
      bridge.modelBiomassPerCellEquivalent,
    ),
    effectiveInteractionVolumeMl: identityParameter(
      bridge.effectiveInteractionVolumeMl,
    ),
    gridCellPitchMeters: identityParameter(bridge.gridCellPitchMeters),
  });
}

export function modelBiomassToCellEquivalents(
  modelBiomass: number,
  bridge: PhageSpatialUnitBridge,
): number {
  validatePhageSpatialUnitBridge(bridge);
  finiteNonNegative("modelBiomass", modelBiomass);
  return modelBiomass / bridge.modelBiomassPerCellEquivalent.value;
}

export function hostConcentrationCellEquivalentsPerMl(
  modelBiomass: number,
  bridge: PhageSpatialUnitBridge,
): number {
  return (
    modelBiomassToCellEquivalents(modelBiomass, bridge) /
    bridge.effectiveInteractionVolumeMl.value
  );
}

export function freePhageConcentrationPfuPerMl(
  freePhagePfu: number,
  bridge: PhageSpatialUnitBridge,
): number {
  validatePhageSpatialUnitBridge(bridge);
  nonNegativeSafeInteger("freePhagePfu", freePhagePfu);
  return freePhagePfu / bridge.effectiveInteractionVolumeMl.value;
}

export function adsorptionHazardPerPfuPerMinute(args: {
  readonly adsorptionConstantMlPerMinute: number;
  readonly hostModelBiomass: number;
  readonly bridge: PhageSpatialUnitBridge;
}): number {
  finiteNonNegative(
    "adsorptionConstantMlPerMinute",
    args.adsorptionConstantMlPerMinute,
  );
  const hostConcentration = hostConcentrationCellEquivalentsPerMl(
    args.hostModelBiomass,
    args.bridge,
  );
  const hazard = args.adsorptionConstantMlPerMinute * hostConcentration;
  finiteNonNegative("adsorption hazard", hazard);
  return hazard;
}

export function adsorptionProbabilityOverMinutes(
  hazardPerMinute: number,
  durationMinutes: number,
): number {
  finiteNonNegative("hazardPerMinute", hazardPerMinute);
  finiteNonNegative("durationMinutes", durationMinutes);
  const exposure = hazardPerMinute * durationMinutes;
  if (!Number.isFinite(exposure)) {
    throw new RangeError("adsorption exposure must be finite");
  }
  return -Math.expm1(-exposure);
}

export function resolvePhageAdsorptionExposure(args: {
  readonly adsorptionConstantMlPerMinute: number;
  readonly hostModelBiomass: number;
  readonly freePhagePfu: number;
  readonly durationMinutes: number;
  readonly bridge: PhageSpatialUnitBridge;
}): PhageAdsorptionExposure {
  nonNegativeSafeInteger("freePhagePfu", args.freePhagePfu);

  const hostCellEquivalents = modelBiomassToCellEquivalents(
    args.hostModelBiomass,
    args.bridge,
  );
  const hostConcentration =
    hostCellEquivalents / args.bridge.effectiveInteractionVolumeMl.value;
  const freePhageConcentration = freePhageConcentrationPfuPerMl(
    args.freePhagePfu,
    args.bridge,
  );
  const hazard = adsorptionHazardPerPfuPerMinute({
    adsorptionConstantMlPerMinute: args.adsorptionConstantMlPerMinute,
    hostModelBiomass: args.hostModelBiomass,
    bridge: args.bridge,
  });
  const probability = adsorptionProbabilityOverMinutes(
    hazard,
    args.durationMinutes,
  );
  const expectedAdsorptionRatePfuPerMinute = args.freePhagePfu * hazard;
  finiteNonNegative(
    "expected adsorption rate",
    expectedAdsorptionRatePfuPerMinute,
  );

  return {
    hostCellEquivalents,
    hostConcentrationCellEquivalentsPerMl: hostConcentration,
    freePhageConcentrationPfuPerMl: freePhageConcentration,
    perPfuHazardPerMinute: hazard,
    expectedAdsorptionRatePfuPerMinute,
    adsorptionProbability: probability,
    expectedAdsorbedPfu: args.freePhagePfu * probability,
  };
}

export function sampleExactAdsorbedPfu(
  freePhagePfu: number,
  adsorptionProbability: number,
  rng: SimulationRng,
): number {
  nonNegativeSafeInteger("freePhagePfu", freePhagePfu);
  if (
    !Number.isFinite(adsorptionProbability) ||
    adsorptionProbability < 0 ||
    adsorptionProbability > 1
  ) {
    throw new RangeError("adsorptionProbability must be finite in [0, 1]");
  }

  let adsorbed = 0;
  for (let phage = 0; phage < freePhagePfu; phage += 1) {
    if (rng.nextFloat() < adsorptionProbability) adsorbed += 1;
  }
  return adsorbed;
}

export type AdsorptionSamplingMode =
  | "exact-reference"
  | "exact-sparse-binomial";

export interface AdsorptionSamplingResult {
  readonly adsorbedPfu: number;
  readonly diagnostics: Readonly<{
    readonly mode: AdsorptionSamplingMode;
    readonly policyIdentity: string;
    readonly rngDraws: number;
  }>;
}

/**
 * Policy-bounded adsorption sampler for runtime composition. The accelerated
 * path remains an exact Binomial(freePhagePfu, adsorptionProbability) draw.
 */
export function sampleAdsorbedPfuWithPolicy(
  freePhagePfu: number,
  adsorptionProbability: number,
  rng: SimulationRng,
  policy: SamplingExecutionPolicy,
): AdsorptionSamplingResult {
  nonNegativeSafeInteger("freePhagePfu", freePhagePfu);
  if (
    !Number.isFinite(adsorptionProbability) ||
    adsorptionProbability < 0 ||
    adsorptionProbability > 1
  ) {
    throw new RangeError("adsorptionProbability must be finite in [0, 1]");
  }
  validateSamplingExecutionPolicy(policy);
  const policyIdentity = samplingExecutionPolicyIdentity(policy);

  if (freePhagePfu <= policy.exactTrialLimit) {
    return {
      adsorbedPfu: sampleExactAdsorbedPfu(
        freePhagePfu,
        adsorptionProbability,
        rng,
      ),
      diagnostics: {
        mode: "exact-reference",
        policyIdentity,
        rngDraws: freePhagePfu,
      },
    };
  }

  const expectedDraws = expectedSparseBinomialDraws(
    freePhagePfu,
    adsorptionProbability,
  );
  requireAcceleratedSampling(freePhagePfu, expectedDraws, policy);

  return runSamplingTransaction(rng, (transactionRng) => {
    const budget = createSamplingDrawBudget(policy);
    const adsorbedPfu = sampleExactSparseBinomial(
      freePhagePfu,
      adsorptionProbability,
      transactionRng,
      budget,
      policyIdentity,
    );
    return {
      adsorbedPfu,
      diagnostics: {
        mode: "exact-sparse-binomial" as const,
        policyIdentity,
        rngDraws: budget.used,
      },
    };
  });
}

export function diffusionCoefficientGridCellsSquaredPerMinute(
  diffusionCoefficientM2PerS: number,
  bridge: PhageSpatialUnitBridge,
): number {
  validatePhageSpatialUnitBridge(bridge);
  finiteNonNegative(
    "diffusionCoefficientM2PerS",
    diffusionCoefficientM2PerS,
  );
  const pitch = bridge.gridCellPitchMeters.value;
  const coefficient = (diffusionCoefficientM2PerS * 60) / (pitch * pitch);
  finiteNonNegative("grid diffusion coefficient", coefficient);
  return coefficient;
}

export function effectiveLayerThicknessMeters(
  bridge: PhageSpatialUnitBridge,
): number {
  validatePhageSpatialUnitBridge(bridge);
  const volumeM3 = bridge.effectiveInteractionVolumeMl.value * 1e-6;
  const pitch = bridge.gridCellPitchMeters.value;
  return volumeM3 / (pitch * pitch);
}

function identityParameter(parameter: PhysicalUnitParameter): object {
  return {
    value: parameter.value,
    classification: parameter.provenance.classification,
    sourceKeys: [...parameter.provenance.sourceKeys].sort(),
  };
}

function validatePhysicalParameter(
  name: string,
  parameter: PhysicalUnitParameter,
): void {
  positiveFinite(name, parameter.value);
  if (
    parameter.provenance.classification !== "transferred" &&
    parameter.provenance.classification !== "calibrated" &&
    parameter.provenance.classification !== "engineering"
  ) {
    throw new Error(`${name} has unsupported evidence classification`);
  }
  if (parameter.provenance.limitation.trim().length === 0) {
    throw new Error(`${name} requires a limitation`);
  }
  const sourceKeys = parameter.provenance.sourceKeys;
  if (sourceKeys.some((key) => key.length === 0 || key !== key.trim())) {
    throw new Error(`${name} source keys must be trimmed non-empty strings`);
  }
  if (new Set(sourceKeys).size !== sourceKeys.length) {
    throw new Error(`${name} source keys must be unique`);
  }
  if (
    parameter.provenance.classification !== "engineering" &&
    sourceKeys.length === 0
  ) {
    throw new Error(
      `${name} requires source keys for non-engineering evidence`,
    );
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

function nonNegativeSafeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
}
