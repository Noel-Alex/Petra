import {
  validateComposedStateAgainstConfig,
  type ComposedSimulationConfig,
  type ComposedSimulationState,
} from './authoritative'
import { requireFiniteNonNegativeFloat32 } from './spatial/field'
import {
  applyBand,
  applyBrush,
  applyRadial,
  applyUniform,
  type FieldBlendMode,
  type WritableScalarField,
} from './spatial/interventions'

export const MODEL_RESOURCE_INTERVENTION_SCHEMA_VERSION = 1 as const
export const MODEL_RESOURCE_UNIT = 'model-resource' as const

/**
 * Engineering work bound for one paint command. This is not a biological,
 * transport, or dose parameter.
 */
export const MAX_MODEL_RESOURCE_PAINT_SAMPLES = 512 as const

export interface NormalizedModelResourceInterventionPoint {
  readonly x: number
  readonly y: number
}

export type ModelResourceInterventionGeometry =
  | { readonly kind: 'global' }
  | {
      readonly kind: 'radial'
      readonly center: NormalizedModelResourceInterventionPoint
      /** Fraction of the authoritative mask's shorter bounding radius, in (0, 1]. */
      readonly radiusFraction: number
    }
  | {
      readonly kind: 'stripe'
      /** axis='x' produces a vertical band; axis='y' a horizontal band. */
      readonly axis: 'x' | 'y'
      readonly centerFraction: number
      /** Full band width as a fraction of the authoritative mask's shorter bounding diameter. */
      readonly widthFraction: number
    }
  | {
      readonly kind: 'paint'
      readonly samples: readonly NormalizedModelResourceInterventionPoint[]
      /** Brush radius as a fraction of the authoritative mask's shorter bounding radius. */
      readonly brushRadiusFraction: number
    }

export interface ModelResourceIntervention {
  readonly schemaVersion: typeof MODEL_RESOURCE_INTERVENTION_SCHEMA_VERSION
  readonly resourceValue: number
  readonly resourceUnit: typeof MODEL_RESOURCE_UNIT
  readonly blendMode: FieldBlendMode
  readonly geometry: ModelResourceInterventionGeometry
}

const INTERVENTION_KEYS = new Set([
  'schemaVersion',
  'resourceValue',
  'resourceUnit',
  'blendMode',
  'geometry',
])
const GLOBAL_KEYS = new Set(['kind'])
const RADIAL_KEYS = new Set(['kind', 'center', 'radiusFraction'])
const STRIPE_KEYS = new Set([
  'kind',
  'axis',
  'centerFraction',
  'widthFraction',
])
const PAINT_KEYS = new Set(['kind', 'samples', 'brushRadiusFraction'])
const POINT_KEYS = new Set(['x', 'y'])

export function assertModelResourceIntervention(
  value: unknown,
): asserts value is ModelResourceIntervention {
  const intervention = requireRecord(value, 'model-resource intervention')
  assertOnlyKeys(
    intervention,
    INTERVENTION_KEYS,
    'model-resource intervention',
  )

  if (
    intervention.schemaVersion !== MODEL_RESOURCE_INTERVENTION_SCHEMA_VERSION
  ) {
    throw new Error('unsupported model-resource intervention schema version')
  }
  requireFiniteNonNegativeFloat32(
    'model-resource intervention resourceValue',
    intervention.resourceValue as number,
  )
  if (intervention.resourceUnit !== MODEL_RESOURCE_UNIT) {
    throw new Error('model-resource intervention unit must be model-resource')
  }
  if (
    intervention.blendMode !== 'set' &&
    intervention.blendMode !== 'add'
  ) {
    throw new Error('model-resource intervention blend mode must be set or add')
  }

  const geometry = requireRecord(
    intervention.geometry,
    'model-resource intervention geometry',
  )
  if (geometry.kind === 'global') {
    assertOnlyKeys(geometry, GLOBAL_KEYS, 'global model-resource geometry')
    return
  }
  if (geometry.kind === 'radial') {
    assertOnlyKeys(geometry, RADIAL_KEYS, 'radial model-resource geometry')
    assertNormalizedPoint(geometry.center, 'radial center')
    requireOpenClosedUnit(geometry.radiusFraction, 'radial radiusFraction')
    return
  }
  if (geometry.kind === 'stripe') {
    assertOnlyKeys(geometry, STRIPE_KEYS, 'stripe model-resource geometry')
    if (geometry.axis !== 'x' && geometry.axis !== 'y') {
      throw new Error('model-resource stripe axis must be x or y')
    }
    requireClosedUnit(geometry.centerFraction, 'stripe centerFraction')
    requireOpenClosedUnit(geometry.widthFraction, 'stripe widthFraction')
    return
  }
  if (geometry.kind === 'paint') {
    assertOnlyKeys(geometry, PAINT_KEYS, 'paint model-resource geometry')
    if (!Array.isArray(geometry.samples)) {
      throw new Error('model-resource paint samples must be an array')
    }
    if (
      geometry.samples.length < 1 ||
      geometry.samples.length > MAX_MODEL_RESOURCE_PAINT_SAMPLES
    ) {
      throw new Error(
        `model-resource paint samples must contain 1..${MAX_MODEL_RESOURCE_PAINT_SAMPLES} points`,
      )
    }
    for (let index = 0; index < geometry.samples.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(geometry.samples, index)) {
        throw new Error(
          `model-resource paint samples must be dense; missing index ${index}`,
        )
      }
      assertNormalizedPoint(
        geometry.samples[index],
        `paint sample ${index}`,
      )
    }
    requireOpenClosedUnit(
      geometry.brushRadiusFraction,
      'paint brushRadiusFraction',
    )
    return
  }

  throw new Error('unsupported model-resource intervention geometry')
}

