/** Numerical fixture only: grid spacing, diffusion coefficients, masses, and
 * intervention magnitudes below are synthetic invariant tests, not physical parameters. */
import { describe, expect, it } from 'vitest'
import { CircularScalarField } from './field'
import { applyBand, applyBrush, applyRadial, applyUniform } from './interventions'

function expectFiniteNonNegative(field: CircularScalarField): void {
  for (let index = 0; index < field.values.length; index += 1) {
    expect(Number.isFinite(field.values[index]!)).toBe(true)
    expect(field.values[index]!).toBeGreaterThanOrEqual(0)
    if (field.mask[index] === 0) expect(field.values[index]).toBe(0)
  }
}

describe('CircularScalarField', () => {
  it('creates a circular mask and keeps outside cells at zero', () => {
    const field = new CircularScalarField({ width: 9, height: 9, cellSize: 1 }, 2)
    expect(field.isInside(4, 4)).toBe(true)
    expect(field.isInside(0, 0)).toBe(false)
    expect(field.get(0, 0)).toBe(0)
    expectFiniteNonNegative(field)
  })

  it('rejects non-finite custom dish centers instead of creating an empty domain', () => {
    for (const centerX of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() =>
        new CircularScalarField({
          width: 9,
          height: 9,
          cellSize: 1,
          centerX,
        }),
      ).toThrow(/center coordinates must be finite/)
    }

    expect(() =>
      new CircularScalarField({
        width: 9,
        height: 9,
        cellSize: 1,
        centerY: Number.NaN,
      }),
    ).toThrow(/center coordinates must be finite/)
  })

  it('rejects finite geometry with no authoritative dish cells', () => {
    expect(() =>
      new CircularScalarField({
        width: 9,
        height: 9,
        cellSize: 1,
        centerX: 100,
        centerY: 100,
        radius: 0.25,
      }),
    ).toThrow(/at least one authoritative grid cell/)
  })

  it('preserves finite off-center dishes that genuinely intersect the grid', () => {
    const field = new CircularScalarField({
      width: 9,
      height: 9,
      cellSize: 1,
      centerX: 1,
      centerY: 1,
      radius: 1.1,
    }, 2)

    expect(field.isInside(1, 1)).toBe(true)
    expect(field.total()).toBeGreaterThan(0)
    expectFiniteNonNegative(field)
  })

  it('conserves total mass under no-flux diffusion', () => {
    const field = new CircularScalarField({ width: 33, height: 33, cellSize: 0.25 })
    field.set(16, 16, 100)
    const before = field.total()
    const result = field.diffuse(1.5, 1)
    const after = field.total()
    expect(result.substeps).toBeGreaterThan(1)
    expect(after).toBeCloseTo(before, 4)
    expectFiniteNonNegative(field)
  })

  it('preserves reflection symmetry for a centered impulse', () => {
    const field = new CircularScalarField({ width: 21, height: 21, cellSize: 1 })
    field.set(10, 10, 1)
    field.diffuse(0.1, 2)
    for (let offset = 0; offset <= 5; offset += 1) {
      expect(field.get(10 + offset, 10)).toBeCloseTo(field.get(10 - offset, 10), 7)
      expect(field.get(10, 10 + offset)).toBeCloseTo(field.get(10, 10 - offset), 7)
    }
  })

  it('does not allocate or advance diffusion when D or dt is zero', () => {
    const field = new CircularScalarField({ width: 9, height: 9, cellSize: 1 }, 3)
    const before = [...field.values]
    expect(field.diffuse(0, 10).substeps).toBe(0)
    expect(field.diffuse(2, 0).substeps).toBe(0)
    expect([...field.values]).toEqual(before)
  })
})

describe('field interventions', () => {
  it('supports uniform, radial, band, and brush writes without escaping the mask', () => {
    const field = new CircularScalarField({ width: 25, height: 25, cellSize: 1 })
    applyUniform(field, 1)
    applyRadial(field, 12, 12, 3, 2, 'add')
    applyBand(field, 12, 12, 1, 0, 1, 4)
    applyBrush(field, [{ x: 12, y: 12 }, { x: 14, y: 12 }], 1.5, 1, 'add')
    expect(field.get(12, 12)).toBeGreaterThan(4)
    expectFiniteNonNegative(field)
  })

  it('rejects invalid numerical inputs', () => {
    const field = new CircularScalarField({ width: 9, height: 9, cellSize: 1 })
    expect(() => field.diffuse(-1, 1)).toThrow()
    expect(() => field.diffuse(1, -1)).toThrow()
    expect(() => applyRadial(field, 4, 4, -1, 1)).toThrow()
    expect(() => applyBand(field, 4, 4, 0, 0, 1, 1)).toThrow()
  })
})
