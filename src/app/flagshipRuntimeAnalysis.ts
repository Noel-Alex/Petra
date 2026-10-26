import { resolveLineageVisualIdentity } from "../design/lineageIdentity";
import { petraVisualColorCssVariableName } from "../design/visualTokens";
import type { RunIdentity } from "../sim/protocol";
import { assertReplayCompatibility } from "../sim/replayCompatibility";
import type { AuthoritativeMetricSeriesConfig } from "./analysisMetrics";
import {
  createFlagshipRuntimeLineageAnalysisAuthority,
} from "./flagshipAnalysisAuthority";
import {
  createFlagshipLiveAnalysisHistory,
} from "./flagshipMetricAuthority";
import {
  buildDefaultFlagshipRunForSeed,
  type DefaultFlagshipRun,
} from "./flagshipRunPreset";
import type { LiveAnalysisHistory } from "./liveAnalysisHistory";
import type { RuntimeLineageAnalysisAuthority } from "./runtimeLineageAnalysis";

export interface FlagshipRuntimeAnalysisDefinition {
  readonly run: DefaultFlagshipRun;
  readonly lineageAuthority: RuntimeLineageAnalysisAuthority;
  readonly seriesConfig: AuthoritativeMetricSeriesConfig;
  createHistory(): LiveAnalysisHistory;
}

/**
 * Assemble the existing scenario-owned analysis authorities for one seed.
 * This adapter only joins those authorities; it adds no metric or biology.
 */
export function createFlagshipRuntimeAnalysisDefinition(
  seed: number,
): FlagshipRuntimeAnalysisDefinition {
  const run = buildDefaultFlagshipRunForSeed(seed);
  const lineageAuthority = createFlagshipRuntimeLineageAnalysisAuthority(
    run.plan,
  );
  const seriesConfig: AuthoritativeMetricSeriesConfig = Object.freeze({
    biomassUnit: "model-biomass",
    resourceUnit: "model-resource",
    fractionUnit: "fraction",
    diversityUnit: "nats",
    totalBiomassStyle: scalarStyle("petra-color-coral", "solid-ring"),
    totalResourceStyle: scalarStyle("petra-color-mint", "double-ring"),
    resistantFractionStyle: scalarStyle("petra-color-amber", "inner-ring"),
    lineageDiversityStyle: scalarStyle("petra-color-teal", "wide-halo"),
    genotypes: Object.freeze(
      lineageAuthority.genotypeEvidence.map((genotype) => {
        const identity = resolveLineageVisualIdentity(genotype.genotypeId);
        return Object.freeze({
          genotypeId: genotype.genotypeId,
          label: genotype.label,
          appearanceToken: petraVisualColorCssVariableName(
            identity.colorToken,
          ).slice(2),
          patternToken: identity.patternToken,
        });
      }),
    ),
  });

  return Object.freeze({
    run,
    lineageAuthority,
    seriesConfig,
    createHistory: () => createFlagshipLiveAnalysisHistory(run.plan),
  });
}

export function isFlagshipRuntimeAnalysisCompatible(
  definition: FlagshipRuntimeAnalysisDefinition,
  identity: RunIdentity,
): boolean {
  try {
    assertReplayCompatibility({
      artifactIdentity: definition.run.plan.identity,
      targetIdentity: identity,
      artifactAuthority: "composed",
      targetAuthority: "composed",
    });
    return true;
  } catch {
    return false;
  }
}

function scalarStyle(appearanceToken: string, patternToken: string) {
  return Object.freeze({ appearanceToken, patternToken });
}
