import { describe, expect, it } from 'vitest'
import { stepEcology, type EcologyState, type GrowthParameters } from './growth'

// Numerical fixtures only; none of these values are E. coli constants.
const p: GrowthParameters = {
  maxDivisionRate: 0,
  halfSaturation: 1,
  biomassYield: 1,
  localCapacity: 100,
  spreadRate: 0.25,
}

const neutral = (count: number) =>
  Array.from({ length: count }, () => ({ relativeFitness: 1, deathHazardPerTime: 0 }))

function make(lineages: number[][]): EcologyState {
  const width = lineages[0]!.length
  return {
    width,
    height: 1,
    mask: new Uint8Array(width).fill(1),
    resource: new Float32Array(width),
    lineages: lineages.map((values) => new Float32Array(values)),
  }
}

function total(state: EcologyState): number {
  return state.lineages.reduce(
    (sum, lineage) => sum + Array.from(lineage).reduce((lineageSum, value) => lineageSum + value, 0),
    0,
  )
}

function localTotal(state: EcologyState, index: number): number {
  return state.lineages.reduce((sum, lineage) => sum + lineage[index]!, 0)
}

describe('capacity-conservative colony spread', () => {
  it('never pushes a full destination above local capacity and conserves biomass', () => {
    const state = make([[10, 100]])
    const before = total(state)

    stepEcology(state, p, neutral(1), 1)

    // The full cell may export biomass during the simultaneous step, but it
    // cannot accept the neighbour's proposal while its capacity is reserved.
    expect(localTotal(state, 1)).toBeCloseTo(75, 5)
    expect(localTotal(state, 1)).toBeLessThanOrEqual(p.localCapacity)
    expect(total(state)).toBeCloseTo(before, 5)
  })

  it('accepts only the declared free capacity while rejected incoming biomass stays at sources', () => {
    const state = make([[20, 95]])
    const before = total(state)

    stepEcology(state, p, neutral(1), 1)

    // 5 units are accepted into the 95-unit destination; its independent
    // outgoing proposal is 23.75, so simultaneous transport leaves 76.25.
    expect(state.lineages[0]![0]).toBeCloseTo(38.75, 5)
    expect(state.lineages[0]![1]).toBeCloseTo(76.25, 5)
    expect(total(state)).toBeCloseTo(before, 5)
  })

  it('shares constrained incoming capacity proportionally across lineages regardless of channel order', () => {
    const a = make([[20, 45, 0], [0, 45, 20]])
    const b = make([[0, 45, 20], [20, 45, 0]])
    const beforeA = total(a)
    const beforeB = total(b)

    stepEcology(a, p, neutral(2), 1)
    stepEcology(b, p, neutral(2), 1)

    for (let index = 0; index < 3; index += 1) {
      expect(a.lineages[0]![index]).toBeCloseTo(b.lineages[1]![index]!, 5)
      expect(a.lineages[1]![index]).toBeCloseTo(b.lineages[0]![index]!, 5)
      expect(localTotal(a, index)).toBeLessThanOrEqual(p.localCapacity + 1e-5)
    }
    expect(total(a)).toBeCloseTo(beforeA, 5)
    expect(total(b)).toBeCloseTo(beforeB, 5)
  })

  it('proportionally shares genuinely oversubscribed capacity across sources and lineages', () => {
    const state = make([[20, 49, 10], [10, 49, 20]])
    const before = total(state)

    stepEcology(state, p, neutral(2), 1)

    // The centre begins at 98/100 capacity. Its neighbours propose 15 total
    // incoming units, so only 2 are accepted (factor 2/15), split equally by
    // the two lineage contributions. The centre simultaneously spreads out.
    expect(state.lineages[0]![0]).toBeCloseTo(31.5833333, 5)
    expect(state.lineages[1]![0]).toBeCloseTo(21.9166667, 5)
    expect(state.lineages[0]![1]).toBeCloseTo(25.5, 5)
    expect(state.lineages[1]![1]).toBeCloseTo(25.5, 5)
    expect(state.lineages[0]![2]).toBeCloseTo(21.9166667, 5)
    expect(state.lineages[1]![2]).toBeCloseTo(31.5833333, 5)
    expect(total(state)).toBeCloseTo(before, 5)
  })

  it('does not reuse same-step death vacancy as spread capacity', () => {
    const state = make([[20, 100]])
    const before = total(state)

    stepEcology(
      state,
      p,
      [{ relativeFitness: 1, deathHazardPerTime: new Float32Array([0, Math.log(2)]) }],
      1,
    )

    // Cell 1 loses half its biomass, but its pre-death 100-unit occupancy keeps
    // incoming acceptance at zero for this operator step. It can still export
    // 25% of its post-death biomass, hence 37.5 remains there.
    expect(state.lineages[0]![1]).toBeCloseTo(37.5, 5)
    expect(total(state)).toBeCloseTo(before - 50, 5)
  })
})
