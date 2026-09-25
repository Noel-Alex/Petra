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
      sourceUncertainty: buildGenotypeMeasurementUncertainty(
        genotype.measurementUncertainty,
      ),
    }),
  );

  const composition = resolveScenarioProvenance({
    id: `drug-policy:${scenario.drug.resourceDrugCompositionPolicy.id}`,
    label: "Resource × ciprofloxacin loss policy",
    record: scenario.drug.resourceDrugCompositionPolicy as ProvenanceRecord,
    scenario: context,
    valueText: scenario.drug.resourceDrugCompositionPolicy.id,
  });

  const executionProfile = resolveScenarioProvenance({
    id: `execution-profile:${scenario.executionProfile.id}@${scenario.executionProfile.version}`,
    label: "Research-stage ecology execution profile",
    record: scenario.executionProfile as ProvenanceRecord,
    scenario: context,
    valueText:
      `${scenario.executionProfile.id} v${scenario.executionProfile.version}`,
    units: "time: hour; resource: model-resource; biomass: model-biomass",
  });

  const composedParameterSet = resolveScenarioProvenance({
    id: `composed-parameter-set:${scenario.composedParameterSet.id}@${scenario.composedParameterSet.version}`,
    label: "Baseline composed parameter set",
    record: scenario.composedParameterSet as ProvenanceRecord,
    scenario: context,
    valueText:
      `${scenario.composedParameterSet.id} v${scenario.composedParameterSet.version}`,
  });

  const resourceContext = resolveScenarioProvenance({
    id: `resource-context:${scenario.environment.resourceContext.version}`,
    label: "Limiting-resource context",
    record: scenario.environment.resourceContext as ProvenanceRecord,
    scenario: context,
    valueText:
      `${scenario.environment.resourceContext.version} · ${scenario.environment.resourceContext.representation}`,
    units: scenario.environment.resourceContext.concentrationUnit,
  });

  const referencePharmacodynamics = resolveScenarioProvenance({
    id: "drug-reference-pd:regoes-cab1-ciprofloxacin",
    label: `Reference ciprofloxacin response · ${scenario.drug.referencePharmacodynamics.sourceOrganism}, ${scenario.drug.referencePharmacodynamics.sourceCondition}`,
    record: scenario.drug.referencePharmacodynamics as ProvenanceRecord,
    scenario: context,
    valueText:
      `ψmax ${scenario.drug.referencePharmacodynamics.psiMax_log10DensitySlope_per_h}/h · ψmin ${scenario.drug.referencePharmacodynamics.psiMin_log10DensitySlope_per_h}/h · κ ${scenario.drug.referencePharmacodynamics.kappa} · zMIC ${scenario.drug.referencePharmacodynamics.zMIC_mg_L} mg/L · conventional MIC ${scenario.drug.referencePharmacodynamics.conventionalMIC_mg_L} mg/L`,
    units:
      "ψ rates: log10-density slope per hour; κ: dimensionless; concentrations: mg/L",
  });

  const interventionEnvelope = resolveScenarioProvenance({
    id: "drug-intervention-envelope:ciprofloxacin",
    label: "Ciprofloxacin intervention control envelope",
    record: scenario.drug.interventionControl.sourceTestedDomain as ProvenanceRecord,
    scenario: context,
    valueText:
      `${scenario.drug.interventionControl.sourceTestedDomain.minimumMgPerL}–${scenario.drug.interventionControl.sourceTestedDomain.maximumMgPerL} mg/L`,
    units: "mg/L",
  });

  const interventionDefault = resolveScenarioProvenance({
    id: "drug-intervention-default:ciprofloxacin",
    label: "Initial ciprofloxacin control reference",
    record: scenario.drug.interventionControl.defaultSelection as ProvenanceRecord,
    scenario: context,
    valueText:
      `${scenario.drug.interventionControl.defaultSelection.valueMgPerL} mg/L`,
    units: "mg/L",
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
    records: [
      composedParameterSet,
      executionProfile,
      resourceContext,
      referencePharmacodynamics,
      interventionEnvelope,
      interventionDefault,
      composition,
      ...genotypeRecords,
      ...mutationRecords,
    ],
    assumptions: resolveScenarioTransferAssumptions(context),
  };
}

function buildGenotypeMeasurementUncertainty(
  uncertainty: FlagshipScenario["genotypes"][number]["measurementUncertainty"],
) {
  const micSteps = uncertainty.mic.plusMinusSteps;
  const experiments =
    uncertainty.relativeFitness.independentCompetitionExperiments;

  return [
    {
      kind: "reported-margin" as const,
      scope: "measurement" as const,
      quantityLabel: "Ciprofloxacin MIC",
      plusMinus: micSteps,
      unit: micSteps === 1 ? "half-doubling step" : "half-doubling steps",
    },
    {
      kind: "standard-deviation" as const,
      scope: "measurement" as const,
      quantityLabel: "Relative fitness",
      value: uncertainty.relativeFitness.standardDeviation,
      unit: "dimensionless",
      supportingText:
        String(experiments) +
        " independent competition experiment" +
        (experiments === 1 ? "" : "s"),
    },
  ];
}