/**
 * Applies a model-unit resource edit to a detached candidate and publishes only
 * after the full candidate passes composed-state validation.
 *
 * This is deliberately pre-wire simulation authority: it does not increment
 * command counters, emit timeline events, or claim a physical nutrient dose.
 */
export function applyModelResourceIntervention(
  state: ComposedSimulationState,
  config: ComposedSimulationConfig,
  intervention: ModelResourceIntervention,
): void {
  validateComposedStateAgainstConfig(state, config)
  assertModelResourceIntervention(intervention)

  // Preserve untouched resource values byte-for-byte at the JavaScript-number
  // level. Current composed authority does not require pre-existing resource
  // values to be canonical Float32, so copying the entire field through a
  // Float32Array here would create an unrelated whole-field mutation.
  const nextResource = Array.from(state.resource)
  const field = exactMaskResourceField(state, nextResource)
  const geometry = intervention.geometry
  const value = intervention.resourceValue
  const mode = intervention.blendMode
  const bounds = authoritativeMaskBounds(state)
  const radiusScale =
    Math.min(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) / 2

  if (geometry.kind === 'global') {
    applyUniform(field, value, mode)
  } else if (geometry.kind === 'radial') {
    const center = toGridPoint(bounds, geometry.center)
    applyRadial(
      field,
      center.x,
      center.y,
      geometry.radiusFraction * radiusScale,
      value,
      mode,
    )
  } else if (geometry.kind === 'stripe') {
    const centerX =
      geometry.axis === 'x'
        ? bounds.minX +
          geometry.centerFraction * (bounds.maxX - bounds.minX)
        : (bounds.minX + bounds.maxX) / 2
    const centerY =
      geometry.axis === 'y'
        ? bounds.minY +
          geometry.centerFraction * (bounds.maxY - bounds.minY)
        : (bounds.minY + bounds.maxY) / 2
    applyBand(
      field,
      centerX,
      centerY,
      geometry.axis === 'x' ? 1 : 0,
      geometry.axis === 'y' ? 1 : 0,
      geometry.widthFraction * radiusScale,
      value,
      mode,
    )
  } else {
    applyBrush(
      field,
      geometry.samples.map((point) => toGridPoint(bounds, point)),
      geometry.brushRadiusFraction * radiusScale,
      value,
      mode,
    )
  }

  const candidate: ComposedSimulationState = {
    ...state,
    resource: nextResource,
  }
  validateComposedStateAgainstConfig(candidate, config)
  state.resource = nextResource
}

function exactMaskResourceField(
  state: ComposedSimulationState,
  values: number[],
): WritableScalarField {
  return {
    width: state.width,
    height: state.height,
    values,
    index(x: number, y: number): number {
      return y * state.width + x
    },
    isInside(x: number, y: number): boolean {
      if (
        !Number.isInteger(x) ||
        !Number.isInteger(y) ||
        x < 0 ||
        y < 0 ||
        x >= state.width ||
        y >= state.height
      ) {
        return false
      }
      return state.mask[y * state.width + x] === 1
    },
    set(x: number, y: number, next: number): void {
      if (!this.isInside(x, y)) {
        throw new Error('cannot write outside composed model-resource mask')
      }
      values[this.index(x, y)] = requireFiniteNonNegativeFloat32(
        'model-resource intervention result',
        next,
      )
    },
  }
}

interface AuthoritativeMaskBounds {
  readonly minX: number
  readonly maxX: number
  readonly minY: number
  readonly maxY: number
}

function authoritativeMaskBounds(
  state: ComposedSimulationState,
): AuthoritativeMaskBounds {
  let minX = state.width
  let maxX = -1
  let minY = state.height
  let maxY = -1

  for (let y = 0; y < state.height; y += 1) {
    for (let x = 0; x < state.width; x += 1) {
      if (state.mask[y * state.width + x] !== 1) continue
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    }
  }

  if (maxX < minX || maxY < minY) {
    throw new Error('composed model-resource mask has no authoritative cells')
  }
  return { minX, maxX, minY, maxY }
}

function toGridPoint(
  bounds: AuthoritativeMaskBounds,
  point: NormalizedModelResourceInterventionPoint,
): { readonly x: number; readonly y: number } {
  return {
    x: bounds.minX + point.x * (bounds.maxX - bounds.minX),
    y: bounds.minY + point.y * (bounds.maxY - bounds.minY),
  }
}

function assertNormalizedPoint(
  value: unknown,
  name: string,
): asserts value is NormalizedModelResourceInterventionPoint {
  const point = requireRecord(value, name)
  assertOnlyKeys(point, POINT_KEYS, name)
  requireClosedUnit(point.x, `${name}.x`)
  requireClosedUnit(point.y, `${name}.y`)
}

function requireClosedUnit(value: unknown, name: string): void {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    throw new Error(`${name} must be finite and in [0, 1]`)
  }
}

function requireOpenClosedUnit(value: unknown, name: string): void {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value <= 0 ||
    value > 1
  ) {
    throw new Error(`${name} must be finite and in (0, 1]`)
  }
}

function assertOnlyKeys(
  record: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  name: string,
): void {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      throw new Error(
        `${name} contains unsupported field ${JSON.stringify(key)}`,
      )
    }
  }
}

function requireRecord(
  value: unknown,
  name: string,
): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    throw new Error(`${name} must be an object`)
  }
  return value as Record<string, unknown>
}
