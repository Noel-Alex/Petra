import { CircularScalarField } from './field'

export type FieldBlendMode = 'set' | 'add'

function validateMagnitude(value: number): void {
  if (!Number.isFinite(value) || value < 0) throw new Error('intervention value must be finite and non-negative')
}

function apply(field: CircularScalarField, x: number, y: number, value: number, mode: FieldBlendMode): void {
  if (!field.isInside(x, y)) return
  field.set(x, y, mode === 'set' ? value : field.get(x, y) + value)
}

export function applyUniform(field: CircularScalarField, value: number, mode: FieldBlendMode = 'set'): void {
  validateMagnitude(value)
  for (let y = 0; y < field.height; y += 1) {
    for (let x = 0; x < field.width; x += 1) apply(field, x, y, value, mode)
  }
}

export function applyRadial(
  field: CircularScalarField,
  centerX: number,
  centerY: number,
  radius: number,
  value: number,
  mode: FieldBlendMode = 'set',
): void {
  validateMagnitude(value)
  if (!Number.isFinite(radius) || radius < 0) throw new Error('radius must be finite and non-negative')
  const radiusSquared = radius * radius
  for (let y = 0; y < field.height; y += 1) {
    for (let x = 0; x < field.width; x += 1) {
      const dx = x - centerX
      const dy = y - centerY
      if (dx * dx + dy * dy <= radiusSquared) apply(field, x, y, value, mode)
    }
  }
}

/** Writes a stripe defined by signed projection along a unit-normal direction. */
export function applyBand(
  field: CircularScalarField,
  centerX: number,
  centerY: number,
  normalX: number,
  normalY: number,
  halfWidth: number,
  value: number,
  mode: FieldBlendMode = 'set',
): void {
  validateMagnitude(value)
  if (!Number.isFinite(halfWidth) || halfWidth < 0) throw new Error('halfWidth must be finite and non-negative')
  const norm = Math.hypot(normalX, normalY)
  if (!Number.isFinite(norm) || norm === 0) throw new Error('band normal must be finite and non-zero')
  const nx = normalX / norm
  const ny = normalY / norm
  for (let y = 0; y < field.height; y += 1) {
    for (let x = 0; x < field.width; x += 1) {
      const signedDistance = (x - centerX) * nx + (y - centerY) * ny
      if (Math.abs(signedDistance) <= halfWidth) apply(field, x, y, value, mode)
    }
  }
}

export interface BrushPoint {
  x: number
  y: number
}

/** Applies a circular brush at each sampled pointer point. UI interpolation belongs outside simulation authority. */
export function applyBrush(
  field: CircularScalarField,
  points: readonly BrushPoint[],
  radius: number,
  value: number,
  mode: FieldBlendMode = 'set',
): void {
  for (const point of points) applyRadial(field, point.x, point.y, radius, value, mode)
}
