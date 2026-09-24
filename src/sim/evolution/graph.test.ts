import { describe, expect, it } from 'vitest'
import {
  buildCuratedMutationGraph,
  mutationEdgesForSource,
  mutationTargetsForSource,
  relativeFitnessForGenotype,
} from './graph'

const FLAGSHIP_GRAPH_FIXTURE = {
  id: 'ecoli-ciprofloxacin-spatial',
  version: '1.1.0-research',
  drug: {
    name: 'ciprofloxacin',
    concentration_mg_L: 999,
  },
  genotypes: [
    { id: 'WT', relativeFitness: 1 },
    { id: 'A', relativeFitness: 1.01 },
    { id: 'AC', relativeFitness: 0.98 },
    { id: 'AB', relativeFitness: 0.97 },
    { id: 'AD', relativeFitness: 0.86 },
    { id: 'AE', relativeFitness: 0.95 },
    { id: 'ACB', relativeFitness: 1.01 },
  ],
  mutationTransitions: [
    {
      from: 'WT',
      to: 'A',
      probabilityPerDivision: 1e-10,
      classification: 'model_target_probability',
      citation: 'huseby_2017',
      note: 'Point-mutation order used for a specific curated edge.',
    },
    {
      from: 'A',
      to: 'AC',
      probabilityPerDivision: 1e-10,
      classification: 'model_target_probability',
      citation: 'huseby_2017',
    },
    {
      from: 'A',
      to: 'AB',
      probabilityPerDivision: 1e-10,
      classification: 'model_target_probability',
      citation: 'huseby_2017',
    },
    {
      from: 'A',
      to: 'AD',
      probabilityPerDivision: 1e-7,
      classification: 'model_target_class_probability',
      citation: 'huseby_2017',
      note: 'Regulator-disruption class order of magnitude.',
    },
    {
      from: 'A',
      to: 'AE',
      probabilityPerDivision: 1e-7,
      classification: 'model_target_class_probability',
      citation: 'huseby_2017',
    },
    {
      from: 'AC',
      to: 'ACB',
      probabilityPerDivision: 1e-10,
      classification: 'model_target_probability',
      citation: 'huseby_2017',
    },
  ],
} as const

