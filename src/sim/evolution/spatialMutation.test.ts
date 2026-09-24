import { describe, expect, it } from 'vitest'
import {
  CELL_EQUIVALENT_CALIBRATION_SCHEMA_VERSION,
  FRACTIONAL_CARRY_POPULATION_POLICY,
  advanceDiscretePopulationAuthority,
  createDiscretePopulationAuthorityState,
  type DiscretePopulationAdvanceResult,
  type DiscretePopulationAuthorityConfig,
} from '../populationAuthority'
import { SimulationRng } from '../rng'
import {
  SAMPLING_EXECUTION_POLICY_SCHEMA_VERSION,
  SamplingPolicyRefusalError,
  type SamplingExecutionPolicy,
} from '../samplingPolicy'
import { buildCuratedMutationGraph } from './graph'
import { sampleSpatialDivisionMutations } from './spatialMutation'

function populationConfig(
  lineageIds: readonly string[],
  width = 2,
): DiscretePopulationAuthorityConfig {
  return {
    width,
    height: 1,
    mask: Array(width).fill(1),
    lineageIds,
    calibration: {
      schemaVersion: CELL_EQUIVALENT_CALIBRATION_SCHEMA_VERSION,
      id: 'fixture-cell-scale',
      modelBiomassPerCellEquivalent: 1,
      provenance: {
        classification: 'engineering',
        sourceKeys: [],
        limitation: 'Deterministic mutation-composition fixture only.',
      },
    },
    policy: FRACTIONAL_CARRY_POPULATION_POLICY,
  }
}

function population(args: {
  readonly lineageIds: readonly string[]
  readonly currentBiomass: readonly (readonly number[])[]
  readonly divisionBiomass: readonly (readonly number[])[]
}): DiscretePopulationAdvanceResult {
  const width = args.currentBiomass[0]?.length ?? 0
  const config = populationConfig(args.lineageIds, width)
  const initial = createDiscretePopulationAuthorityState(
    config,
    args.lineageIds.map(() => Array(width).fill(0)),
  )
  return advanceDiscretePopulationAuthority(initial, config, {
    currentLineageBiomass: args.currentBiomass,
    divisionBiomass: args.divisionBiomass.map((channel) =>
      Float64Array.from(channel),
    ),
  })
}

function graph(probability = 1) {
  return buildCuratedMutationGraph({
    id: 'fixture-evolution',
    version: '1.0.0',
    genotypes: [
      { id: 'WT', relativeFitness: 1 },
      { id: 'A', relativeFitness: 0.9 },
      { id: 'B', relativeFitness: 0.8 },
    ],
    mutationTransitions: [
      {
        from: 'WT',
        to: 'A',
        probabilityPerDivision: probability,
        classification: 'fixture-transition',
        citation: 'fixture-source-wt-a',
      },
      {
        from: 'A',
        to: 'B',
        probabilityPerDivision: probability,
        classification: 'fixture-transition',
        citation: 'fixture-source-a-b',
      },
    ],
  })
}

function samplingPolicy(
  overrides: Partial<SamplingExecutionPolicy> = {},
): SamplingExecutionPolicy {
  return {
    schemaVersion: SAMPLING_EXECUTION_POLICY_SCHEMA_VERSION,
    id: 'fixture-spatial-mutation-policy',
    exactTrialLimit: 100,
    acceleration: 'exact-sparse-binomial-v1',
    maximumExpectedAcceleratedDraws: 2_000,
    maximumAcceleratedDraws: 4_000,
    ...overrides,
  }
}

