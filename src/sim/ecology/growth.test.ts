/** Numerical fixture only: these compact values exercise Monod/yield/capacity
 * invariants and are not E. coli biological constants or a flagship preset. */
import { describe, expect, it } from 'vitest'
import { monod, stepEcology, type EcologyState, type GrowthParameters } from './growth'

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
    lineages: lineages.map((x) => new Float32Array([x])),
  }
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
    const metrics = stepEcology(s, params, 1)
    expect(s.lineages[0]![0]).toBe(10)
    expect(metrics.divisions).toBe(0)
    expect(metrics.resourceConsumed).toBe(0)
  })

  it('obeys yield when resource is the limiting factor', () => {
    const s = state(1, [50])
    const metrics = stepEcology(s, { ...params, maxDivisionRate: 100 }, 0.1)
    expect(metrics.divisions).toBeCloseTo(2, 6)
    expect(metrics.resourceConsumed).toBeCloseTo(1, 6)
    expect(s.resource[0]).toBeCloseTo(0, 6)
  })

  it('never grows beyond local capacity', () => {
    const s = state(100, [99])
    stepEcology(s, params, 1)
    expect(s.lineages[0]![0]).toBeCloseTo(100, 5)
  })

  it('allocates a shared limiting resource proportionally regardless of lineage ordering', () => {
    const a = state(1, [10, 30])
    const b = state(1, [30, 10])
    stepEcology(a, { ...params, maxDivisionRate: 100 }, 0.1)
    stepEcology(b, { ...params, maxDivisionRate: 100 }, 0.1)
    expect(a.lineages[0]![0]).toBeCloseTo(b.lineages[1]![0]!, 5)
    expect(a.lineages[1]![0]).toBeCloseTo(b.lineages[0]![0]!, 5)
    expect(a.resource[0]).toBeCloseTo(b.resource[0]!, 6)
  })

  it('conserves biomass during the coarse spread step', () => {
    const s: EcologyState = {
      width: 3,
      height: 3,
      mask: new Uint8Array(9).fill(1),
      resource: new Float32Array(9),
      lineages: [new Float32Array([0, 0, 0, 0, 10, 0, 0, 0, 0])],
    }
    const metrics = stepEcology(s, { ...params, maxDivisionRate: 0, spreadRate: 0.1 }, 1)
    expect(metrics.totalBiomass).toBeCloseTo(10, 5)
    expect(s.lineages[0]![4]).toBeCloseTo(6, 5)
    expect(s.lineages[0]![1]).toBeCloseTo(1, 5)
    expect(s.lineages[0]![3]).toBeCloseTo(1, 5)
    expect(s.lineages[0]![5]).toBeCloseTo(1, 5)
    expect(s.lineages[0]![7]).toBeCloseTo(1, 5)
  })
})