describe('curated mutation graph', () => {
  it('projects flagship transitions into exact-sampler targets in source order', () => {
    const graph = buildCuratedMutationGraph(FLAGSHIP_GRAPH_FIXTURE)

    expect(graph.scenarioId).toBe('ecoli-ciprofloxacin-spatial')
    expect(graph.scenarioVersion).toBe('1.1.0-research')
    expect(mutationTargetsForSource(graph, 'WT')).toEqual([
      { genotypeId: 'A', probabilityPerDivision: 1e-10 },
    ])
    expect(mutationTargetsForSource(graph, 'A')).toEqual([
      { genotypeId: 'AC', probabilityPerDivision: 1e-10 },
      { genotypeId: 'AB', probabilityPerDivision: 1e-10 },
      { genotypeId: 'AD', probabilityPerDivision: 1e-7 },
      { genotypeId: 'AE', probabilityPerDivision: 1e-7 },
    ])
  })

  it('preserves mutation domain class, citation, notes, and genotype fitness', () => {
    const graph = buildCuratedMutationGraph(FLAGSHIP_GRAPH_FIXTURE)
    const [wtEdge] = mutationEdgesForSource(graph, 'WT')
    const aEdges = mutationEdgesForSource(graph, 'A')

    expect(wtEdge).toMatchObject({
      fromGenotypeId: 'WT',
      toGenotypeId: 'A',
      mutationClass: 'model_target_probability',
      citationKey: 'huseby_2017',
      note: 'Point-mutation order used for a specific curated edge.',
      sourceOrder: 0,
    })
    expect(aEdges.map((edge) => edge.mutationClass)).toEqual([
      'model_target_probability',
      'model_target_probability',
      'model_target_class_probability',
      'model_target_class_probability',
    ])
    expect(relativeFitnessForGenotype(graph, 'A')).toBe(1.01)
    expect(relativeFitnessForGenotype(graph, 'AD')).toBe(0.86)
  })

  it('does not derive edge probabilities from unrelated antibiotic fields', () => {
    const highDrug = buildCuratedMutationGraph(FLAGSHIP_GRAPH_FIXTURE)
    const noDrug = buildCuratedMutationGraph({
      ...FLAGSHIP_GRAPH_FIXTURE,
      drug: {
        name: 'ciprofloxacin',
        concentration_mg_L: 0,
      },
    })

    expect(mutationTargetsForSource(highDrug, 'A')).toEqual(
      mutationTargetsForSource(noDrug, 'A'),
    )
  })

  it('rejects duplicate genotype ids, unknown endpoints, and self transitions', () => {
    expect(() =>
      buildCuratedMutationGraph({
        ...FLAGSHIP_GRAPH_FIXTURE,
        genotypes: [
          ...FLAGSHIP_GRAPH_FIXTURE.genotypes,
          { id: 'A', relativeFitness: 1 },
        ],
      }),
    ).toThrow(/duplicate genotype id/)

    expect(() =>
      buildCuratedMutationGraph({
        ...FLAGSHIP_GRAPH_FIXTURE,
        mutationTransitions: [
          {
            from: 'WT',
            to: 'missing',
            probabilityPerDivision: 1e-10,
            classification: 'model_target_probability',
            citation: 'huseby_2017',
          },
        ],
      }),
    ).toThrow(/unknown target genotype/)

    expect(() =>
      buildCuratedMutationGraph({
        ...FLAGSHIP_GRAPH_FIXTURE,
        mutationTransitions: [
          {
            from: 'WT',
            to: 'WT',
            probabilityPerDivision: 1e-10,
            classification: 'model_target_probability',
            citation: 'huseby_2017',
          },
        ],
      }),
    ).toThrow(/must change genotype state/)
  })

  it('rejects duplicate edges and invalid per-source probability mass', () => {
    expect(() =>
      buildCuratedMutationGraph({
        ...FLAGSHIP_GRAPH_FIXTURE,
        mutationTransitions: [
          {
            from: 'WT',
            to: 'A',
            probabilityPerDivision: 0.1,
            classification: 'model_target_probability',
            citation: 'huseby_2017',
          },
          {
            from: 'WT',
            to: 'A',
            probabilityPerDivision: 0.2,
            classification: 'model_target_probability',
            citation: 'huseby_2017',
          },
        ],
      }),
    ).toThrow(/duplicate mutation transition/)

    expect(() =>
      buildCuratedMutationGraph({
        ...FLAGSHIP_GRAPH_FIXTURE,
        mutationTransitions: [
          {
            from: 'A',
            to: 'AC',
            probabilityPerDivision: 0.6,
            classification: 'model_target_probability',
            citation: 'huseby_2017',
          },
          {
            from: 'A',
            to: 'AB',
            probabilityPerDivision: 0.5,
            classification: 'model_target_probability',
            citation: 'huseby_2017',
          },
        ],
      }),
    ).toThrow(/cannot sum above 1/)
  })

  it('requires positive finite fitness and explicit edge metadata', () => {
    expect(() =>
      buildCuratedMutationGraph({
        ...FLAGSHIP_GRAPH_FIXTURE,
        genotypes: [{ id: 'WT', relativeFitness: 0 }],
        mutationTransitions: [],
      }),
    ).toThrow(/relativeFitness must be positive/)

    expect(() =>
      buildCuratedMutationGraph({
        ...FLAGSHIP_GRAPH_FIXTURE,
        mutationTransitions: [
          {
            from: 'WT',
            to: 'A',
            probabilityPerDivision: 1e-10,
            classification: '',
            citation: 'huseby_2017',
          },
        ],
      }),
    ).toThrow(/classification must be a non-empty string/)

    expect(() =>
      buildCuratedMutationGraph({
        ...FLAGSHIP_GRAPH_FIXTURE,
        mutationTransitions: [
          {
            from: 'WT',
            to: 'A',
            probabilityPerDivision: 1e-10,
            classification: 'model_target_probability',
            citation: '',
          },
        ],
      }),
    ).toThrow(/citation must be a non-empty string/)
  })

  it('refuses unknown genotype lookups instead of returning empty authority', () => {
    const graph = buildCuratedMutationGraph(FLAGSHIP_GRAPH_FIXTURE)

    expect(() => mutationTargetsForSource(graph, 'missing')).toThrow(
      /unknown genotype/,
    )
    expect(() => relativeFitnessForGenotype(graph, 'missing')).toThrow(
      /unknown genotype/,
    )
  })
})
