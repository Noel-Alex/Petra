import { describe, expect, it } from 'vitest'
import {
  projectEcologyFluxObservation,
} from './fluxObservation'
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
  it('projects exact detached per-lineage and per-cell local fluxes', () => {
    const state = makeState()
    const result = stepEcology(state, growth, lineages, 0.25)
    const observation = projectEcologyFluxObservation({
      state,
      lineageIds: ['ancestor', 'variant'],
      stepDuration: 0.25,
      result,
    })

    expect(observation.biomassUnit).toBe('model-biomass')
    expect(observation.mask).toEqual([1, 0])
    expect(observation.lineageIds).toEqual(['ancestor', 'variant'])
    expect(observation.divisionBiomassByLineage).toHaveLength(2)
    expect(observation.deathBiomassByLineage).toHaveLength(2)
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
    expect(observation.netLocalBiomassChangeByCell[0]).toBeCloseTo(
      observation.divisionBiomassByCell[0]! -
        observation.deathBiomassByCell[0]!,
      12,
    )

    const originalProjectedDivision = observation.divisionBiomassByLineage[0]![0]
    result.fluxes.divisionBiomass[0]![0] = 999
    state.mask[0] = 0

    expect(observation.divisionBiomassByLineage[0]![0]).toBe(
      originalProjectedDivision,
    )
    expect(observation.mask[0]).toBe(1)
  })

  it('keeps local net flux distinct from final per-cell state change after spread', () => {
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
      stepDuration: 1,
      result,
    })

    expect(observation.netLocalBiomassChangeByCell).toEqual([0, 0])
    expect(Array.from(state.lineages[0]!)).not.toEqual(before)
  })

  it('fails closed on malformed identity, shape, off-mask flux, or metric drift', () => {
    const state = makeState()
    const result = stepEcology(state, growth, lineages, 0.25)

    expect(() =>
      projectEcologyFluxObservation({
        state,
        lineageIds: [' ancestor ', 'variant'],
        stepDuration: 0.25,
        result,
      }),
    ).toThrow(/canonical/)

    expect(() =>
      projectEcologyFluxObservation({
        state,
        lineageIds: ['ancestor'],
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
        stepDuration: 0.25,
        result: drifted,
      }),
    ).toThrow(/total division biomass does not match/)

    expect(() =>
      projectEcologyFluxObservation({
        state: makeState(),
        lineageIds: ['ancestor', 'variant'],
        stepDuration: -1,
        result: stepEcology(makeState(), growth, lineages, 0.25),
      }),
    ).toThrow(/stepDuration/)
  })
})
