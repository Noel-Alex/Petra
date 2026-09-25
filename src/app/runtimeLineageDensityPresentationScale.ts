import type { ComposedSimulationConfig } from "../sim/authoritative";
import { ecologyCapacityRepresentationTolerance } from "../sim/ecology/capacity";
import { assertComposedParameterSetBinding } from "../sim/parameterSetBinding";
import type { RunIdentity } from "../sim/protocol";
import {
  LINEAGE_DENSITY_PRESENTATION_SCALE_SCHEMA_VERSION,
  validateLineageDensityPresentationScale,
  type SourceOwnedFixedLineageDensityPresentationScale,
} from "../render/lineageDensityScale";

const BIOMASS_UNIT = "model-biomass" as const;
const SOURCE_IDENTITY_VERSION = "composed-lineage-density-scale-source/1" as const;

/**
 * Bind the renderer's temporally stable colony-density denominator to the exact
 * composed configuration/run branch that owns the scientific state.
 *
 * This is detached presentation authority. It is deliberately not checkpoint
 * state and never feeds back into simulation.
 */
export function projectRuntimeLineageDensityPresentationScale(
  config: ComposedSimulationConfig,
  identity: RunIdentity,
  runBranchIdentity: string,
): SourceOwnedFixedLineageDensityPresentationScale {
  if (
    typeof runBranchIdentity !== "string" ||
    runBranchIdentity.length === 0 ||
    runBranchIdentity !== runBranchIdentity.trim()
  ) {
    throw new Error(
      "lineage density presentation scale requires a canonical runtime branch identity",
    );
  }

  assertComposedParameterSetBinding(identity, config);
  const binding = identity.parameterSetBinding;

  const scale: SourceOwnedFixedLineageDensityPresentationScale = {
    schemaVersion: LINEAGE_DENSITY_PRESENTATION_SCALE_SCHEMA_VERSION,
    mode: "source-owned-fixed",
    unit: BIOMASS_UNIT,
    maximum: config.growth.localCapacity,
    sourceIdentity:
      SOURCE_IDENTITY_VERSION +
      ":" +
      JSON.stringify([
        runBranchIdentity,
        binding.schemaVersion,
        binding.authority,
        binding.parameterSetId,
        binding.parameterSetVersion,
        binding.configurationFingerprint,
      ]),
    // A lineage density channel is one Float32-owned biomass channel. Reuse
    // the simulator's exact representation allowance for one channel rather
    // than inventing a renderer epsilon or biological headroom.
    overflowTolerance: ecologyCapacityRepresentationTolerance(
      config.growth.localCapacity,
      1,
    ),
  };

  validateLineageDensityPresentationScale(scale);
  return Object.freeze(scale);
}