describe('spatial discrete mutation consumer', () => {
  it('preserves lineage, cell, target, mutation-class, and citation identity', () => {
    const opportunities = population({
      lineageIds: ['L1', 'L2'],
      currentBiomass: [
        [1, 2],
        [2, 1],
      ],
      divisionBiomass: [
        [1, 2],
        [2, 1],
      ],
    })

    const result = sampleSpatialDivisionMutations({
      population: opportunities,
      genotypeIds: ['WT', 'A'],
      graph: graph(1),
      rng: new SimulationRng(7),
      policy: samplingPolicy(),
    })

    expect(result.totalDivisionOpportunities).toBe(6)
    expect(result.totalMutantBirths).toBe(6)
    expect(result.rngDraws).toBe(6)
    expect(
      result.cells.map((cell) => ({
        lineage: cell.sourceLineageId,
        genotype: cell.sourceGenotypeId,
        cell: cell.cellIndex,
        divisions: cell.divisionOpportunities,
        target: cell.mutationBirths[0]?.targetGenotypeId,
        count: cell.mutationBirths[0]?.count,
        mutationClass: cell.mutationBirths[0]?.mutationClass,
        citationKey: cell.mutationBirths[0]?.citationKey,
      })),
    ).toEqual([
      {
        lineage: 'L1',
        genotype: 'WT',
        cell: 0,
        divisions: 1,
        target: 'A',
        count: 1,
        mutationClass: 'fixture-transition',
        citationKey: 'fixture-source-wt-a',
      },
      {
        lineage: 'L1',
        genotype: 'WT',
        cell: 1,
        divisions: 2,
        target: 'A',
        count: 2,
        mutationClass: 'fixture-transition',
        citationKey: 'fixture-source-wt-a',
      },
      {
        lineage: 'L2',
        genotype: 'A',
        cell: 0,
        divisions: 2,
        target: 'B',
        count: 2,
        mutationClass: 'fixture-transition',
        citationKey: 'fixture-source-a-b',
      },
      {
        lineage: 'L2',
        genotype: 'A',
        cell: 1,
        divisions: 1,
        target: 'B',
        count: 1,
        mutationClass: 'fixture-transition',
        citationKey: 'fixture-source-a-b',
      },
    ])
  })

  it('replays identical spatial outcomes and RNG continuation for the same seed', () => {
    const opportunities = population({
      lineageIds: ['L1'],
      currentBiomass: [[40, 60]],
      divisionBiomass: [[40, 60]],
    })
    const firstRng = new SimulationRng(2026)
    const secondRng = new SimulationRng(2026)

    const first = sampleSpatialDivisionMutations({
      population: opportunities,
      genotypeIds: ['WT'],
      graph: graph(0.2),
      rng: firstRng,
      policy: samplingPolicy(),
    })
    const second = sampleSpatialDivisionMutations({
      population: opportunities,
      genotypeIds: ['WT'],
      graph: graph(0.2),
      rng: secondRng,
      policy: samplingPolicy(),
    })

    expect(second).toEqual(first)
    expect(secondRng.snapshot()).toEqual(firstRng.snapshot())
  })

  it('does not consume RNG when there are zero division opportunities', () => {
    const opportunities = population({
      lineageIds: ['L1'],
      currentBiomass: [[0, 0]],
      divisionBiomass: [[0, 0]],
    })
    const rng = new SimulationRng(9)
    const before = rng.snapshot()

    const result = sampleSpatialDivisionMutations({
      population: opportunities,
      genotypeIds: ['WT'],
      graph: graph(0.2),
      rng,
      policy: samplingPolicy(),
    })

    expect(result.cells).toEqual([])
    expect(result.totalDivisionOpportunities).toBe(0)
    expect(result.totalMutantBirths).toBe(0)
    expect(result.rngDraws).toBe(0)
    expect(rng.snapshot()).toEqual(before)
  })

  it('does not invoke sampling policy for terminal genotypes with no mutation targets', () => {
    const opportunities = population({
      lineageIds: ['L1'],
      currentBiomass: [[100_000]],
      divisionBiomass: [[100_000]],
    })
    const rng = new SimulationRng(77)
    const before = rng.snapshot()

    const result = sampleSpatialDivisionMutations({
      population: opportunities,
      genotypeIds: ['B'],
      graph: graph(0.2),
      rng,
      policy: samplingPolicy({
        exactTrialLimit: 1,
        acceleration: 'disabled',
      }),
    })

    expect(result.totalDivisionOpportunities).toBe(100_000)
    expect(result.totalMutantBirths).toBe(0)
    expect(result.rngDraws).toBe(0)
    expect(result.cells).toEqual([
      {
        sourceLineageId: 'L1',
        sourceGenotypeId: 'B',
        cellIndex: 0,
        divisionOpportunities: 100_000,
        mutationBirths: [],
        sampling: {
          mode: 'exact-reference',
          rngDraws: 0,
        },
      },
    ])
    expect(rng.snapshot()).toEqual(before)
  })

  it('rolls back the whole spatial RNG transaction when a later cell refuses', () => {
    const opportunities = population({
      lineageIds: ['L1'],
      currentBiomass: [[1, 100_000]],
      divisionBiomass: [[1, 100_000]],
    })
    const rng = new SimulationRng(123)
    const before = rng.snapshot()

    expect(() =>
      sampleSpatialDivisionMutations({
        population: opportunities,
        genotypeIds: ['WT'],
        graph: graph(0.5),
        rng,
        policy: samplingPolicy({
          exactTrialLimit: 1,
          maximumExpectedAcceleratedDraws: 1,
          maximumAcceleratedDraws: 10,
        }),
      }),
    ).toThrow(SamplingPolicyRefusalError)
    expect(rng.snapshot()).toEqual(before)
  })

  it('fails closed on aggregate opportunity drift before consuming RNG', () => {
    const opportunities = population({
      lineageIds: ['L1'],
      currentBiomass: [[1, 2]],
      divisionBiomass: [[1, 2]],
    })
    const malformed = {
      ...opportunities,
      totalDivisionOpportunities:
        opportunities.totalDivisionOpportunities + 1,
    }
    const rng = new SimulationRng(11)
    const before = rng.snapshot()

    expect(() =>
      sampleSpatialDivisionMutations({
        population: malformed,
        genotypeIds: ['WT'],
        graph: graph(0.2),
        rng,
        policy: samplingPolicy(),
      }),
    ).toThrow(/reported total division opportunities/)
    expect(rng.snapshot()).toEqual(before)
  })

  it('fails closed on genotype alignment or unknown genotype before RNG use', () => {
    const opportunities = population({
      lineageIds: ['L1'],
      currentBiomass: [[1, 1]],
      divisionBiomass: [[1, 1]],
    })
    const rng = new SimulationRng(12)
    const before = rng.snapshot()

    expect(() =>
      sampleSpatialDivisionMutations({
        population: opportunities,
        genotypeIds: [],
        graph: graph(0.2),
        rng,
        policy: samplingPolicy(),
      }),
    ).toThrow(/align with population lineage ids/)

    expect(() =>
      sampleSpatialDivisionMutations({
        population: opportunities,
        genotypeIds: ['UNKNOWN'],
        graph: graph(0.2),
        rng,
        policy: samplingPolicy(),
      }),
    ).toThrow(/unknown genotype/)
    expect(rng.snapshot()).toEqual(before)
  })
})
