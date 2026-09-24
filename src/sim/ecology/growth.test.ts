/** Numerical fixture only: these compact values exercise Monod/yield/capacity,
 * relative-fitness, and bounded-loss invariants. They are not E. coli biological
 * constants and are not the flagship preset. */
import { describe, expect, it } from 'vitest'
import {
  monod,
  stepEcology,
  type EcologyState,
  type GrowthParameters,
  type LineageEcologyParameters,
} from './growth'

const params: GrowthParameters = {
  maxDivisionRate: 1,
  halfSaturation: 2,
  biomassYield: 2,
  localCapacity: 100,
  spreadRate: 0,
}

function state(resource: number, lineages: number[]): EcologyState {
  return {
    width: 1,
    height: 1,
    mask: new Uint8Array([1]),
    resource: new Float32Array([resource]),
    lineages: lineages.map((amount) => new Float32Array([amount])),
  }
}

function neutral(lineageCount: number): LineageEcologyParameters[] {
  return Array.from({ length: lineageCount }, () => ({ relativeFitness: 1, deathHazardPerTime: 0 }))
}

describe('Monod resource response', () => {
  it('is zero without resource and one half at K_s', () => {
    expect(monod(0, 2)).toBe(0)
    expect(monod(2, 2)).toBe(0.5)
  })

  it('approaches one at high resource without exceeding it', () => {
    expect(monod(2_000_000, 2)).toBeGreaterThan(0.99999)
    expect(monod(2_000_000, 2)).toBeLessThan(1)
  })
})

