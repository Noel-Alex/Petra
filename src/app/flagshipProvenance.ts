import flagshipScenario from "../../data/presets/ecoli_ciprofloxacin_v1.json";
import {
  resolveScenarioProvenance,
  resolveScenarioTransferAssumptions,
  type ScenarioAssumptionsResolution,
  type ScenarioProvenanceResolution,
} from "../ui/provenance/scenarioAdapter";

type FlagshipScenario = typeof flagshipScenario;

type ProvenanceRecord = {
  readonly provenance?: unknown;
};

export interface FlagshipScenarioIdentity {
  readonly id: string;
  readonly version: string;
  readonly title: string;
}

export interface FlagshipProvenanceView {
  readonly scenario: FlagshipScenarioIdentity;
  readonly records: readonly ScenarioProvenanceResolution[];
  readonly assumptions: ScenarioAssumptionsResolution;
}

/**
 * Presentation-only projection of the versioned flagship scenario provenance.
 *
 * The scenario data remains authoritative for identity, evidence classes and
 * citations; this adapter only supplies human labels/value text and never
 * infers a class.
 */
export function buildFlagshipProvenanceView(
  scenario: FlagshipScenario = flagshipScenario,
): FlagshipProvenanceView {
  const context = {
    citations: scenario.citations,
    transferAssumptions: scenario.transferAssumptions,
  };

  const genotypeRecords = scenario.genotypes.map((genotype) =>
    resolveScenarioProvenance({
      id: `genotype:${genotype.id}`,
      label: `${genotype.label} phenotype`,
      record: genotype as ProvenanceRecord,
      scenario: context,
      valueText: `MIC ${genotype.mic_mg_L} mg/L · relative fitness ${genotype.relativeFitness}`,
      units: "MIC: mg/L; relative fitness: dimensionless",
    }),
  );

  const composition = resolveScenarioProvenance({
    id: `drug-policy:${scenario.drug.resourceDrugCompositionPolicy.id}`,
    label: "Resource × ciprofloxacin loss policy",
    record: scenario.drug.resourceDrugCompositionPolicy as ProvenanceRecord,
    scenario: context,
    valueText: scenario.drug.resourceDrugCompositionPolicy.id,
  });

  const mutationRecords = scenario.mutationTransitions.map((transition) =>
    resolveScenarioProvenance({
      id: `mutation:${transition.from}->${transition.to}`,
      label: `${transition.from} → ${transition.to} mutation target`,
      record: transition as ProvenanceRecord,
      scenario: context,
      valueText: `${transition.probabilityPerDivision} per division`,
      units: "probability per division opportunity",
    }),
  );

  return {
    scenario: {
      id: scenario.id,
      version: scenario.version,
      title: scenario.title,
    },
    records: [composition, ...genotypeRecords, ...mutationRecords],
    assumptions: resolveScenarioTransferAssumptions(context),
  };
}
