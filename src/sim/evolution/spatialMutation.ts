import type { DiscretePopulationAdvanceResult } from '../populationAuthority'
import { SimulationRng } from '../rng'
import {
  runSamplingTransaction,
  samplingExecutionPolicyIdentity,
  validateSamplingExecutionPolicy,
  type SamplingExecutionPolicy,
} from '../samplingPolicy'
import {
  mutationEdgesForSource,
  mutationTargetsForSource,
  type CuratedMutationEdge,
  type CuratedMutationGraph,
} from './graph'
import {
  sampleDivisionMutationsWithPolicy,
  type MutationSamplingMode,
  type MutationTarget,
} from './mutation'

export interface SpatialMutationBirthCount {
  readonly targetGenotypeId: string
  readonly mutationClass: string
  readonly citationKey: string
  readonly count: number
}

export interface SpatialMutationCellOutcome {
  readonly sourceLineageId: string
  readonly sourceGenotypeId: string
  readonly cellIndex: number
  readonly divisionOpportunities: number
  readonly mutationBirths: readonly SpatialMutationBirthCount[]
  readonly sampling: Readonly<{
    readonly mode: MutationSamplingMode
    readonly rngDraws: number
  }>
}

export interface SpatialMutationBatchResult {
  readonly populationConfigurationIdentity: string
  readonly populationRevision: number
  readonly samplingPolicyIdentity: string
  readonly cells: readonly SpatialMutationCellOutcome[]
  readonly totalDivisionOpportunities: number
  readonly totalMutantBirths: number
  readonly rngDraws: number
}

interface LineageMutationPlan {
  readonly sourceLineageId: string
  readonly sourceGenotypeId: string
  readonly edges: readonly CuratedMutationEdge[]
  readonly targets: readonly MutationTarget[]
}

/**
 * Samples spatial mutation births from #562's reviewed integer opportunity seam.
 *
 * This function does not create lineage IDs or mutate biomass. It preserves the
 * source lineage/cell identity required for a later authoritative composition
 * layer to materialize child lineages transactionally.
 *
 * The entire spatial batch is one RNG transaction. A malformed later channel
 * or sampling-policy refusal therefore cannot leave caller RNG partially
 * consumed after earlier cells.
 */
export function sampleSpatialDivisionMutations(args: {
  readonly population: DiscretePopulationAdvanceResult
  readonly genotypeIds: readonly string[]
  readonly graph: CuratedMutationGraph
  readonly rng: SimulationRng
  readonly policy: SamplingExecutionPolicy
}): SpatialMutationBatchResult {
  validateSamplingExecutionPolicy(args.policy)
  const policyIdentity = samplingExecutionPolicyIdentity(args.policy)
  validatePopulationOpportunityResult(args.population, args.genotypeIds)

  const lineagePlans = buildLineagePlans(
    args.population,
    args.genotypeIds,
    args.graph,
  )

  return runSamplingTransaction(args.rng, (transactionRng) => {
    const cells: SpatialMutationCellOutcome[] = []
    let totalMutantBirths = 0
    let totalRngDraws = 0

    for (
      let lineageIndex = 0;
      lineageIndex < lineagePlans.length;
      lineageIndex += 1
    ) {
      const plan = lineagePlans[lineageIndex]!
      const opportunities =
        args.population.divisionOpportunities[lineageIndex]!

      for (let cellIndex = 0; cellIndex < opportunities.length; cellIndex += 1) {
        const divisions = opportunities[cellIndex]!
        if (divisions === 0) continue

        const sampled = sampleDivisionMutationsWithPolicy(
          divisions,
          plan.targets,
          transactionRng,
          args.policy,
        )
        if (sampled.diagnostics.policyIdentity !== policyIdentity) {
          throw new Error('mutation sampling policy identity drift')
        }
        if (sampled.counts.length !== plan.edges.length) {
          throw new Error('mutation sampler target count drift')
        }

        let cellMutantBirths = 0
        const mutationBirths = sampled.counts.map((sampledCount, index) => {
          const edge = plan.edges[index]!
          if (sampledCount.genotypeId !== edge.toGenotypeId) {
            throw new Error('mutation sampler target identity drift')
          }
          cellMutantBirths = safeIntegerAdd(
            'cell mutant births',
            cellMutantBirths,
            sampledCount.count,
          )
          return Object.freeze({
            targetGenotypeId: edge.toGenotypeId,
            mutationClass: edge.mutationClass,
            citationKey: edge.citationKey,
            count: sampledCount.count,
          }) satisfies SpatialMutationBirthCount
        })

        if (cellMutantBirths > divisions) {
          throw new Error(
            'sampled mutant births cannot exceed division opportunities',
          )
        }

        totalMutantBirths = safeIntegerAdd(
          'total mutant births',
          totalMutantBirths,
          cellMutantBirths,
        )
        totalRngDraws = safeIntegerAdd(
          'total mutation RNG draws',
          totalRngDraws,
          sampled.diagnostics.rngDraws,
        )

        cells.push(
          Object.freeze({
            sourceLineageId: plan.sourceLineageId,
            sourceGenotypeId: plan.sourceGenotypeId,
            cellIndex,
            divisionOpportunities: divisions,
            mutationBirths: Object.freeze(mutationBirths),
            sampling: Object.freeze({
              mode: sampled.diagnostics.mode,
              rngDraws: sampled.diagnostics.rngDraws,
            }),
          }),
        )
      }
    }

    if (totalMutantBirths > args.population.totalDivisionOpportunities) {
      throw new Error(
        'total mutant births cannot exceed total division opportunities',
      )
    }

    return Object.freeze({
      populationConfigurationIdentity:
        args.population.state.configurationIdentity,
      populationRevision: args.population.state.revision,
      samplingPolicyIdentity: policyIdentity,
      cells: Object.freeze(cells),
      totalDivisionOpportunities:
        args.population.totalDivisionOpportunities,
      totalMutantBirths,
      rngDraws: totalRngDraws,
    })
  })
}

