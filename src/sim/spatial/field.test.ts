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

  it('rejects JS-finite values that would overflow authoritative Float32 storage', () => {
    const tooLargeForFloat32 = 1e39
    expect(Number.isFinite(tooLargeForFloat32)).toBe(true)

    expect(() =>
      new CircularScalarField(
        { width: 9, height: 9, cellSize: 1 },
        tooLargeForFloat32,
      ),
    ).toThrow(/finite Float32 field storage/)

    const field = new CircularScalarField({ width: 9, height: 9, cellSize: 1 }, 2)
    const before = field.values.slice()
    expect(() => field.fill(tooLargeForFloat32)).toThrow(
      /finite Float32 field storage/,
    )
    expect(field.values).toEqual(before)

    expect(() => field.set(4, 4, tooLargeForFloat32)).toThrow(
      /finite Float32 field storage/,
    )
    expect(field.values).toEqual(before)
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

  it('matches one large interval to the same deterministic stable substeps', () => {
    const coarse = new CircularScalarField({ width:  9, height: 9, cellSize: 1 })
    const reference = new CircularScalarField({ width: 9, height: 9, cellSize: 1 })
    coarse.set(4, 4, 1)
    reference.set(4, 4, 1)

    const plan = coarse.diffuse(1, 1)
    expect(plan).toEqual({ substeps: 4, dtPerSubstep: 0.25 })
    for (let step = 0; step < plan.substeps; step += 1) {
      reference.diffuse(1, plan.dtPerSubstep)
    }

    expect(coarse.values).toEqual(reference.values)
    expectFiniteNonNegative(coarse)
  })

  it('refuses an unrepresentable diffusion substep count before mutating the field', () => {
    const field = new CircularScalarField({ width: 9, height: 9, cellSize: 1 })
    field.set(4, 4, 1)
    const before = field.values.slice()

    expect(() => field.diffuse(1e15, 10)).toThrow(/safe integer/)
    expect(field.values).toEqual(before)
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

  it('rolls back the whole intervention when a later add would overflow Float32', () => {
    const field = new CircularScalarField({ width: 9, height: 9, cellSize: 1 })
    const maxFloat32 = 3.4028234663852886e38
    field.set(4, 4, maxFloat32)
    const before = field.values.slice()

    expect(() =>
      applyRadial(field, 4, 4, 1, maxFloat32, 'add'),
    ).toThrow(/finite Float32 field storage/)
    expect(field.values).toEqual(before)
  })

  it('rejects malformed brush geometry atomically after valid earlier points', () => {
    const field = new CircularScalarField({ width: 9, height: 9, cellSize: 1 })
    const before = field.values.slice()
    const malformed = [
      { x: 4, y: 4 },
      { x: Number.NaN, y: 4 },
    ] as unknown as readonly { x: number; y: number }[]

    expect(() => applyBrush(field, malformed, 1, 2, 'add')).toThrow(
      /brush point 1 x must be finite/,
    )
    expect(field.values).toEqual(before)
  })

  it('rejects sparse brush arrays atomically', () => {
    const field = new CircularScalarField({ width: 9, height: 9, cellSize: 1 })
    const before = field.values.slice()
    const sparse = new Array<{ x: number; y: number }>(2)
    sparse[0] = { x: 4, y: 4 }

    expect(() => applyBrush(field, sparse, 1, 2, 'add')).toThrow(
      /brush points must be dense; missing index 1/,
    )
    expect(field.values).toEqual(before)
  })

  it('rejects non-finite intervention centers instead of silently no-oping', () => {
    const field = new CircularScalarField({ width: 9, height: 9, cellSize: 1 }, 1)
    const before = field.values.slice()

    expect(() => applyRadial(field, Number.NaN, 4, 1, 2)).toThrow(
      /radial centerX must be finite/,
    )
    expect(field.values).toEqual(before)

    expect(() => applyBand(field, 4, Number.POSITIVE_INFINITY, 1, 0, 1, 2)).toThrow(
      /band centerY must be finite/,
    )
    expect(field.values).toEqual(before)
  })

  it('rejects an invalid runtime blend mode instead of aliasing it to add', () => {
    const field = new CircularScalarField({ width: 9, height: 9, cellSize: 1 }, 1)
    const before = field.values.slice()

    expect(() =>
      applyUniform(field, 2, 'multiply' as unknown as 'set'),
    ).toThrow(/blend mode must be set or add/)
    expect(field.values).toEqual(before)
  })

  it('preserves sequential Float32 overlap semantics while staging brush writes', () => {
    const field = new CircularScalarField({ width: 9, height: 9, cellSize: 1 })
    const value = 0.1
    let expected = 0
    expected = Math.fround(expected + value)
    expected = Math.fround(expected + value)

    applyBrush(
      field,
      [{ x: 4, y: 4 }, { x: 4, y: 4 }],
      0,
      value,
      'add',
    )

    expect(field.get(4, 4)).toBe(expected)
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