describe('resource-limited ecology step', () => {
  it('creates no biomass from zero resource', () => {
    const s = state(0, [10])
    const result = stepEcology(s, params, neutral(1), 1)
    expect(s.lineages[0]![0]).toBe(10)
    expect(result.metrics.divisionBiomass).toBe(0)
    expect(result.metrics.resourceConsumed).toBe(0)
    expect(result.fluxes.divisionBiomass[0]![0]).toBe(0)
  })

  it('obeys yield when resource is the limiting factor', () => {
    const s = state(1, [50])
    const result = stepEcology(s, { ...params, maxDivisionRate: 100 }, neutral(1), 0.1)
    expect(result.metrics.divisionBiomass).toBeCloseTo(2, 6)
    expect(result.metrics.resourceConsumed).toBeCloseTo(1, 6)
    expect(result.fluxes.divisionBiomass[0]![0]).toBeCloseTo(2, 6)
    expect(s.resource[0]).toBeCloseTo(0, 6)
  })

  it('never grows beyond local capacity', () => {
    const s = state(100, [99])
    stepEcology(s, params, neutral(1), 1)
    expect(s.lineages[0]![0]).toBeCloseTo(100, 5)
  })

  it('allocates a shared limiting resource proportionally regardless of lineage ordering', () => {
    const a = state(1, [10, 30])
    const b = state(1, [30, 10])
    const aResult = stepEcology(a, { ...params, maxDivisionRate: 100 }, neutral(2), 0.1)
    const bResult = stepEcology(b, { ...params, maxDivisionRate: 100 }, neutral(2), 0.1)

    expect(a.lineages[0]![0]).toBeCloseTo(b.lineages[1]![0]!, 5)
    expect(a.lineages[1]![0]).toBeCloseTo(b.lineages[0]![0]!, 5)
    expect(a.resource[0]).toBeCloseTo(b.resource[0]!, 6)
    expect(aResult.metrics.divisionBiomass).toBeCloseTo(bResult.metrics.divisionBiomass, 6)
  })

  it('conserves biomass during the coarse spread step', () => {
    const s: EcologyState = {
      width: 3,
      height: 3,
      mask: new Uint8Array(9).fill(1),
      resource: new Float32Array(9),
      lineages: [new Float32Array([0, 0, 0, 0, 10, 0, 0, 0, 0])],
    }
    const result = stepEcology(s, { ...params, maxDivisionRate: 0, spreadRate: 0.1 }, neutral(1), 1)
    expect(result.metrics.totalBiomass).toBeCloseTo(10, 5)
    expect(s.lineages[0]![4]).toBeCloseTo(6, 5)
    expect(s.lineages[0]![1]).toBeCloseTo(1, 5)
    expect(s.lineages[0]![3]).toBeCloseTo(1, 5)
    expect(s.lineages[0]![5]).toBeCloseTo(1, 5)
    expect(s.lineages[0]![7]).toBeCloseTo(1, 5)
  })


  it('does not move biomass into an already-full destination', () => {
    const s: EcologyState = {
      width: 2,
      height: 1,
      mask: new Uint8Array([1, 1]),
      resource: new Float32Array(2),
      lineages: [new Float32Array([10, 10])],
    }

    const result = stepEcology(
      s,
      { ...params, maxDivisionRate: 0, localCapacity: 10, spreadRate: 0.25 },
      neutral(1),
      1,
    )

    expect(s.lineages[0]).toEqual(new Float32Array([10, 10]))
    expect(result.metrics.totalBiomass).toBeCloseTo(20, 6)
  })

  it('accepts only destination free capacity and leaves rejected spread at its source', () => {
    const s: EcologyState = {
      width: 2,
      height: 1,
      mask: new Uint8Array([1, 1]),
      resource: new Float32Array(2),
      lineages: [new Float32Array([10, 9])],
    }

    stepEcology(
      s,
      { ...params, maxDivisionRate: 0, localCapacity: 10, spreadRate: 0.25 },
      neutral(1),
      1,
    )

    expect(s.lineages[0]![0]).toBeCloseTo(9, 6)
    expect(s.lineages[0]![1]).toBeCloseTo(10, 6)
    expect(s.lineages[0]![0]! + s.lineages[0]![1]!).toBeCloseTo(19, 6)
  })

  it('shares scarce destination capacity proportionally across sources and lineages', () => {
    const s: EcologyState = {
      width: 3,
      height: 1,
      mask: new Uint8Array([1, 1, 1]),
      resource: new Float32Array(3),
      lineages: [
        new Float32Array([6, 5, 1]),
        new Float32Array([2, 3, 3]),
      ],
    }

    const beforeByLineage = s.lineages.map((lineage) =>
      Array.from(lineage).reduce((sum, amount) => sum + amount, 0),
    )

    stepEcology(
      s,
      { ...params, maxDivisionRate: 0, localCapacity: 10, spreadRate: 0.25 },
      neutral(2),
      1,
    )

    const centreTotal = s.lineages[0]![1]! + s.lineages[1]![1]!
    expect(centreTotal).toBeCloseTo(6, 6)
    expect(s.lineages[0]![0]).toBeCloseTo(6.25, 5)
    expect(s.lineages[0]![1]).toBeCloseTo(3.6666667, 5)
    expect(s.lineages[0]![2]).toBeCloseTo(2.0833333, 5)
    expect(s.lineages[1]![0]).toBeCloseTo(2.4166667, 5)
    expect(s.lineages[1]![1]).toBeCloseTo(2.3333333, 5)
    expect(s.lineages[1]![2]).toBeCloseTo(3.25, 5)

    for (let lineageIndex = 0; lineageIndex < s.lineages.length; lineageIndex += 1) {
      const after = Array.from(s.lineages[lineageIndex]!).reduce(
        (sum, amount) => sum + amount,
        0,
      )
      expect(after).toBeCloseTo(beforeByLineage[lineageIndex]!, 5)
    }
  })

  it('is invariant to lineage-channel iteration order under capacity competition', () => {
    const a: EcologyState = {
      width: 3,
      height: 1,
      mask: new Uint8Array([1, 1, 1]),
      resource: new Float32Array(3),
      lineages: [
        new Float32Array([6, 5, 1]),
        new Float32Array([2, 3, 3]),
      ],
    }
    const b: EcologyState = {
      width: 3,
      height: 1,
      mask: new Uint8Array([1, 1, 1]),
      resource: new Float32Array(3),
      lineages: [
        new Float32Array([2, 3, 3]),
        new Float32Array([6, 5, 1]),
      ],
    }
    const spreadParameters = {
      ...params,
      maxDivisionRate: 0,
      localCapacity: 10,
      spreadRate: 0.25,
    }

    stepEcology(a, spreadParameters, neutral(2), 1)
    stepEcology(b, spreadParameters, neutral(2), 1)

    expect(Array.from(a.lineages[0]!)).toEqual(Array.from(b.lineages[1]!))
    expect(Array.from(a.lineages[1]!)).toEqual(Array.from(b.lineages[0]!))
  })

  it('keeps every in-mask cell at or below capacity after spread without deleting biomass', () => {
    const s: EcologyState = {
      width: 3,
      height: 3,
      mask: new Uint8Array(9).fill(1),
      resource: new Float32Array(9),
      lineages: [
        new Float32Array([10, 9.9, 10, 9.8, 9.7, 9.6, 10, 9.5, 10]),
        new Float32Array(9),
      ],
    }
    const totalBefore = Array.from(s.lineages[0]!).reduce(
      (sum, amount) => sum + amount,
      0,
    )

    const result = stepEcology(
      s,
      { ...params, maxDivisionRate: 0, localCapacity: 10, spreadRate: 0.2 },
      neutral(2),
      1,
    )

    for (let index = 0; index < 9; index += 1) {
      const local = s.lineages[0]![index]! + s.lineages[1]![index]!
      expect(local).toBeLessThanOrEqual(10.00001)
      expect(local).toBeGreaterThanOrEqual(0)
    }
    expect(result.metrics.totalBiomass).toBeCloseTo(totalBefore, 4)
  })

  it('approaches exponential early growth when resource and capacity are non-limiting', () => {
    const s = state(1_000_000, [1])
    const p = { ...params, halfSaturation: 1, biomassYield: 1_000_000_000, localCapacity: 1_000_000 }
    for (let step = 0; step < 1_000; step += 1) {
      stepEcology(s, p, neutral(1), 0.001)
    }
    expect(s.lineages[0]![0]).toBeCloseTo(Math.E, 2)
  })

  it('reduces per-biomass division flux as nutrient is depleted', () => {
    const s = state(2, [10])
    const p = { ...params, biomassYield: 1, localCapacity: 1_000 }

    const firstBiomass = s.lineages[0]![0]!
    const first = stepEcology(s, p, neutral(1), 0.2)
    const firstSpecific = first.metrics.divisionBiomass / firstBiomass
    const resourceAfterFirst = s.resource[0]!

    const secondBiomass = s.lineages[0]![0]!
    const second = stepEcology(s, p, neutral(1), 0.2)
    const secondSpecific = second.metrics.divisionBiomass / secondBiomass

    expect(resourceAfterFirst).toBeLessThan(2)
    expect(secondSpecific).toBeLessThan(firstSpecific)
  })

  it('applies lineage relative fitness to division demand before shared limiting allocation', () => {
    const s = state(1_000, [10, 10])
    const kinetics: LineageEcologyParameters[] = [
      { relativeFitness: 1, deathHazardPerTime: 0 },
      { relativeFitness: 0.5, deathHazardPerTime: 0 },
    ]
    const result = stepEcology(s, { ...params, localCapacity: 1_000 }, kinetics, 0.1)

    expect(result.fluxes.divisionBiomass[0]![0]).toBeCloseTo(2 * result.fluxes.divisionBiomass[1]![0]!, 5)
  })

  it('books first-order death separately and never removes more than pre-step biomass', () => {
    const halfLife = state(0, [10])
    const halfLifeResult = stepEcology(
      halfLife,
      params,
      [{ relativeFitness: 1, deathHazardPerTime: Math.log(2) }],
      1,
    )
    expect(halfLifeResult.metrics.divisionBiomass).toBe(0)
    expect(halfLifeResult.metrics.deathBiomass).toBeCloseTo(5, 6)
    expect(halfLifeResult.fluxes.deathBiomass[0]![0]).toBeCloseTo(5, 6)
    expect(halfLife.lineages[0]![0]).toBeCloseTo(5, 6)

    const extreme = state(0, [10])
    const extremeResult = stepEcology(
      extreme,
      params,
      [{ relativeFitness: 1, deathHazardPerTime: 1_000_000 }],
      1,
    )
    expect(extremeResult.metrics.deathBiomass).toBeLessThanOrEqual(10)
    expect(extreme.lineages[0]![0]).toBeGreaterThanOrEqual(0)
  })

  it('supports spatial death-hazard fields without hiding their caller-owned origin', () => {
    const s: EcologyState = {
      width: 2,
      height: 1,
      mask: new Uint8Array([1, 1]),
      resource: new Float32Array([0, 0]),
      lineages: [new Float32Array([10, 10])],
    }
    const result = stepEcology(
      s,
      params,
      [{ relativeFitness: 1, deathHazardPerTime: new Float32Array([0, Math.log(2)]) }],
      1,
    )

    expect(result.fluxes.deathBiomass[0]![0]).toBe(0)
    expect(result.fluxes.deathBiomass[0]![1]).toBeCloseTo(5, 6)
    expect(s.lineages[0]![0]).toBe(10)
    expect(s.lineages[0]![1]).toBeCloseTo(5, 6)
  })

  it('rejects invalid lineage kinetics and death fields', () => {
    const s = state(1, [1])
    expect(() => stepEcology(s, params, [], 1)).toThrow(/one entry per lineage/)
    expect(() => stepEcology(s, params, [{ relativeFitness: -1, deathHazardPerTime: 0 }], 1)).toThrow(/relativeFitness/)
    expect(() =>
      stepEcology(s, params, [{ relativeFitness: 1, deathHazardPerTime: new Float32Array([Number.NaN]) }], 1),
    ).toThrow(/deathHazardPerTime/)
  })
})
