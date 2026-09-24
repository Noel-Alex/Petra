import {
  relativeFitnessForGenotype,
  type CuratedMutationGraph,
} from "./graph";

export interface EvolutionScenarioIdentity {
  readonly scenarioId: string;
  readonly scenarioVersion: string;
}

export interface ActiveLineageGenotype {
  readonly lineageId: string;
  readonly genotypeId: string;
}

export interface LineageFitnessBinding extends ActiveLineageGenotype {
  readonly relativeFitness: number;
}

/**
 * Binds replay-sensitive active lineage channel order to scenario-owned genotype
 * fitness without allowing composition code to re-enter fitness values manually.
 *
 * This adapter intentionally projects only identity + relative fitness. Drug
 * response/death hazard, mutation opportunity counts, and spatial biomass remain
 * owned by their respective authoritative mechanisms.
 */
export function bindLineageFitness(
  graph: CuratedMutationGraph,
  expectedScenario: EvolutionScenarioIdentity,
  lineages: readonly ActiveLineageGenotype[],
): readonly LineageFitnessBinding[] {
  assertScenarioIdentity(graph, expectedScenario);

  const lineageIds = new Set<string>();
  return Object.freeze(
    lineages.map((lineage, channelIndex) => {
      const lineageId = requiredIdentity(
        lineage.lineageId,
        `lineage channel ${channelIndex} lineageId`,
      );
      const genotypeId = requiredIdentity(
        lineage.genotypeId,
        `lineage ${lineageId} genotypeId`,
      );

      if (lineageIds.has(lineageId)) {
        throw new Error(`duplicate active lineage id: ${lineageId}`);
      }
      lineageIds.add(lineageId);

      return Object.freeze({
        lineageId,
        genotypeId,
        relativeFitness: relativeFitnessForGenotype(graph, genotypeId),
      });
    }),
  );
}

function assertScenarioIdentity(
  graph: CuratedMutationGraph,
  expected: EvolutionScenarioIdentity,
): void {
  const scenarioId = requiredIdentity(expected.scenarioId, "expected scenarioId");
  const scenarioVersion = requiredIdentity(
    expected.scenarioVersion,
    "expected scenarioVersion",
  );

  if (
    graph.scenarioId !== scenarioId ||
    graph.scenarioVersion !== scenarioVersion
  ) {
    throw new Error(
      `evolution graph scenario mismatch: expected ${scenarioId}@${scenarioVersion}, received ${graph.scenarioId}@${graph.scenarioVersion}`,
    );
  }
}

function requiredIdentity(value: string, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}
