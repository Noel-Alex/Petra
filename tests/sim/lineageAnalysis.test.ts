import { describe, expect, it } from 'vitest'
import type { ComposedSimulationConfig } from '../../src/sim/authoritative'
import { ComposedSimulationEngine } from '../../src/sim/composedEngine'
import {
  projectAuthoritativeLineageAnalysis,
  type GenotypeAnalysisEvidence,
} from '../../src/sim/evolution/analysis'
import type { CuratedMutationGraph } from '../../src/sim/evolution/graph'
import { LineageRegistry } from '../../src/sim/evolution/lineage'
import { createFixtureComposedParameterSetBinding } from '../../src/sim/parameterSetBinding'
import { createRunIdentity } from '../../src/sim/protocol'

const graph: CuratedMutationGraph = {
  scenarioId: 'lineage-analysis-fixture',
  scenarioVersion: '1',
  genotypes: [
    { id: 'WT', relativeFitness: 1, sourceOrder: 0 },
    { id: 'R', relativeFitness: 0.85, sourceOrder: 1 },
  ],
  transitions: [],
}

const config: ComposedSimulationConfig = {
  width: 1,
  height: 1,
  mask: [1],
  initialResource: [5],
  ciprofloxacinConcentrationMgPerL: [0],
  initialLineageBiomass: [[1], [2]],
  growth: {
    maxDivisionRate: 0,
    halfSaturation: 1,
    biomassYield: 1,
    localCapacity: 10,
    spreadRate: 0,
  },
  lineages: [
    { id: 'L1', genotypeId: 'WT', deathHazardPerHour: 0 },
    { id: 'L2', genotypeId: 'R', deathHazardPerHour: 0 },
  ],
  evolutionGraph: graph,
  evolutionScenario: {
    scenarioId: 'lineage-analysis-fixture',
    scenarioVersion: '1',
  },
  ciprofloxacin: null,
  samplingExecutionPolicy: null,
  populationAuthority: null,
  hoursPerTick: 0.1,
}

const binding = createFixtureComposedParameterSetBinding(
  'fixture:lineage-analysis',
  '1',
  config,
)

const identity = createRunIdentity({
  scenarioId: graph.scenarioId,
  scenarioVersion: graph.scenarioVersion,
  parameterSetId: binding.parameterSetId,
  parameterSetVersion: binding.parameterSetVersion,
  parameterSetBinding: binding,
  seed: 123,
})

const evidence: readonly GenotypeAnalysisEvidence[] = [
  {
    genotypeId: 'WT',
    label: 'Wild type',
    ciprofloxacin: {
      micMgPerL: 0.016,
      responseShift: null,
    },
    sourceKeys: ['source-wt'],
    assumptionKeys: [],
  },
  {
    genotypeId: 'R',
    label: 'Variant R',
    ciprofloxacin: {
      micMgPerL: 0.38,
      responseShift: {
        referenceGenotypeId: 'WT',
        micRatio: 23.75,
      },
    },
    sourceKeys: ['source-r'],
    assumptionKeys: ['transfer-r'],
  },
]

function registryCheckpoint() {
  const registry = new LineageRegistry()
  const parent = registry.create({
    parentLineageId: null,
    genotypeId: 'WT',
    createdAtHours: 0,
    originCellIndex: 0,
    mutationClass: null,
  })
  registry.create({
    parentLineageId: parent.lineageId,
    genotypeId: 'R',
    createdAtHours: 0,
    originCellIndex: 0,
    mutationClass: 'fixture-mutation',
  })
  return registry.checkpoint()
}

