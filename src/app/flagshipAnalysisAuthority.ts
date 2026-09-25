import flagshipScenario from "../../data/presets/ecoli_ciprofloxacin_v1.json";
import { composedConfigurationFingerprint } from "../sim/authoritative";
import type { GenotypeAnalysisEvidence } from "../sim/evolution/analysis";
import { buildCuratedMutationGraph } from "../sim/evolution/graph";
import type { FlagshipComposedRunPlan } from "../sim/flagshipComposition";
import {
  assertComposedParameterSetBinding,
  sameComposedParameterSetBinding,
} from "../sim/parameterSetBinding";
import type { RuntimeLineageAnalysisAuthority } from "./runtimeLineageAnalysis";

type UnknownRecord = Record<string, unknown>;

interface FlagshipGenotypeAnalysisRecord {
  readonly sourceOrder: number;
  readonly relativeFitness: number;
  readonly evidence: GenotypeAnalysisEvidence;
}

const scenario = requireRecord("flagship scenario", flagshipScenario as unknown);
const scenarioId = requireCanonicalText("flagship scenario id", scenario.id);
const scenarioVersion = requireCanonicalText(
  "flagship scenario version",
  scenario.version,
);
const FLAGSHIP_GENOTYPE_RECORDS = parseFlagshipGenotypeRecords(scenario);
const FLAGSHIP_EVOLUTION_GRAPH = buildCuratedMutationGraph(flagshipScenario);

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

  validateExactFlagshipEvolutionGraph(plan);
  validateEvidenceAgainstRunPlan(plan, FLAGSHIP_GENOTYPE_RECORDS);

  return Object.freeze({
    identity: structuredClone(plan.identity),
    configurationFingerprint: fingerprint,
    evolutionGraph: cloneEvolutionGraph(plan.config.evolutionGraph),
    genotypeEvidence: Object.freeze(
      FLAGSHIP_GENOTYPE_RECORDS.map((record) =>
        cloneGenotypeEvidence(record.evidence),
      ),
    ),
  });
}

function validateExactFlagshipEvolutionGraph(
  plan: FlagshipComposedRunPlan,
): void {
  const actual = plan.config.evolutionGraph;
  const expected = FLAGSHIP_EVOLUTION_GRAPH;

  if (
    actual.scenarioId !== expected.scenarioId ||
    actual.scenarioVersion !== expected.scenarioVersion
  ) {
    throw new Error(
      "flagship lineage-analysis evolution graph identity drifted from scenario authority",
    );
  }
  if (actual.genotypes.length !== expected.genotypes.length) {
    throw new Error(
      "flagship lineage-analysis evolution genotype set drifted from scenario authority",
    );
  }
  for (let index = 0; index < expected.genotypes.length; index += 1) {
    const candidate = actual.genotypes[index]!;
    const canonical = expected.genotypes[index]!;
    if (
      candidate.id !== canonical.id ||
      candidate.relativeFitness !== canonical.relativeFitness ||
      candidate.sourceOrder !== canonical.sourceOrder
    ) {
      throw new Error(
        `flagship lineage-analysis evolution genotype drifted from scenario authority at source order ${index}`,
      );
    }
  }

  if (actual.transitions.length !== expected.transitions.length) {
    throw new Error(
      "flagship lineage-analysis mutation transition set drifted from scenario authority",
    );
  }
  for (let index = 0; index < expected.transitions.length; index += 1) {
    const candidate = actual.transitions[index]!;
    const canonical = expected.transitions[index]!;
    if (
      candidate.fromGenotypeId !== canonical.fromGenotypeId ||
      candidate.toGenotypeId !== canonical.toGenotypeId ||
      candidate.probabilityPerDivision !== canonical.probabilityPerDivision ||
      candidate.mutationClass !== canonical.mutationClass ||
      candidate.citationKey !== canonical.citationKey ||
      candidate.note !== canonical.note ||
      candidate.sourceOrder !== canonical.sourceOrder
    ) {
      throw new Error(
        `flagship lineage-analysis mutation transition drifted from scenario authority at source order ${index}`,
      );
    }
  }
}

