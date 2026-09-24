import { describe, expect, it } from 'vitest'

import {
  cloneComposedState,
  createComposedState,
  type ComposedSimulationConfig,
} from '../../src/sim/authoritative'
import {
  CIPROFLOXACIN_INTERVENTION_SCHEMA_VERSION,
  applyCiprofloxacinIntervention,
  type CiprofloxacinIntervention,
} from '../../src/sim/ciprofloxacinIntervention'
import type { CuratedMutationGraph } from '../../src/sim/evolution/graph'

const graph: CuratedMutationGraph = {
  scenarioId: 'cipro-intervention-fixture',
  scenarioVersion: '1',
  genotypes: [{ id: 'WT', relativeFitness: 1, sourceOrder: 0 }],
  transitions: [],
}

const mask = [
  0, 0, 1, 0, 0,
  0, 1, 1, 1, 0,
  1, 1, 1, 1, 1,
  0, 1, 1, 1, 0,
  0, 0, 1, 0, 0,
] as const

const config: ComposedSimulationConfig = {
  width: 5,
  height: 5,
  mask,
  initialResource: mask.map(() => 0),
  ciprofloxacinConcentrationMgPerL: mask.map(() => 0),
  initialLineageBiomass: [mask.map(() => 0)],
  growth: {
    maxDivisionRate: 0,
    halfSaturation: 1,
    biomassYield: 1,
    localCapacity: 10,
    spreadRate: 0,
  },
  lineages: [
    { id: 'founder', genotypeId: 'WT', deathHazardPerHour: 0 },
  ],
  evolutionGraph: graph,
  evolutionScenario: {
    scenarioId: graph.scenarioId,
    scenarioVersion: graph.scenarioVersion,
  },
  ciprofloxacin: {
    policyId: 'reference_pd_decrement_as_first_order_loss_v1',
    concentrationUnit: 'mg/L',
    referencePharmacodynamics: {
      psiMaxLog10PerHour: 0.88,
      psiMinLog10PerHour: -6.5,
      zMic: 0.017,
      kappa: 1.1,
    },
    referenceMicMgPerL: 0.03,
    genotypeMicMgPerL: [{ genotypeId: 'WT', micMgPerL: 0.016 }],
  },
  samplingExecutionPolicy: null,
  hoursPerTick: 0.01,
}

function intervention(
  geometry: CiprofloxacinIntervention['geometry'],
  concentrationMgPerL = 0.25,
  blendMode: CiprofloxacinIntervention['blendMode'] = 'set',
): CiprofloxacinIntervention {
  return {
    schemaVersion: CIPROFLOXACIN_INTERVENTION_SCHEMA_VERSION,
    concentrationMgPerL,
    concentrationUnit: 'mg/L',
    blendMode,
    geometry,
  }
}

describe('authoritative ciprofloxacin interventions', () => {
  it('writes global exposure only inside the exact composed checkpoint mask', () => {
    const state = createComposedState(config)

    applyCiprofloxacinIntervention(
      state,
      config,
      intervention({ kind: 'global' }),
    )

    expect(state.ciprofloxacinConcentrationMgPerL).toEqual(
      mask.map((inside) => (inside === 1 ? 0.25 : 0)),
    )
  })

  it('supports deterministic radial, stripe, and paint geometry over normalized dish coordinates', () => {
    const radial = createComposedState(config)
    applyCiprofloxacinIntervention(
      radial,
      config,
      intervention({
        kind: 'radial',
        center: { x: 0.5, y: 0.5 },
        radiusFraction: 0.25,
      }),
    )
    expect(radial.ciprofloxacinConcentrationMgPerL[12]).toBe(0.25)
    expect(
      radial.ciprofloxacinConcentrationMgPerL.filter((value) => value > 0),
    ).toHaveLength(1)

    const stripe = createComposedState(config)
    applyCiprofloxacinIntervention(
      stripe,
      config,
      intervention({
        kind: 'stripe',
        axis: 'x',
        centerFraction: 0.5,
        widthFraction: 0.4,
      }),
    )
    expect(
      stripe.ciprofloxacinConcentrationMgPerL
        .map((value, index) => (value > 0 ? index : -1))
        .filter((index) => index >= 0),
    ).toEqual([2, 7, 12, 17, 22])

    const paint = createComposedState(config)
    applyCiprofloxacinIntervention(
      paint,
      config,
      intervention({
        kind: 'paint',
        samples: [
          { x: 0.5, y: 0.5 },
          { x: 0.75, y: 0.5 },
        ],
        brushRadiusFraction: 0.25,
      }),
    )
    expect(paint.ciprofloxacinConcentrationMgPerL[12]).toBe(0.25)
    expect(paint.ciprofloxacinConcentrationMgPerL[13]).toBe(0.25)
    expect(paint.ciprofloxacinConcentrationMgPerL[14]).toBe(0)
  })

  it('normalizes geometry to authoritative mask bounds rather than outer grid margins', () => {
    const insetMask = [
      0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 1, 0, 0, 0,
      0, 0, 1, 1, 1, 0, 0,
      0, 1, 1, 1, 1, 1, 0,
      0, 0, 1, 1, 1, 0, 0,
      0, 0, 0, 1, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0,
    ] as const
    const insetConfig: ComposedSimulationConfig = {
      ...config,
      width: 7,
      height: 7,
      mask: insetMask,
      initialResource: insetMask.map(() => 0),
      ciprofloxacinConcentrationMgPerL: insetMask.map(() => 0),
      initialLineageBiomass: [insetMask.map(() => 0)],
    }
    const state = createComposedState(insetConfig)

    applyCiprofloxacinIntervention(
      state,
      insetConfig,
      intervention({
        kind: 'stripe',
        axis: 'x',
        centerFraction: 0,
        widthFraction: 0.1,
      }),
    )

    expect(state.ciprofloxacinConcentrationMgPerL[3 * 7 + 1]).toBe(0.25)
    expect(state.ciprofloxacinConcentrationMgPerL[3 * 7 + 0]).toBe(0)
    expect(state.ciprofloxacinConcentrationMgPerL[3 * 7 + 3]).toBe(0)
  })

  it('preserves Float32 sequential add semantics and rejects malformed commands atomically', () => {
    const state = createComposedState(config)
    const add = intervention({ kind: 'global' }, 0.1, 'add')

    applyCiprofloxacinIntervention(state, config, add)
    applyCiprofloxacinIntervention(state, config, add)
    expect(state.ciprofloxacinConcentrationMgPerL[12]).toBe(
      Math.fround(Math.fround(0.1) + Math.fround(0.1)),
    )

    const before = cloneComposedState(state)
    expect(() =>
      applyCiprofloxacinIntervention(
        state,
        config,
        intervention({
          kind: 'paint',
          samples: [{ x: Number.NaN, y: 0.5 }],
          brushRadiusFraction: 0.25,
        }),
      ),
    ).toThrow(/paint sample 0.x/)
    expect(state).toEqual(before)
  })

  it('refuses drug mutation when the run has no pharmacodynamic authority', () => {
    const noDrugConfig: ComposedSimulationConfig = {
      ...config,
      ciprofloxacin: null,
    }
    const state = createComposedState(noDrugConfig)
    const before = cloneComposedState(state)

    expect(() =>
      applyCiprofloxacinIntervention(
        state,
        noDrugConfig,
        intervention({ kind: 'global' }),
      ),
    ).toThrow(/requires explicit pharmacodynamic authority/)
    expect(state).toEqual(before)
  })
})
