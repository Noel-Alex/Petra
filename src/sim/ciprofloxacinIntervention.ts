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

export const CIPROFLOXACIN_INTERVENTION_SCHEMA_VERSION = 1 as const

/**
 * Engineering bound for one replay command. It is not a biological constant.
 * UI/path resampling may reduce denser pointer histories before commit.
 */
export const MAX_CIPROFLOXACIN_PAINT_SAMPLES = 512 as const

export interface NormalizedInterventionPoint {
  readonly x: number
  readonly y: number
}

export type CiprofloxacinInterventionGeometry =
  | { readonly kind: 'global' }
  | {
      readonly kind: 'radial'
      readonly center: NormalizedInterventionPoint
      /** Fraction of the authoritative dish radius, in (0, 1]. */
      readonly radiusFraction: number
    }
  | {
      readonly kind: 'stripe'
      /**
       * Coordinate axis along which band position and width are measured.
       * axis='x' therefore produces a vertical band; axis='y' a horizontal band.
       */
      readonly axis: 'x' | 'y'
      readonly centerFraction: number
      /** Full band width as a fraction of authoritative dish diameter. */
      readonly widthFraction: number
    }
  | {
      readonly kind: 'paint'
      readonly samples: readonly NormalizedInterventionPoint[]
      /** Brush radius as a fraction of authoritative dish radius. */
      readonly brushRadiusFraction: number
    }

export interface CiprofloxacinIntervention {
  readonly schemaVersion: typeof CIPROFLOXACIN_INTERVENTION_SCHEMA_VERSION
  readonly concentrationMgPerL: number
  readonly concentrationUnit: 'mg/L'
  readonly blendMode: FieldBlendMode
  readonly geometry: CiprofloxacinInterventionGeometry
}

const INTERVENTION_KEYS = new Set([
  'schemaVersion',
  'concentrationMgPerL',
  'concentrationUnit',
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

export function assertCiprofloxacinIntervention(
  value: unknown,
): asserts value is CiprofloxacinIntervention {
  const intervention = requireRecord(value, 'ciprofloxacin intervention')
  assertOnlyKeys(
    intervention,
    INTERVENTION_KEYS,
    'ciprofloxacin intervention',
  )
  if (
    intervention.schemaVersion !==
    CIPROFLOXACIN_INTERVENTION_SCHEMA_VERSION
  ) {
    throw new Error(
      'unsupported ciprofloxacin intervention schema version',
    )
  }
  requireFiniteNonNegativeFloat32(
    'ciprofloxacin concentrationMgPerL',
    intervention.concentrationMgPerL as number,
  )
  if (intervention.concentrationUnit !== 'mg/L') {
    throw new Error('ciprofloxacin concentration unit must be mg/L')
  }
  if (
    intervention.blendMode !== 'set' &&
    intervention.blendMode !== 'add'
  ) {
    throw new Error('ciprofloxacin blend mode must be set or add')
  }

  const geometry = requireRecord(
    intervention.geometry,
    'ciprofloxacin intervention geometry',
  )
  if (geometry.kind === 'global') {
    assertOnlyKeys(geometry, GLOBAL_KEYS, 'global ciprofloxacin geometry')
    return
  }
  if (geometry.kind === 'radial') {
    assertOnlyKeys(geometry, RADIAL_KEYS, 'radial ciprofloxacin geometry')
    assertNormalizedPoint(geometry.center, 'radial center')
    requireOpenClosedUnit(geometry.radiusFraction, 'radial radiusFraction')
    return
  }
  if (geometry.kind === 'stripe') {
    assertOnlyKeys(geometry, STRIPE_KEYS, 'stripe ciprofloxacin geometry')
    if (geometry.axis !== 'x' && geometry.axis !== 'y') {
      throw new Error('ciprofloxacin stripe axis must be x or y')
    }
    requireClosedUnit(geometry.centerFraction, 'stripe centerFraction')
    requireOpenClosedUnit(geometry.widthFraction, 'stripe widthFraction')
    return
  }
  if (geometry.kind === 'paint') {
    assertOnlyKeys(geometry, PAINT_KEYS, 'paint ciprofloxacin geometry')
    if (!Array.isArray(geometry.samples)) {
      throw new Error('ciprofloxacin paint samples must be an array')
    }
    if (
      geometry.samples.length < 1 ||
      geometry.samples.length > MAX_CIPROFLOXACIN_PAINT_SAMPLES
    ) {
      throw new Error(
        `ciprofloxacin paint samples must contain 1..${MAX_CIPROFLOXACIN_PAINT_SAMPLES} points`,
      )
    }
    for (let index = 0; index < geometry.samples.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(geometry.samples, index)) {
        throw new Error(
          `ciprofloxacin paint samples must be dense; missing index ${index}`,
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

  throw new Error('unsupported ciprofloxacin intervention geometry')
}

/**
 * Applies one command transaction against a detached composed state.
 *
 * The exact composed mask is preserved. No regenerated circular geometry is
 * allowed at this authority boundary.
 */
export function applyCiprofloxacinIntervention(
  state: ComposedSimulationState,
  config: ComposedSimulationConfig,
  intervention: CiprofloxacinIntervention,
): void {
  validateComposedStateAgainstConfig(state, config)
  assertCiprofloxacinIntervention(intervention)
  if (config.ciprofloxacin === null) {
    throw new Error(
      'ciprofloxacin intervention requires explicit pharmacodynamic authority',
    )
  }

  const values = Float32Array.from(
    state.ciprofloxacinConcentrationMgPerL,
  )
  const field = exactMaskField(state, values)
  const geometry = intervention.geometry
  const value = intervention.concentrationMgPerL
  const mode = intervention.blendMode
  const radiusScale = dishRadiusInGridCoordinates(state)

  if (geometry.kind === 'global') {
    applyUniform(field, value, mode)
  } else if (geometry.kind === 'radial') {
    const center = toGridPoint(state, geometry.center)
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
        ? geometry.centerFraction * Math.max(0, state.width - 1)
        : Math.max(0, state.width - 1) / 2
    const centerY =
      geometry.axis === 'y'
        ? geometry.centerFraction * Math.max(0, state.height - 1)
        : Math.max(0, state.height - 1) / 2
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
      geometry.samples.map((point) => toGridPoint(state, point)),
      geometry.brushRadiusFraction * radiusScale,
      value,
      mode,
    )
  }

  state.ciprofloxacinConcentrationMgPerL = Array.from(values)
  validateComposedStateAgainstConfig(state, config)
}

function exactMaskField(
  state: ComposedSimulationState,
  values: Float32Array,
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
        throw new Error('cannot write outside composed ciprofloxacin mask')
      }
      values[this.index(x, y)] = requireFiniteNonNegativeFloat32(
        'ciprofloxacin intervention result',
        next,
      )
    },
  }
}

function toGridPoint(
  state: ComposedSimulationState,
  point: NormalizedInterventionPoint,
): { readonly x: number; readonly y: number } {
  return {
    x: point.x * Math.max(0, state.width - 1),
    y: point.y * Math.max(0, state.height - 1),
  }
}

function dishRadiusInGridCoordinates(
  state: ComposedSimulationState,
): number {
  return Math.max(
    0.5,
    (Math.min(state.width, state.height) - 1) / 2,
  )
}

function assertNormalizedPoint(
  value: unknown,
  name: string,
): asserts value is NormalizedInterventionPoint {
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
