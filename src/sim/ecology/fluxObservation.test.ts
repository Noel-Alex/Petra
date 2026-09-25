import { describe, expect, it } from 'vitest'
import { projectEcologyFluxObservation } from './fluxObservation'
import {
  stepEcology,
  type EcologyState,
  type GrowthParameters,
  type LineageEcologyParameters,
} from './growth'

const growth: GrowthParameters = {
  maxDivisionRate: 0.8,
  halfSaturation: 2,
  biomassYield: 0.5,
  localCapacity: 20,
  spreadRate: 0,
}

function makeState(): EcologyState {
  return {
    width: 2,
    height: 1,
    mask: new Uint8Array([1, 0]),
    resource: new Float32Array([8, 0]),
    lineages: [
      new Float32Array([1, 0]),
      new Float32Array([2, 0]),
    ],
  }
}

const lineages: readonly LineageEcologyParameters[] = [
  { relativeFitness: 1, deathHazardPerTime: 0 },
  { relativeFitness: 0.9, deathHazardPerTime: 0.1 },
]

describe('ecology flux observation', () => {
  it('projects detached local flux and interval-average rate channels', () => {
    const state = makeState()
    const result = stepEcology(state, growth, lineages, 0.25)
    const observation = projectEcologyFluxObservation({
      state,
      lineageIds: ['ancestor', 'variant'],
      biomassUnit: 'model-biomass',
      timeUnit: 'hour',
      stepDuration: 0.25,
      result,
    })

    expect(observation.biomassUnit).toBe('model-biomass')
    expect(observation.timeUnit).toBe('hour')
    expect(observation.mask).toEqual([1, 0])
    expect(observation.lineageIds).toEqual(['ancestor', 'variant'])
    expect(observation.divisionBiomassByCell[0]).toBeGreaterThan(0)
    expect(observation.deathBiomassByCell[0]).toBeGreaterThan(0)
    expect(observation.divisionBiomassByCell[1]).toBe(0)
    expect(observation.deathBiomassByCell[1]).toBe(0)
    expect(observation.totalDivisionBiomass).toBeCloseTo(
      result.metrics.divisionBiomass,
      12,
    )
    expect(observation.totalDeathBiomass).toBeCloseTo(
      result.metrics.deathBiomass,
      12,
    )
    expect(observation.averageNetLocalBiomassRateByCell[0]).toBeCloseTo(
      observation.netLocalBiomassChangeByCell[0]! / 0.25,
      12,
    )

    const projected = observation.divisionBiomassByLineage[0]![0]
    result.fluxes.divisionBiomass[0]![0] = 999
    state.mask[0] = 0
    expect(observation.divisionBiomassByLineage[0]![0]).toBe(projected)
    expect(observation.mask[0]).toBe(1)
  })

  it('keeps pre-spread local rate distinct from final per-cell state delta', () => {
    const state: EcologyState = {
      width: 2,
      height: 1,
      mask: new Uint8Array([1, 1]),
      resource: new Float32Array([0, 0]),
      lineages: [new Float32Array([4, 0])],
    }
    const spreadingGrowth: GrowthParameters = {
      ...growth,
      maxDivisionRate: 0,
      spreadRate: 0.2,
    }
    const before = Array.from(state.lineages[0]!)
    const result = stepEcology(
      state,
      spreadingGrowth,
      [{ relativeFitness: 1, deathHazardPerTime: 0 }],
      1,
    )
    const observation = projectEcologyFluxObservation({
      state,
      lineageIds: ['ancestor'],
      biomassUnit: 'model-biomass',
      timeUnit: 'hour',
      stepDuration: 1,
      result,
    })

    expect(observation.averageNetLocalBiomassRateByCell).toEqual([0, 0])
    expect(Array.from(state.lineages[0]!)).not.toEqual(before)
  })

  it('fails closed on bad units, identity, shape, off-mask flux, or metric drift', () => {
    const state = makeState()
    const result = stepEcology(state, growth, lineages, 0.25)

    expect(() =>
      projectEcologyFluxObservation({
        state,
        lineageIds: ['ancestor', 'variant'],
        biomassUnit: ' model-biomass ',
        timeUnit: 'hour',
        stepDuration: 0.25,
        result,
      }),
    ).toThrow(/biomassUnit.*canonical/)

    expect(() =>
      projectEcologyFluxObservation({
        state,
        lineageIds: [' ancestor ', 'variant'],
        biomassUnit: 'model-biomass',
        timeUnit: 'hour',
        stepDuration: 0.25,
        result,
      }),
    ).toThrow(/canonical/)

    expect(() =>
      projectEcologyFluxObservation({
        state,
        lineageIds: ['ancestor'],
        biomassUnit: 'model-biomass',
        timeUnit: 'hour',
        stepDuration: 0.25,
        result,
      }),
    ).toThrow(/one flux channel per lineage id/)

    const offMask = stepEcology(makeState(), growth, lineages, 0.25)
    offMask.fluxes.divisionBiomass[0]![1] = 1
    expect(() =>
      projectEcologyFluxObservation({
        state: makeState(),
        lineageIds: ['ancestor', 'variant'],
        biomassUnit: 'model-biomass',
        timeUnit: 'hour',
        stepDuration: 0.25,
        result: offMask,
      }),
    ).toThrow(/zero outside ecology mask/)

    const drifted = stepEcology(makeState(), growth, lineages, 0.25)
    ;(drifted.metrics as { divisionBiomass: number }).divisionBiomass += 1
    expect(() =>
      projectEcologyFluxObservation({
        state: makeState(),
        lineageIds: ['ancestor', 'variant'],
        biomassUnit: 'model-biomass',
        timeUnit: 'hour',
        stepDuration: 0.25,
        result: drifted,
      }),
    ).toThrow(/total division biomass does not match/)

    const nonFiniteMetric = stepEcology(makeState(), growth, lineages, 0.25)
    ;(nonFiniteMetric.metrics as { deathBiomass: number }).deathBiomass =
      Number.NaN
    expect(() =>
      projectEcologyFluxObservation({
        state: makeState(),
        lineageIds: ['ancestor', 'variant'],
        biomassUnit: 'model-biomass',
        timeUnit: 'hour',
        stepDuration: 0.25,
        result: nonFiniteMetric,
      }),
    ).toThrow(/metrics.deathBiomass/)

    expect(() =>
      projectEcologyFluxObservation({
        state: makeState(),
        lineageIds: ['ancestor', 'variant'],
        biomassUnit: 'model-biomass',
        timeUnit: 'hour',
        stepDuration: 0,
        result: stepEcology(makeState(), growth, lineages, 0.25),
      }),
    ).toThrow(/stepDuration/)
  })
})