describe('authoritative lineage analysis projection', () => {
  it('joins ancestry, active abundance, curated fitness, and explicit evidence', () => {
    const checkpoint = new ComposedSimulationEngine(identity, config).snapshot().checkpoint
    const result = projectAuthoritativeLineageAnalysis({
      checkpoint,
      lineageRegistry: registryCheckpoint(),
      evolutionGraph: graph,
      genotypeEvidence: evidence,
    })

    expect(result.identity).toEqual(identity)
    expect(result.identity).not.toBe(checkpoint.identity)
    expect(result.records).toEqual([
      expect.objectContaining({
        lineageId: 'L1',
        parentLineageId: null,
        genotypeId: 'WT',
        genotypeLabel: 'Wild type',
        abundanceModelBiomass: 1,
        relativeFitness: 1,
        status: 'extant',
        sourceKeys: ['source-wt'],
      }),
      expect.objectContaining({
        lineageId: 'L2',
        parentLineageId: 'L1',
        genotypeId: 'R',
        genotypeLabel: 'Variant R',
        abundanceModelBiomass: 2,
        relativeFitness: 0.85,
        ciprofloxacin: {
          micMgPerL: 0.38,
          responseShift: {
            referenceGenotypeId: 'WT',
            micRatio: 23.75,
          },
        },
        mutationClass: 'fixture-mutation',
        assumptionKeys: ['transfer-r'],
      }),
    ])
  })

  it('refuses malformed supplied ciprofloxacin phenotype evidence', () => {
    const checkpoint = new ComposedSimulationEngine(identity, config).snapshot().checkpoint
    expect(() =>
      projectAuthoritativeLineageAnalysis({
        checkpoint,
        lineageRegistry: registryCheckpoint(),
        evolutionGraph: graph,
        genotypeEvidence: evidence.map((item) =>
          item.genotypeId === 'R'
            ? {
                ...item,
                ciprofloxacin: {
                  micMgPerL: 0,
                  responseShift: {
                    referenceGenotypeId: 'WT',
                    micRatio: 23.75,
                  },
                },
              }
            : item,
        ),
      }),
    ).toThrow(/ciprofloxacin MIC must be finite and positive/)
  })

  it('does not infer source or phenotype facts from genotype identifiers', () => {
    const checkpoint = new ComposedSimulationEngine(identity, config).snapshot().checkpoint
    expect(() =>
      projectAuthoritativeLineageAnalysis({
        checkpoint,
        lineageRegistry: registryCheckpoint(),
        evolutionGraph: graph,
        genotypeEvidence: evidence.filter((item) => item.genotypeId !== 'R'),
      }),
    ).toThrow(/missing genotype analysis evidence for R/)
  })

  it('fails closed when composed lineage and ancestry authority disagree', () => {
    const checkpoint = new ComposedSimulationEngine(identity, config).snapshot().checkpoint
    const registry = registryCheckpoint()
    const corrupt = structuredClone(registry)
    ;(corrupt.records[1] as { genotypeId: string }).genotypeId = 'WT'

    expect(() =>
      projectAuthoritativeLineageAnalysis({
        checkpoint,
        lineageRegistry: corrupt,
        evolutionGraph: graph,
        genotypeEvidence: evidence,
      }),
    ).toThrow(/genotype mismatch/)
  })

  it('represents extinct ancestry as zero abundance only when absent from active state', () => {
    const singleConfig: ComposedSimulationConfig = {
      ...config,
      initialLineageBiomass: [[1]],
      lineages: [config.lineages[0]!],
    }
    const singleBinding = createFixtureComposedParameterSetBinding(
      'fixture:lineage-analysis-single',
      '1',
      singleConfig,
    )
    const singleIdentity = createRunIdentity({
      scenarioId: graph.scenarioId,
      scenarioVersion: graph.scenarioVersion,
      parameterSetId: singleBinding.parameterSetId,
      parameterSetVersion: singleBinding.parameterSetVersion,
      parameterSetBinding: singleBinding,
      seed: 123,
    })

    const registry = new LineageRegistry()
    const parent = registry.create({
      parentLineageId: null,
      genotypeId: 'WT',
      createdAtHours: 0,
      originCellIndex: 0,
      mutationClass: null,
    })
    const child = registry.create({
      parentLineageId: parent.lineageId,
      genotypeId: 'R',
      createdAtHours: 0,
      originCellIndex: 0,
      mutationClass: 'fixture-mutation',
    })
    registry.markExtinct(child.lineageId, 0)

    const checkpoint = new ComposedSimulationEngine(
      singleIdentity,
      singleConfig,
    ).snapshot().checkpoint

    const result = projectAuthoritativeLineageAnalysis({
      checkpoint,
      lineageRegistry: registry.checkpoint(),
      evolutionGraph: graph,
      genotypeEvidence: evidence,
    })

    expect(result.records.find((item) => item.lineageId === child.lineageId)).toEqual(
      expect.objectContaining({
        status: 'extinct',
        abundanceModelBiomass: 0,
      }),
    )
  })
})
