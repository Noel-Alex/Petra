import flagshipScenario from "../../data/presets/ecoli_ciprofloxacin_v1.json";
import {
  composedConfigurationFingerprint,
} from "../sim/authoritative";
import type { GenotypeAnalysisEvidence } from "../sim/evolution/analysis";
import type { FlagshipComposedRunPlan } from "../sim/flagshipComposition";
import {
  assertComposedParameterSetBinding,
  sameComposedParameterSetBinding,
} from "../sim/parameterSetBinding";
import type { RuntimeLineageAnalysisAuthority } from "./runtimeLineageAnalysis";

type UnknownRecord = Record<string, unknown>;

const scenario = requireRecord("flagship scenario", flagshipScenario as unknown);
const scenarioId = requireCanonicalText("flagship scenario id", scenario.id);
const scenarioVersion = requireCanonicalText(
  "flagship scenario version",
  scenario.version,
);
const FLAGSHIP_GENOTYPE_EVIDENCE = parseFlagshipGenotypeEvidence(scenario);

/**
 * Assemble the exact scientific evidence required by runtime lineage analysis
 * for one provenance-bound flagship run.
 *
 * This adapter does not define "resistant" membership or metric cadence. Those
 * remain separate metric authority (#1074). It also does not derive a response
 * shift from MIC ratios for presentation: the current scenario supplies exact
 * genotype MICs, while response-shift evidence remains explicitly absent.
 */
export function createFlagshipRuntimeLineageAnalysisAuthority(
  plan: FlagshipComposedRunPlan,
): RuntimeLineageAnalysisAuthority {
  if (
    plan.identity.scenarioId !== scenarioId ||
    plan.identity.scenarioVersion !== scenarioVersion
  ) {
    throw new Error(
      "flagship lineage-analysis authority requires the exact bundled scenario identity",
    );
  }

  if (
    plan.config.evolutionScenario.scenarioId !== scenarioId ||
    plan.config.evolutionScenario.scenarioVersion !== scenarioVersion ||
    plan.config.evolutionGraph.scenarioId !== scenarioId ||
    plan.config.evolutionGraph.scenarioVersion !== scenarioVersion
  ) {
    throw new Error(
      "flagship lineage-analysis evolution authority must match the bundled scenario",
    );
  }

  assertComposedParameterSetBinding(plan.identity, plan.config);
  if (
    !sameComposedParameterSetBinding(
      plan.identity.parameterSetBinding,
      plan.parameterSetBinding,
    )
  ) {
    throw new Error(
      "flagship lineage-analysis plan parameter-set binding is internally inconsistent",
    );
  }

  const fingerprint = composedConfigurationFingerprint(plan.config);
  if (plan.parameterSetBinding.configurationFingerprint !== fingerprint) {
    throw new Error(
      "flagship lineage-analysis configuration fingerprint does not match the plan binding",
    );
  }

  validateEvidenceAgainstRunPlan(plan, FLAGSHIP_GENOTYPE_EVIDENCE);

  return Object.freeze({
    identity: structuredClone(plan.identity),
    configurationFingerprint: fingerprint,
    evolutionGraph: cloneEvolutionGraph(plan.config.evolutionGraph),
    genotypeEvidence: Object.freeze(
      FLAGSHIP_GENOTYPE_EVIDENCE.map((evidence) =>
        Object.freeze({
          genotypeId: evidence.genotypeId,
          label: evidence.label,
          ciprofloxacin:
            evidence.ciprofloxacin === undefined
              ? undefined
              : Object.freeze({
                  micMgPerL: evidence.ciprofloxacin.micMgPerL,
                  responseShift: null,
                }),
          sourceKeys: Object.freeze([...evidence.sourceKeys]),
          assumptionKeys: Object.freeze([...evidence.assumptionKeys]),
        }),
      ),
    ),
  });
}

