/** Numerical fixture only: these compact values exercise Monod/yield/capacity,
 * relative-fitness, and bounded-loss invariants. They are not E. coli biological
 * constants and are not the flagship preset. */
import { describe, expect, it } from 'vitest'
import {
  beginEcologyStep,
  completeEcologyStep,
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

  it('keeps explicit begin/complete execution equivalent to the compatibility wrapper', () => {
    const wrapper: EcologyState = {
      width: 2,
      height: 1,
      mask: new Uint8Array([1, 1]),
      resource: new Float32Array([4, 2]),
      lineages: [
        new Float32Array([2, 1]),
        new Float32Array([1, 3]),
      ],
    }
    const phased: EcologyState = {
      width: wrapper.width,
      height: wrapper.height,
      mask: wrapper.mask.slice(),
      resource: wrapper.resource.slice(),
      lineages: wrapper.lineages.map((channel) => channel.slice()),
    }
    const kinetics: LineageEcologyParameters[] = [
      { relativeFitness: 1, deathHazardPerTime: 0.1 },
      { relativeFitness: 0.75, deathHazardPerTime: 0.2 },
    ]
    const p = { ...params, localCapacity: 20, spreadRate: 0.1 }
    const wrapped = stepEcology(wrapper, p, kinetics, 0.5)
    const interphase = beginEcologyStep(phased, p, kinetics, 0.5)
    const completed = completeEcologyStep(phased, interphase)

    expect(phased.resource).toEqual(wrapper.resource)
    expect(phased.lineages).toEqual(wrapper.lineages)
    expect(completed.metrics).toEqual(wrapped.metrics)
    expect(completed.fluxes.divisionBiomass).toEqual(
      wrapped.fluxes.divisionBiomass,
    )
    expect(completed.fluxes.deathBiomass).toEqual(
      wrapped.fluxes.deathBiomass,
    )
  })

  it('spreads a conservatively reassigned child cohort only after the interphase', () => {
    const s: EcologyState = {
      width: 2,
      height: 1,
      mask: new Uint8Array([1, 1]),
      resource: new Float32Array([0, 0]),
      lineages: [new Float32Array([4, 0])],
    }
    const p = {
      ...params,
      maxDivisionRate: 0,
      localCapacity: 10,
      spreadRate: 0.25,
    }

    const interphase = beginEcologyStep(s, p, neutral(1), 1)
    s.lineages[0]![0] = 3
    s.lineages.push(new Float32Array([1, 0]))
    const result = completeEcologyStep(s, interphase)

    expect(result.metrics.totalBiomass).toBe(4)
    expect(s.lineages[0]).toEqual(new Float32Array([2.25, 0.75]))
    expect(s.lineages[1]).toEqual(new Float32Array([0.75, 0.25]))
  })

  it('refuses non-conservative interphase biomass changes before spread', () => {
    const s: EcologyState = {
      width: 2,
      height: 1,
      mask: new Uint8Array([1, 1]),
      resource: new Float32Array([0, 0]),
      lineages: [new Float32Array([4, 0])],
    }
    const p = {
      ...params,
      maxDivisionRate: 0,
      localCapacity: 10,
      spreadRate: 0.25,
    }

    const interphase = beginEcologyStep(s, p, neutral(1), 1)
    s.lineages.push(new Float32Array([1, 0]))

    expect(() => completeEcologyStep(s, interphase)).toThrow(
      /interphase must conserve total biomass at cell 0/,
    )
    expect(s.lineages[0]).toEqual(new Float32Array([4, 0]))
    expect(s.lineages[1]).toEqual(new Float32Array([1, 0]))
  })

  it('accepts the exact four-neighbour spread bound and refuses a larger interval atomically', () => {
    const exact: EcologyState = {
      width: 3,
      height: 3,
      mask: new Uint8Array(9).fill(1),
      resource: new Float32Array(9),
      lineages: [new Float32Array([0, 0, 0, 0, 10, 0, 0, 0, 0])],
    }
    expect(() =>
      stepEcology(
        exact,
        { ...params, maxDivisionRate: 0, spreadRate: 0.25 },
        neutral(1),
        1,
      ),
    ).not.toThrow()
    expect(exact.lineages[0]![4]).toBeCloseTo(0, 6)

    const unstable: EcologyState = {
      width: 3,
      height: 3,
      mask: new Uint8Array(9).fill(1),
      resource: new Float32Array(9),
      lineages: [new Float32Array([0, 0, 0, 0, 10, 0, 0, 0, 0])],
    }
    const before = unstable.lineages[0]!.slice()
    expect(() =>
      stepEcology(
        unstable,
        { ...params, maxDivisionRate: 0, spreadRate: 0.250001 },
        neutral(1),
        1,
      ),
    ).toThrow(/spreadRate \* dt must be <= 0\.25/)
    expect(unstable.lineages[0]).toEqual(before)
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

  it('rejects malformed later resource atomically before earlier resource can be consumed', () => {
    const s: EcologyState = {
      width: 2,
      height: 1,
      mask: new Uint8Array([1, 1]),
      resource: new Float32Array([10, Number.NaN]),
      lineages: [new Float32Array([1, 1])],
    }
    const beforeResource = s.resource.slice()
    const beforeLineage = s.lineages[0]!.slice()

    expect(() => stepEcology(s, params, neutral(1), 1)).toThrow(/resource concentration/)
    expect(s.resource).toEqual(beforeResource)
    expect(s.lineages[0]).toEqual(beforeLineage)
  })

  it('rejects malformed later lineage biomass atomically before earlier resource can be consumed', () => {
    const s: EcologyState = {
      width: 2,
      height: 1,
      mask: new Uint8Array([1, 1]),
      resource: new Float32Array([10, 10]),
      lineages: [new Float32Array([1, -1])],
    }
    const beforeResource = s.resource.slice()
    const beforeLineage = s.lineages[0]!.slice()

    expect(() => stepEcology(s, params, neutral(1), 1)).toThrow(/lineage biomass/)
    expect(s.resource).toEqual(beforeResource)
    expect(s.lineages[0]).toEqual(beforeLineage)
  })

  it('rejects a non-binary dish mask atomically before earlier cells can mutate', () => {
    const s: EcologyState = {
      width: 2,
      height: 1,
      mask: new Uint8Array([1, 2]),
      resource: new Float32Array([10, 10]),
      lineages: [new Float32Array([1, 1])],
    }
    const beforeMask = s.mask.slice()
    const beforeResource = s.resource.slice()
    const beforeLineage = s.lineages[0]!.slice()

    expect(() => stepEcology(s, params, neutral(1), 1)).toThrow(
      /mask must be binary 0 or 1 at cell 1/,
    )
    expect(s.mask).toEqual(beforeMask)
    expect(s.resource).toEqual(beforeResource)
    expect(s.lineages[0]).toEqual(beforeLineage)
  })

  it('rejects hidden off-mask resource atomically instead of ignoring it', () => {
    const s: EcologyState = {
      width: 2,
      height: 1,
      mask: new Uint8Array([1, 0]),
      resource: new Float32Array([10, 5]),
      lineages: [new Float32Array([1, 0])],
    }
    const beforeResource = s.resource.slice()
    const beforeLineage = s.lineages[0]!.slice()

    expect(() => stepEcology(s, params, neutral(1), 1)).toThrow(
      /resource must be zero outside ecology mask at cell 1/,
    )
    expect(s.resource).toEqual(beforeResource)
    expect(s.lineages[0]).toEqual(beforeLineage)
  })

  it('rejects hidden off-mask lineage biomass atomically instead of ignoring it', () => {
    const s: EcologyState = {
      width: 2,
      height: 1,
      mask: new Uint8Array([1, 0]),
      resource: new Float32Array([10, 0]),
      lineages: [new Float32Array([1, 2])],
    }
    const beforeResource = s.resource.slice()
    const beforeLineage = s.lineages[0]!.slice()

    expect(() => stepEcology(s, params, neutral(1), 1)).toThrow(
      /lineage biomass must be zero outside ecology mask at cell 1/,
    )
    expect(s.resource).toEqual(beforeResource)
    expect(s.lineages[0]).toEqual(beforeLineage)
  })

  it('accepts zero-valued off-mask storage without making it scientific state', () => {
    const s: EcologyState = {
      width: 2,
      height: 1,
      mask: new Uint8Array([1, 0]),
      resource: new Float32Array([0, 0]),
      lineages: [new Float32Array([3, 0])],
    }

    const result = stepEcology(s, params, neutral(1), 1)
    expect(result.metrics.totalBiomass).toBe(3)
    expect(result.metrics.occupiedCells).toBe(1)
    expect(s.resource[1]).toBe(0)
    expect(s.lineages[0]![1]).toBe(0)
  })

  it('rejects materially over-capacity raw state atomically before mutation', () => {
    const s = state(10, [100.001])
    const beforeResource = s.resource.slice()
    const beforeLineage = s.lineages[0]!.slice()

    expect(() => stepEcology(s, params, neutral(1), 1)).toThrow(
      /exceeds localCapacity beyond Float32 representation tolerance/,
    )
    expect(s.resource).toEqual(beforeResource)
    expect(s.lineages[0]).toEqual(beforeLineage)
  })

  it('accepts a Float32 round-trip microscopically above capacity', () => {
    const s = state(0, [Math.fround(0.0001), Math.fround(99.9999)])
    const total = s.lineages[0]![0]! + s.lineages[1]![0]!
    expect(total).toBeGreaterThan(params.localCapacity)

    expect(() => stepEcology(s, params, neutral(2), 1)).not.toThrow()
    expect(s.lineages[0]![0]! + s.lineages[1]![0]!).toBe(total)
  })

  it('accepts its own Float32 output again on the next ecology step', () => {
    const s = state(100, [99])
    stepEcology(s, params, neutral(1), 1)

    const afterFirst = s.lineages[0]![0]!
    expect(afterFirst).toBeCloseTo(params.localCapacity, 5)
    expect(() => stepEcology(s, params, neutral(1), 1)).not.toThrow()
    expect(s.lineages[0]![0]).toBe(afterFirst)
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
