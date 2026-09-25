import { describe, expect, it } from 'vitest'

import {
  createComposedState,
  stepComposedStateDetailed,
  type ComposedSimulationConfig,
} from '../../src/sim/authoritative'
import { ComposedSimulationEngine } from '../../src/sim/composedEngine'
import { CIPROFLOXACIN_INTERVENTION_SCHEMA_VERSION } from '../../src/sim/ciprofloxacinIntervention'
import { buildTwoBacteriumSharedResourceRunPlan } from '../../src/sim/twoBacteriumComposition'

function mixedPlan(initialResourceLevel = 1) {
  return buildTwoBacteriumSharedResourceRunPlan({
    seed: 20260925,
    initialResourceLevel,
    inocula: [
      { lineageId: 'ecoli-founder', x: 76, y: 80, biomass: 1 },
      { lineageId: 'bsubtilis-founder', x: 84, y: 80, biomass: 1 },
    ],
  })
}

function total(channel: readonly number[]): number {
  return channel.reduce((sum, value) => sum + value, 0)
}

function reversedConfig(
  config: ComposedSimulationConfig,
): ComposedSimulationConfig {
  return {
    ...config,
    lineages: [config.lineages[1]!, config.lineages[0]!],
    initialLineageBiomass: [
      config.initialLineageBiomass[1]!,
      config.initialLineageBiomass[0]!,
    ],
  }
}

describe('first authoritative two-bacterium shared-resource scenario', () => {
  it('binds exact taxa separately from genotype and uses only the declared relative growth calibration', () => {
    const plan = mixedPlan()

    expect(plan.identity).toMatchObject({
      scenarioId: 'ecoli-bsubtilis-shared-resource',
      scenarioVersion: '1.0.0-experimental',
      parameterSetId: 'ecoli-bsubtilis-shared-resource-composed',
      parameterSetVersion: '1.0.0',
    })
    expect(plan.resourceContext).toMatchObject({
      bindingStatus: 'unbound',
      representation: 'dimensionless_model_resource',
      concentrationUnit: 'model-resource',
    })
    expect(plan.config.ciprofloxacin).toBeNull()
    expect(plan.config.evolutionGraph.transitions).toEqual([])

    expect(plan.config.lineages).toEqual([
      expect.objectContaining({
        id: 'ecoli-founder',
        genotypeId: 'ecoli-wt',
        taxonId: 'ecoli-k12-mg1655',
        taxonContentVersion: 'lacroix-2015-growth-context-v1',
        baselineGrowthRateScale: 1,
      }),
      expect.objectContaining({
        id: 'bsubtilis-founder',
        genotypeId: 'bsubtilis-static',
        taxonId: 'bsubtilis-168-trp-plus-sige-minus',
        taxonContentVersion: 'tannler-2008-growth-context-v1',
        baselineGrowthRateScale: 0.67 / 0.69,
      }),
    ])

    const state = createComposedState(plan.config)
    expect(state.lineageTaxonMap).toEqual({
      schemaVersion: 2,
      lineageIds: ['L1', 'L2'],
      taxonIds: [
        'ecoli-k12-mg1655',
        'bsubtilis-168-trp-plus-sige-minus',
      ],
      taxonContentVersions: [
        'lacroix-2015-growth-context-v1',
        'tannler-2008-growth-context-v1',
      ],
    })
  })

  it('keeps zero-resource biomass conservative while both named taxa remain present', () => {
    const plan = mixedPlan(0)
    const engine = new ComposedSimulationEngine(plan.identity, plan.config)
    const initial = engine.snapshot()
    const accepted = engine.execute({
      id: 'zero-resource-step',
      type: 'advance',
      ticks: 1,
    })

    expect(accepted.checkpoint.metrics.totalResource).toBe(0)
    expect(accepted.checkpoint.metrics.divisionBiomass).toBe(0)
    expect(accepted.checkpoint.metrics.totalBiomass).toBeCloseTo(
      initial.checkpoint.metrics.totalBiomass,
      12,
    )
    expect(accepted.checkpoint.composedState.lineageTaxonMap).toEqual(
      initial.checkpoint.composedState.lineageTaxonMap,
    )
  })

  it('preserves shared-resource results when authoritative lineage order is reversed', () => {
    const plan = mixedPlan()
    const forwardState = createComposedState(plan.config)
    const reverseConfig = reversedConfig(plan.config)
    const reverseState = createComposedState(reverseConfig)

    stepComposedStateDetailed(forwardState, plan.config)
    stepComposedStateDetailed(reverseState, reverseConfig)

    expect(reverseState.resource).toEqual(forwardState.resource)
    expect(reverseState.lineageBiomass[1]).toEqual(
      forwardState.lineageBiomass[0],
    )
    expect(reverseState.lineageBiomass[0]).toEqual(
      forwardState.lineageBiomass[1],
    )
    expect(total(reverseState.lineageBiomass[1]!)).toBe(
      total(forwardState.lineageBiomass[0]!),
    )
    expect(total(reverseState.lineageBiomass[0]!)).toBe(
      total(forwardState.lineageBiomass[1]!),
    )
  })

  it('restores and continues the exact mixed-species checkpoint deterministically', () => {
    const plan = mixedPlan()
    const uninterrupted = new ComposedSimulationEngine(
      plan.identity,
      plan.config,
    )
    const checkpoint = uninterrupted.execute({
      id: 'advance-before-checkpoint',
      type: 'advance',
      ticks: 3,
    }).checkpoint
    const expected = uninterrupted.execute({
      id: 'advance-after-checkpoint',
      type: 'advance',
      ticks: 2,
    }).checkpoint

    const restored = new ComposedSimulationEngine(plan.identity, plan.config)
    restored.execute({
      id: 'restore-two-bacterium-checkpoint',
      type: 'restore',
      checkpoint,
    })
    const continued = restored.execute({
      id: 'advance-after-checkpoint',
      type: 'advance',
      ticks: 2,
    }).checkpoint

    expect(continued.tick).toBe(expected.tick)
    expect(continued.commandCount).toBe(expected.commandCount)
    expect(continued.simulationTimeHours).toBe(expected.simulationTimeHours)
    expect(continued.rngState).toEqual(expected.rngState)
    expect(continued.metrics).toEqual(expected.metrics)
    expect(continued.composedState).toEqual(expected.composedState)
  })

  it('refuses ciprofloxacin for Bacillus-containing authority without borrowing the E. coli drug model', () => {
    const plan = mixedPlan()
    const engine = new ComposedSimulationEngine(plan.identity, plan.config)
    const before = engine.snapshot()

    expect(() =>
      engine.execute({
        id: 'unsupported-bacillus-ciprofloxacin',
        type: 'apply-ciprofloxacin',
        intervention: {
          schemaVersion: CIPROFLOXACIN_INTERVENTION_SCHEMA_VERSION,
          concentrationMgPerL: 0.1,
          concentrationUnit: 'mg/L',
          blendMode: 'set',
          geometry: { kind: 'global' },
        },
      }),
    ).toThrow(/requires explicit pharmacodynamic authority/)

    expect(engine.snapshot()).toEqual(before)
  })
})
