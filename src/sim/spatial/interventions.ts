import {
  CircularScalarField,
  requireFiniteNonNegativeFloat32,
} from './field'

export type FieldBlendMode = 'set' | 'add'

function validateMagnitude(value: number): void {
  requireFiniteNonNegativeFloat32('intervention value', value)
}

function validateBlendMode(mode: FieldBlendMode): void {
  if (mode !== 'set' && mode !== 'add') {
    throw new Error('field blend mode must be set or add')
  }
}

function validateFiniteCoordinate(name: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be finite`)
  }
}

type PendingWrites = Map<number, number>

function stageWrite(
  field: CircularScalarField,
  pending: PendingWrites,
  x: number,
  y: number,
  value: number,
  mode: FieldBlendMode,
): void {
  if (!field.isInside(x, y)) return

  const index = field.index(x, y)
  const previous = pending.get(index) ?? field.values[index]!
  const next = mode === 'set' ? value : previous + value
  const stored = requireFiniteNonNegativeFloat32(
    'intervention result',
    next,
  )
  // Store the binary32-rounded result now so overlapping staged writes reproduce
  // the exact sequential Float32 semantics of the previous implementation.
  pending.set(index, stored)
}

function commitWrites(
  field: CircularScalarField,
  pending: PendingWrites,
): void {
  for (const [index, value] of pending) {
    const x = index % field.width
    const y = Math.floor(index / field.width)
    field.set(x, y, value)
  }
}

function stageRadial(
  field: CircularScalarField,
  pending: PendingWrites,
  centerX: number,
  centerY: number,
  radius: number,
  value: number,
  mode: FieldBlendMode,
): void {
  const radiusSquared = radius * radius
  for (let y = 0; y < field.height; y += 1) {
    for (let x = 0; x < field.width; x += 1) {
      const dx = x - centerX
      const dy = y - centerY
      if (dx * dx + dy * dy <= radiusSquared) {
        stageWrite(field, pending, x, y, value, mode)
      }
    }
  }
}

export function applyUniform(
  field: CircularScalarField,
  value: number,
  mode: FieldBlendMode = 'set',
): void {
  validateMagnitude(value)
  validateBlendMode(mode)

  const pending: PendingWrites = new Map()
  for (let y = 0; y < field.height; y += 1) {
    for (let x = 0; x < field.width; x += 1) {
      stageWrite(field, pending, x, y, value, mode)
    }
  }
  commitWrites(field, pending)
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
  validateBlendMode(mode)
  validateFiniteCoordinate('radial centerX', centerX)
  validateFiniteCoordinate('radial centerY', centerY)
  if (!Number.isFinite(radius) || radius < 0) {
    throw new Error('radius must be finite and non-negative')
  }

  const pending: PendingWrites = new Map()
  stageRadial(field, pending, centerX, centerY, radius, value, mode)
  commitWrites(field, pending)
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
  validateBlendMode(mode)
  validateFiniteCoordinate('band centerX', centerX)
  validateFiniteCoordinate('band centerY', centerY)
  if (!Number.isFinite(halfWidth) || halfWidth < 0) {
    throw new Error('halfWidth must be finite and non-negative')
  }
  const norm = Math.hypot(normalX, normalY)
  if (!Number.isFinite(norm) || norm === 0) {
    throw new Error('band normal must be finite and non-zero')
  }
  const nx = normalX / norm
  const ny = normalY / norm

  const pending: PendingWrites = new Map()
  for (let y = 0; y < field.height; y += 1) {
    for (let x = 0; x < field.width; x += 1) {
      const signedDistance = (x - centerX) * nx + (y - centerY) * ny
      if (Math.abs(signedDistance) <= halfWidth) {
        stageWrite(field, pending, x, y, value, mode)
      }
    }
  }
  commitWrites(field, pending)
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
  validateMagnitude(value)
  validateBlendMode(mode)
  if (!Number.isFinite(radius) || radius < 0) {
    throw new Error('radius must be finite and non-negative')
  }
  if (!Array.isArray(points)) {
    throw new Error('brush points must be a dense array')
  }

  const pending: PendingWrites = new Map()
  for (let index = 0; index < points.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(points, index)) {
      throw new Error(`brush points must be dense; missing index ${index}`)
    }
    const point = points[index] as unknown
    if (!isRecord(point)) {
      throw new Error(`brush point ${index} must be an object`)
    }
    const x = point.x
    const y = point.y
    if (typeof x !== 'number' || !Number.isFinite(x)) {
      throw new Error(`brush point ${index} x must be finite`)
    }
    if (typeof y !== 'number' || !Number.isFinite(y)) {
      throw new Error(`brush point ${index} y must be finite`)
    }
    stageRadial(field, pending, x, y, radius, value, mode)
  }
  commitWrites(field, pending)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
