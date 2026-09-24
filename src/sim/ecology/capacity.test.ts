import { describe, expect, it } from 'vitest'

import {
  FLOAT32_RELATIVE_SPACING,
  assertEcologyLocalCapacity,
  ecologyCapacityRepresentationTolerance,
} from './capacity'

describe('ecology local-capacity representation tolerance', () => {
  it('uses one binary32 relative spacing rather than biological slack', () => {
    const tolerance = ecologyCapacityRepresentationTolerance(100, 2)
    expect(tolerance).toBe(100 * FLOAT32_RELATIVE_SPACING)
    expect(tolerance).toBeCloseTo(0.000011920928955078125, 15)
  })

  it('accepts a real Float32 round-trip that lands microscopically above capacity', () => {
    const first = Math.fround(0.0001)
    const second = Math.fround(99.9999)
    const storedTotal = first + second

    expect(storedTotal).toBeGreaterThan(100)
    expect(storedTotal - 100).toBeLessThan(
      ecologyCapacityRepresentationTolerance(100, 2),
    )
    expect(() =>
      assertEcologyLocalCapacity(storedTotal, 100, 2, 0),
    ).not.toThrow()
  })

  it('rejects materially over-capacity state instead of clipping it', () => {
    expect(() =>
      assertEcologyLocalCapacity(100.001, 100, 2, 4),
    ).toThrow(/exceeds localCapacity.*cell 4/)
  })

  it('rejects values beyond the representation envelope even when the excess is small', () => {
    const tolerance = ecologyCapacityRepresentationTolerance(100, 3)
    expect(() =>
      assertEcologyLocalCapacity(100 + tolerance * 2, 100, 3),
    ).toThrow(/Float32 representation tolerance/)
  })

  it('validates policy inputs rather than manufacturing a tolerance', () => {
    expect(() => ecologyCapacityRepresentationTolerance(0, 1)).toThrow(
      /localCapacity/,
    )
    expect(() => ecologyCapacityRepresentationTolerance(100, -1)).toThrow(
      /lineageCount/,
    )
    expect(() => assertEcologyLocalCapacity(Number.NaN, 100, 1)).toThrow(
      /totalBiomass/,
    )
  })
})
