import { describe, expect, it } from 'vitest'

import {
  cloneComposedState,
  createComposedState,
  type ComposedSimulationConfig,
} from '../../src/sim/authoritative'
import type { CuratedMutationGraph } from '../../src/sim/evolution/graph'
import {
  MODEL_RESOURCE_INTERVENTION_SCHEMA_VERSION,
  MODEL_RESOURCE_UNIT,
  applyModelResourceIntervention,
  type ModelResourceIntervention,
} from '../../src/sim/resourceIntervention'

const graph: CuratedMutationGraph = {
  scenarioId: 'model-resource-intervention-fixture',
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
  ciprofloxacin: null,
  samplingExecutionPolicy: null,
  dynamicLineageLossPolicy: null,
  populationAuthority: null,
  hoursPerTick: 0.01,
}

function intervention(
  geometry: ModelResourceIntervention['geometry'],
  resourceValue = 0.25,
  blendMode: ModelResourceIntervention['blendMode'] = 'set',
): ModelResourceIntervention {
  return {
    schemaVersion: MODEL_RESOURCE_INTERVENTION_SCHEMA_VERSION,
    resourceValue,
    resourceUnit: MODEL_RESOURCE_UNIT,
    blendMode,
    geometry,
  }
}

describe('authoritative model-resource intervention foundation', () => {
  it('writes global model-resource only inside the exact composed checkpoint mask', () => {
    const state = createComposedState(config)

    applyModelResourceIntervention(
      state,
      config,
      intervention({ kind: 'global' }),
    )

    expect(state.resource).toEqual(
      mask.map((inside) => (inside === 1 ? 0.25 : 0)),
    )
  })

  it('supports deterministic radial, stripe, and paint geometry in normalized authoritative-mask coordinates', () => {
    const radial = createComposedState(config)
    applyModelResourceIntervention(
      radial,
      config,
      intervention({
        kind: 'radial',
        center: { x: 0.5, y: 0.5 },
        radiusFraction: 0.25,
      }),
    )
    expect(radial.resource[12]).toBe(0.25)
    expect(radial.resource.filter((value) => value > 0)).toHaveLength(1)

    const stripe = createComposedState(config)
    applyModelResourceIntervention(
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
      stripe.resource
        .map((value, index) => (value > 0 ? index : -1))
        .filter((index) => index >= 0),
    ).toEqual([2, 7, 12, 17, 22])

    const paint = createComposedState(config)
    applyModelResourceIntervention(
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
    expect(paint.resource[12]).toBe(0.25)
    expect(paint.resource[13]).toBe(0.25)
    expect(paint.resource[14]).toBe(0)
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

    applyModelResourceIntervention(
      state,
      insetConfig,
      intervention({
        kind: 'stripe',
        axis: 'x',
        centerFraction: 0,
        widthFraction: 0.1,
      }),
    )

    expect(state.resource[3 * 7 + 1]).toBe(0.25)
    expect(state.resource[3 * 7 + 0]).toBe(0)
    expect(state.resource[3 * 7 + 3]).toBe(0)
  })

  it('rounds only touched cells to Float32 and preserves untouched valid resource values exactly', () => {
    const state = createComposedState(config)
    const untouched = 0.123456789012345
    state.resource[7] = untouched

    applyModelResourceIntervention(
      state,
      config,
      intervention({
        kind: 'radial',
        center: { x: 0.5, y: 0.5 },
        radiusFraction: 0.25,
      }, 0.1),
    )

    expect(state.resource[12]).toBe(Math.fround(0.1))
    expect(state.resource[7]).toBe(untouched)
  })

  it('preserves sequential Float32 add semantics and refuses an overflowing edit atomically', () => {
    const state = createComposedState(config)
    const add = intervention({ kind: 'global' }, 0.1, 'add')

    applyModelResourceIntervention(state, config, add)
    applyModelResourceIntervention(state, config, add)
    expect(state.resource[12]).toBe(
      Math.fround(Math.fround(0.1) + Math.fround(0.1)),
    )

    state.resource[12] = 3e38
    const before = cloneComposedState(state)
    expect(() =>
      applyModelResourceIntervention(
        state,
        config,
        intervention({ kind: 'global' }, 3e38, 'add'),
      ),
    ).toThrow(/fit in finite Float32/)
    expect(state).toEqual(before)
  })

  it('rejects malformed units and geometry without mutating resource authority', () => {
    const state = createComposedState(config)
    const before = cloneComposedState(state)

    const wrongUnit = {
      ...intervention({ kind: 'global' }),
      resourceUnit: 'g/L',
    }
    expect(() =>
      applyModelResourceIntervention(
        state,
        config,
        wrongUnit as unknown as ModelResourceIntervention,
      ),
    ).toThrow(/unit must be model-resource/)
    expect(state).toEqual(before)

    expect(() =>
      applyModelResourceIntervention(
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
})