function buildLineagePlans(
  population: DiscretePopulationAdvanceResult,
  genotypeIds: readonly string[],
  graph: CuratedMutationGraph,
): readonly LineageMutationPlan[] {
  return Object.freeze(
    population.state.lineageIds.map((sourceLineageId, lineageIndex) => {
      const sourceGenotypeId = genotypeIds[lineageIndex]!
      const edges = mutationEdgesForSource(graph, sourceGenotypeId)
      const targets = mutationTargetsForSource(graph, sourceGenotypeId)
      if (edges.length !== targets.length) {
        throw new Error('mutation graph edge/target projection drift')
      }

      return Object.freeze({
        sourceLineageId,
        sourceGenotypeId,
        edges,
        targets,
      })
    }),
  )
}

function validatePopulationOpportunityResult(
  population: DiscretePopulationAdvanceResult,
  genotypeIds: readonly string[],
): void {
  const state = population.state
  canonicalIdentity(
    'population configuration identity',
    state.configurationIdentity,
  )
  nonNegativeSafeInteger('population revision', state.revision)
  if (
    !Number.isSafeInteger(state.width) ||
    !Number.isSafeInteger(state.height) ||
    state.width <= 0 ||
    state.height <= 0
  ) {
    throw new Error('population state dimensions must be positive integers')
  }
  const cells = state.width * state.height
  if (!Number.isSafeInteger(cells)) {
    throw new Error('population state cell count must be a safe integer')
  }
  if (
    !Array.isArray(state.lineageIds) ||
    !Array.isArray(genotypeIds) ||
    state.lineageIds.length === 0 ||
    genotypeIds.length !== state.lineageIds.length
  ) {
    throw new Error(
      'mutation genotype ids must align with population lineage ids',
    )
  }
  if (
    !Array.isArray(population.divisionOpportunities) ||
    population.divisionOpportunities.length !== state.lineageIds.length
  ) {
    throw new Error(
      'division opportunity channels must align with population lineages',
    )
  }

  nonNegativeSafeInteger(
    'reported total division opportunities',
    population.totalDivisionOpportunities,
  )
  nonNegativeSafeInteger(
    'reported total standing hosts',
    population.totalStandingHosts,
  )

  let computedDivisionTotal = 0
  const seenLineageIds = new Set<string>()
  for (
    let lineageIndex = 0;
    lineageIndex < state.lineageIds.length;
    lineageIndex += 1
  ) {
    if (
      !Object.prototype.hasOwnProperty.call(state.lineageIds, lineageIndex) ||
      !Object.prototype.hasOwnProperty.call(genotypeIds, lineageIndex) ||
      !Object.prototype.hasOwnProperty.call(
        population.divisionOpportunities,
        lineageIndex,
      )
    ) {
      throw new Error('mutation lineage/opportunity arrays must be dense')
    }

    const lineageId = state.lineageIds[lineageIndex]!
    canonicalIdentity('source lineage id', lineageId)
    if (seenLineageIds.has(lineageId)) {
      throw new Error('source lineage ids must be unique')
    }
    seenLineageIds.add(lineageId)
    canonicalIdentity(
      'source genotype id',
      genotypeIds[lineageIndex]!,
    )

    const channel = population.divisionOpportunities[lineageIndex]
    if (
      channel === null ||
      typeof channel !== 'object' ||
      !Number.isSafeInteger(channel.length) ||
      channel.length !== cells
    ) {
      throw new Error(
        'division opportunity channel must match population grid dimensions',
      )
    }

    for (let cellIndex = 0; cellIndex < cells; cellIndex += 1) {
      const divisions = channel[cellIndex]!
      nonNegativeSafeInteger('division opportunity count', divisions)
      computedDivisionTotal = safeIntegerAdd(
        'computed total division opportunities',
        computedDivisionTotal,
        divisions,
      )
    }
  }

  if (computedDivisionTotal !== population.totalDivisionOpportunities) {
    throw new Error(
      'reported total division opportunities do not match spatial channels',
    )
  }
}

function safeIntegerAdd(name: string, left: number, right: number): number {
  const value = left + right
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(name + ' exceeds the safe integer domain')
  }
  return value
}

function nonNegativeSafeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(name + ' must be a non-negative safe integer')
  }
}

function canonicalIdentity(name: string, value: string): void {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value !== value.trim()
  ) {
    throw new Error(name + ' must be a canonical non-empty string')
  }
}
