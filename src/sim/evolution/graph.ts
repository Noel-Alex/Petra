import type { MutationTarget } from './mutation'

export interface CuratedGenotypeNode {
  readonly id: string
  readonly relativeFitness: number
  readonly sourceOrder: number
}

export interface CuratedMutationEdge {
  readonly fromGenotypeId: string
  readonly toGenotypeId: string
  readonly probabilityPerDivision: number
  readonly mutationClass: string
  readonly citationKey: string
  readonly note?: string
  readonly sourceOrder: number
}

export interface CuratedMutationGraph {
  readonly scenarioId: string
  readonly scenarioVersion: string
  readonly genotypes: readonly CuratedGenotypeNode[]
  readonly transitions: readonly CuratedMutationEdge[]
}

/**
 * Builds the authoritative curated evolution graph from an already-parsed
 * scenario record.
 *
 * The adapter is deliberately strict and lossless for evolution semantics:
 * it preserves scenario order, relative fitness, edge probability, domain
 * mutation classification, citation key, and note. It never derives mutation
 * probability from drug concentration, MIC, phenotype, provenance badges, or
 * aggregate validation rates.
 */
export function buildCuratedMutationGraph(scenario: unknown): CuratedMutationGraph {
  if (!isRecord(scenario)) {
    throw new Error('evolution scenario must be an object')
  }

  const scenarioId = requiredString(scenario.id, 'scenario id')
  const scenarioVersion = requiredString(scenario.version, 'scenario version')
  const genotypeRecords = requiredArray(scenario.genotypes, 'scenario genotypes')
  const transitionRecords = requiredArray(
    scenario.mutationTransitions,
    'scenario mutationTransitions',
  )

  const genotypeIds = new Set<string>()
  const genotypes = genotypeRecords.map((value, sourceOrder) => {
    if (!isRecord(value)) {
      throw new Error(`genotype record ${sourceOrder} must be an object`)
    }

    const id = requiredString(value.id, `genotype record ${sourceOrder} id`)
    if (genotypeIds.has(id)) {
      throw new Error(`duplicate genotype id: ${id}`)
    }

    const relativeFitness = requiredFiniteNumber(
      value.relativeFitness,
      `genotype ${id} relativeFitness`,
    )
    if (relativeFitness <= 0) {
      throw new Error(`genotype ${id} relativeFitness must be positive`)
    }

    genotypeIds.add(id)
    return Object.freeze({
      id,
      relativeFitness,
      sourceOrder,
    }) satisfies CuratedGenotypeNode
  })

  const edgeIds = new Set<string>()
  const probabilitySums = new Map<string, number>()
  const transitions = transitionRecords.map((value, sourceOrder) => {
    if (!isRecord(value)) {
      throw new Error(`mutation transition ${sourceOrder} must be an object`)
    }

    const fromGenotypeId = requiredString(
      value.from,
      `mutation transition ${sourceOrder} from`,
    )
    const toGenotypeId = requiredString(
      value.to,
      `mutation transition ${sourceOrder} to`,
    )

    if (!genotypeIds.has(fromGenotypeId)) {
      throw new Error(
        `mutation transition ${sourceOrder} references unknown source genotype: ${fromGenotypeId}`,
      )
    }
    if (!genotypeIds.has(toGenotypeId)) {
      throw new Error(
        `mutation transition ${sourceOrder} references unknown target genotype: ${toGenotypeId}`,
      )
    }
    if (fromGenotypeId === toGenotypeId) {
      throw new Error(
        `mutation transition ${sourceOrder} must change genotype state`,
      )
    }

    const edgeId = `${fromGenotypeId}->${toGenotypeId}`
    if (edgeIds.has(edgeId)) {
      throw new Error(`duplicate mutation transition: ${edgeId}`)
    }

    const probabilityPerDivision = requiredFiniteNumber(
      value.probabilityPerDivision,
      `mutation transition ${edgeId} probabilityPerDivision`,
    )
    if (probabilityPerDivision < 0 || probabilityPerDivision > 1) {
      throw new Error(
        `mutation transition ${edgeId} probabilityPerDivision must be in [0, 1]`,
      )
    }

    const mutationClass = requiredString(
      value.classification,
      `mutation transition ${edgeId} classification`,
    )
    const citationKey = requiredString(
      value.citation,
      `mutation transition ${edgeId} citation`,
    )
    const note = optionalString(value.note, `mutation transition ${edgeId} note`)

    const sourceProbability =
      (probabilitySums.get(fromGenotypeId) ?? 0) + probabilityPerDivision
    if (sourceProbability > 1 + Number.EPSILON) {
      throw new Error(
        `mutation probabilities from genotype ${fromGenotypeId} cannot sum above 1`,
      )
    }
    probabilitySums.set(fromGenotypeId, sourceProbability)
    edgeIds.add(edgeId)

    return Object.freeze({
      fromGenotypeId,
      toGenotypeId,
      probabilityPerDivision,
      mutationClass,
      citationKey,
      ...(note === undefined ? {} : { note }),
      sourceOrder,
    }) satisfies CuratedMutationEdge
  })

  return Object.freeze({
    scenarioId,
    scenarioVersion,
    genotypes: Object.freeze(genotypes),
    transitions: Object.freeze(transitions),
  })
}

/**
 * Returns exact-sampler targets in authoritative scenario transition order.
 * Ordering is replay-sensitive because the categorical sampler consumes one RNG
 * draw against cumulative target probabilities.
 */
export function mutationTargetsForSource(
  graph: CuratedMutationGraph,
  sourceGenotypeId: string,
): readonly MutationTarget[] {
  assertKnownGenotype(graph, sourceGenotypeId)

  return Object.freeze(
    graph.transitions
      .filter((edge) => edge.fromGenotypeId === sourceGenotypeId)
      .map((edge) =>
        Object.freeze({
          genotypeId: edge.toGenotypeId,
          probabilityPerDivision: edge.probabilityPerDivision,
        }),
      ),
  )
}

export function mutationEdgesForSource(
  graph: CuratedMutationGraph,
  sourceGenotypeId: string,
): readonly CuratedMutationEdge[] {
  assertKnownGenotype(graph, sourceGenotypeId)
  return Object.freeze(
    graph.transitions.filter((edge) => edge.fromGenotypeId === sourceGenotypeId),
  )
}

export function relativeFitnessForGenotype(
  graph: CuratedMutationGraph,
  genotypeId: string,
): number {
  const genotype = graph.genotypes.find((candidate) => candidate.id === genotypeId)
  if (genotype === undefined) {
    throw new Error(`unknown genotype: ${genotypeId}`)
  }
  return genotype.relativeFitness
}

function assertKnownGenotype(
  graph: CuratedMutationGraph,
  genotypeId: string,
): void {
  if (!graph.genotypes.some((genotype) => genotype.id === genotypeId)) {
    throw new Error(`unknown genotype: ${genotypeId}`)
  }
}

function requiredArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`)
  }
  return value
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`)
  }
  return value.trim()
}

function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined
  return requiredString(value, label)
}

function requiredFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`)
  }
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