function validateEvidenceAgainstRunPlan(
  plan: FlagshipComposedRunPlan,
  records: readonly FlagshipGenotypeAnalysisRecord[],
): void {
  const graph = plan.config.evolutionGraph;
  if (graph.genotypes.length !== records.length) {
    throw new Error(
      "flagship lineage-analysis evidence must cover the exact evolution graph",
    );
  }

  const graphById = new Map(
    graph.genotypes.map((genotype) => [genotype.id, genotype] as const),
  );
  if (graphById.size !== graph.genotypes.length) {
    throw new Error("flagship evolution graph contains duplicate genotype ids");
  }

  const cipro = plan.config.ciprofloxacin;
  if (cipro === null || cipro.concentrationUnit !== "mg/L") {
    throw new Error(
      "flagship lineage-analysis authority requires composed ciprofloxacin MIC authority in mg/L",
    );
  }
  if (cipro.genotypeMicMgPerL.length !== records.length) {
    throw new Error(
      "flagship ciprofloxacin MIC authority must cover the exact analysis genotype set",
    );
  }
  const micById = new Map(
    cipro.genotypeMicMgPerL.map(
      (record) => [record.genotypeId, record.micMgPerL] as const,
    ),
  );
  if (micById.size !== cipro.genotypeMicMgPerL.length) {
    throw new Error(
      "flagship ciprofloxacin MIC authority contains duplicate genotype ids",
    );
  }

  for (const record of records) {
    const evidence = record.evidence;
    const genotype = graphById.get(evidence.genotypeId);
    if (genotype === undefined) {
      throw new Error(
        `flagship lineage-analysis evidence references genotype outside the evolution graph: ${evidence.genotypeId}`,
      );
    }
    if (genotype.sourceOrder !== record.sourceOrder) {
      throw new Error(
        `flagship evolution graph source order drifted for genotype ${evidence.genotypeId}`,
      );
    }
    if (genotype.relativeFitness !== record.relativeFitness) {
      throw new Error(
        `flagship lineage-analysis relative fitness drifted from scenario authority for genotype ${evidence.genotypeId}`,
      );
    }

    const mic = micById.get(evidence.genotypeId);
    if (mic === undefined || evidence.ciprofloxacin === undefined) {
      throw new Error(
        `flagship lineage-analysis MIC authority is missing genotype ${evidence.genotypeId}`,
      );
    }
    if (mic !== evidence.ciprofloxacin.micMgPerL) {
      throw new Error(
        `flagship lineage-analysis MIC drifted from composed authority for genotype ${evidence.genotypeId}`,
      );
    }
  }

  if (graphById.size !== records.length || micById.size !== records.length) {
    throw new Error(
      "flagship lineage-analysis evidence identity does not exactly match composed genotype authority",
    );
  }
}

function parseFlagshipGenotypeRecords(
  scenarioRecord: UnknownRecord,
): readonly FlagshipGenotypeAnalysisRecord[] {
  if (
    !Array.isArray(scenarioRecord.genotypes) ||
    scenarioRecord.genotypes.length === 0
  ) {
    throw new Error("flagship scenario genotypes must be a non-empty array");
  }

  const seen = new Set<string>();
  return Object.freeze(
    scenarioRecord.genotypes.map((value, sourceOrder) => {
      const genotype = requireRecord(
        `flagship scenario genotype ${sourceOrder}`,
        value,
      );
      const genotypeId = requireCanonicalText(
        `flagship scenario genotype ${sourceOrder} id`,
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

      const evidence: GenotypeAnalysisEvidence = Object.freeze({
        genotypeId,
        label,
        ciprofloxacin: Object.freeze({
          micMgPerL,
          responseShift: null,
        }),
        sourceKeys: Object.freeze([citation]),
        assumptionKeys: Object.freeze([]),
      });

      return Object.freeze({
        sourceOrder,
        relativeFitness,
        evidence,
      });
    }),
  );
}

function cloneGenotypeEvidence(
  evidence: GenotypeAnalysisEvidence,
): GenotypeAnalysisEvidence {
  return Object.freeze({
    genotypeId: evidence.genotypeId,
    label: evidence.label,
    ...(evidence.ciprofloxacin === undefined
      ? {}
      : {
          ciprofloxacin: Object.freeze({
            micMgPerL: evidence.ciprofloxacin.micMgPerL,
            responseShift:
              evidence.ciprofloxacin.responseShift === null
                ? null
                : Object.freeze({ ...evidence.ciprofloxacin.responseShift }),
          }),
        }),
    sourceKeys: Object.freeze([...evidence.sourceKeys]),
    assumptionKeys: Object.freeze([...evidence.assumptionKeys]),
  });
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