function validateEvidenceAgainstRunPlan(
  plan: FlagshipComposedRunPlan,
  evidence: readonly GenotypeAnalysisEvidence[],
): void {
  const graph = plan.config.evolutionGraph;
  if (graph.genotypes.length !== evidence.length) {
    throw new Error(
      "flagship lineage-analysis evidence must cover the exact evolution graph",
    );
  }

  const graphById = new Map(
    graph.genotypes.map((genotype) => [genotype.id, genotype] as const),
  );
  const cipro = plan.config.ciprofloxacin;
  if (cipro === null || cipro.concentrationUnit !== "mg/L") {
    throw new Error(
      "flagship lineage-analysis authority requires composed ciprofloxacin MIC authority in mg/L",
    );
  }
  if (cipro.genotypeMicMgPerL.length !== evidence.length) {
    throw new Error(
      "flagship ciprofloxacin MIC authority must cover the exact analysis genotype set",
    );
  }
  const micById = new Map(
    cipro.genotypeMicMgPerL.map((record) => [record.genotypeId, record.micMgPerL] as const),
  );
  if (micById.size !== cipro.genotypeMicMgPerL.length) {
    throw new Error("flagship ciprofloxacin MIC authority contains duplicate genotype ids");
  }

  for (let index = 0; index < evidence.length; index += 1) {
    const record = evidence[index]!;
    const genotype = graphById.get(record.genotypeId);
    if (genotype === undefined) {
      throw new Error(
        `flagship lineage-analysis evidence references genotype outside the evolution graph: ${record.genotypeId}`,
      );
    }
    if (genotype.sourceOrder !== index) {
      throw new Error(
        `flagship evolution graph source order drifted for genotype ${record.genotypeId}`,
      );
    }
    const mic = micById.get(record.genotypeId);
    if (mic === undefined || record.ciprofloxacin === undefined) {
      throw new Error(
        `flagship lineage-analysis MIC authority is missing genotype ${record.genotypeId}`,
      );
    }
    if (mic !== record.ciprofloxacin.micMgPerL) {
      throw new Error(
        `flagship lineage-analysis MIC drifted from composed authority for genotype ${record.genotypeId}`,
      );
    }
  }

  if (graphById.size !== evidence.length || micById.size !== evidence.length) {
    throw new Error(
      "flagship lineage-analysis evidence identity does not exactly match composed genotype authority",
    );
  }
}

function parseFlagshipGenotypeEvidence(
  scenarioRecord: UnknownRecord,
): readonly GenotypeAnalysisEvidence[] {
  if (!Array.isArray(scenarioRecord.genotypes) || scenarioRecord.genotypes.length === 0) {
    throw new Error("flagship scenario genotypes must be a non-empty array");
  }

  const seen = new Set<string>();
  return Object.freeze(
    scenarioRecord.genotypes.map((value, index) => {
      const genotype = requireRecord(
        `flagship scenario genotype ${index}`,
        value,
      );
      const genotypeId = requireCanonicalText(
        `flagship scenario genotype ${index} id`,
        genotype.id,
      );
      if (seen.has(genotypeId)) {
        throw new Error(`duplicate flagship genotype id: ${genotypeId}`);
      }
      seen.add(genotypeId);

      const label = requireCanonicalText(
        `flagship scenario genotype ${genotypeId} label`,
        genotype.label,
      );
      const citation = requireCanonicalText(
        `flagship scenario genotype ${genotypeId} citation`,
        genotype.citation,
      );
      const micMgPerL = requirePositiveFinite(
        `flagship scenario genotype ${genotypeId} mic_mg_L`,
        genotype.mic_mg_L,
      );
      const relativeFitness = requirePositiveFinite(
        `flagship scenario genotype ${genotypeId} relativeFitness`,
        genotype.relativeFitness,
      );

      const provenance = requireRecord(
        `flagship scenario genotype ${genotypeId} provenance`,
        genotype.provenance,
      );
      if (
        provenance.classification !== "measured" ||
        requireCanonicalText(
          `flagship scenario genotype ${genotypeId} provenance citation`,
          provenance.citation,
        ) !== citation
      ) {
        throw new Error(
          `flagship genotype ${genotypeId} analysis evidence requires measured provenance matching its citation`,
        );
      }

      return Object.freeze({
        genotypeId,
        label,
        ciprofloxacin: Object.freeze({
          micMgPerL,
          responseShift: null,
        }),
        sourceKeys: Object.freeze([citation]),
        assumptionKeys: Object.freeze([]),
        __relativeFitness: relativeFitness,
      });
    }),
  ).map(({ __relativeFitness: _unused, ...record }) => Object.freeze(record));
}

function cloneEvolutionGraph(
  graph: FlagshipComposedRunPlan["config"]["evolutionGraph"],
): FlagshipComposedRunPlan["config"]["evolutionGraph"] {
  return Object.freeze({
    scenarioId: graph.scenarioId,
    scenarioVersion: graph.scenarioVersion,
    genotypes: Object.freeze(
      graph.genotypes.map((genotype) => Object.freeze({ ...genotype })),
    ),
    transitions: Object.freeze(
      graph.transitions.map((transition) => Object.freeze({ ...transition })),
    ),
  });
}

function requireRecord(name: string, value: unknown): UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  return value as UnknownRecord;
}

function requireCanonicalText(name: string, value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value
  ) {
    throw new Error(`${name} must be canonical non-empty text`);
  }
  return value;
}

function requirePositiveFinite(name: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be positive and finite`);
  }
  return value;
}
