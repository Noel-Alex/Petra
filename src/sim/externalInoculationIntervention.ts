import {
  assertComposedParameterSetBindingRecord,
  type ComposedParameterSetBinding,
} from './parameterSetBinding'
import { requireFiniteNonNegativeFloat32 } from './spatial/field'

export const EXTERNAL_INOCULATION_INTERVENTION_SCHEMA_VERSION = 1 as const
export const EXTERNAL_INOCULATION_AUTHORITY_REFERENCE_SCHEMA_VERSION = 1 as const

/**
 * Exact provenance references needed to resolve a supported externally
 * introduced lineage without allowing a caller/UI to author biological
 * coefficients.
 *
 * This record is necessary but not sufficient for acceptance. The eventual
 * state transaction must resolve it against repository/scenario support
 * authority before allocating a runtime lineage.
 */
export interface ExternalInoculationAuthorityReference {
  readonly schemaVersion:
    typeof EXTERNAL_INOCULATION_AUTHORITY_REFERENCE_SCHEMA_VERSION
  readonly scenarioId: string
  readonly scenarioVersion: string
  readonly parameterSetBinding: ComposedParameterSetBinding
  /** Static versioned lineage definition in the referenced parameter set. */
  readonly lineageDefinitionId: string
  readonly genotypeId: string
  readonly taxonId: string
  readonly taxonContentVersion: string
}

export interface ExternalInoculationGridCellPlacement {
  readonly kind: 'grid-cell'
  readonly x: number
  readonly y: number
}

export interface ExternalInoculationModelBiomass {
  readonly value: number
  readonly unit: 'model-biomass'
}

/**
 * Pure replay payload for a future authoritative external-inoculation command.
 *
 * V1 intentionally carries one exact model-grid cell and model-biomass only.
 * It does not accept normalized renderer coordinates, CFU/cell counts,
 * physical mass, or caller-supplied growth/loss parameters.
 */
export interface ExternalInoculationIntervention {
  readonly schemaVersion: typeof EXTERNAL_INOCULATION_INTERVENTION_SCHEMA_VERSION
  readonly authority: ExternalInoculationAuthorityReference
  readonly placement: ExternalInoculationGridCellPlacement
  readonly biomass: ExternalInoculationModelBiomass
}

export interface ExternalInoculationGridAuthority {
  readonly width: number
  readonly height: number
  readonly mask: readonly number[] | Uint8Array
}

const INTERVENTION_KEYS = new Set([
  'schemaVersion',
  'authority',
  'placement',
  'biomass',
])
const AUTHORITY_KEYS = new Set([
  'schemaVersion',
  'scenarioId',
  'scenarioVersion',
  'parameterSetBinding',
  'lineageDefinitionId',
  'genotypeId',
  'taxonId',
  'taxonContentVersion',
])
const PARAMETER_SET_BINDING_KEYS = new Set([
  'schemaVersion',
  'authority',
  'parameterSetId',
  'parameterSetVersion',
  'configurationFingerprint',
])
const PLACEMENT_KEYS = new Set(['kind', 'x', 'y'])
const BIOMASS_KEYS = new Set(['value', 'unit'])

export function assertExternalInoculationIntervention(
  value: unknown,
): asserts value is ExternalInoculationIntervention {
  const intervention = requireRecord(value, 'external inoculation intervention')
  assertOnlyKeys(
    intervention,
    INTERVENTION_KEYS,
    'external inoculation intervention',
  )
  if (
    intervention.schemaVersion !==
    EXTERNAL_INOCULATION_INTERVENTION_SCHEMA_VERSION
  ) {
    throw new Error('unsupported external inoculation intervention schema version')
  }

  const authority = requireRecord(
    intervention.authority,
    'external inoculation authority',
  )
  assertOnlyKeys(authority, AUTHORITY_KEYS, 'external inoculation authority')
  if (
    authority.schemaVersion !==
    EXTERNAL_INOCULATION_AUTHORITY_REFERENCE_SCHEMA_VERSION
  ) {
    throw new Error('unsupported external inoculation authority reference version')
  }
  canonicalText('external inoculation scenario id', authority.scenarioId)
  canonicalText(
    'external inoculation scenario version',
    authority.scenarioVersion,
  )
  canonicalText(
    'external inoculation lineage definition id',
    authority.lineageDefinitionId,
  )
  canonicalText('external inoculation genotype id', authority.genotypeId)
  canonicalText('external inoculation taxon id', authority.taxonId)
  canonicalText(
    'external inoculation taxon content version',
    authority.taxonContentVersion,
  )

  const parameterSetBinding = requireRecord(
    authority.parameterSetBinding,
    'external inoculation parameter-set binding',
  )
  assertOnlyKeys(
    parameterSetBinding,
    PARAMETER_SET_BINDING_KEYS,
    'external inoculation parameter-set binding',
  )
  assertComposedParameterSetBindingRecord(parameterSetBinding)
  if (parameterSetBinding.authority !== 'provenance') {
    throw new Error(
      'external inoculation requires a provenance parameter-set binding',
    )
  }

  const placement = requireRecord(
    intervention.placement,
    'external inoculation placement',
  )
  assertOnlyKeys(placement, PLACEMENT_KEYS, 'external inoculation placement')
  if (placement.kind !== 'grid-cell') {
    throw new Error('external inoculation placement kind must be grid-cell')
  }
  requireNonNegativeSafeInteger(
    'external inoculation placement.x',
    placement.x,
  )
  requireNonNegativeSafeInteger(
    'external inoculation placement.y',
    placement.y,
  )

  const biomass = requireRecord(
    intervention.biomass,
    'external inoculation biomass',
  )
  assertOnlyKeys(biomass, BIOMASS_KEYS, 'external inoculation biomass')
  if (biomass.unit !== 'model-biomass') {
    throw new Error(
      'external inoculation biomass unit must be model-biomass',
    )
  }
  if (typeof biomass.value !== 'number') {
    throw new Error('external inoculation biomass value must be a number')
  }
  const storedBiomass = requireFiniteNonNegativeFloat32(
    'external inoculation biomass value',
    biomass.value,
  )
  if (storedBiomass <= 0) {
    throw new Error('external inoculation biomass value must be positive')
  }
}

/**
 * Validate one structurally valid inoculation against exact authoritative grid
 * geometry. Renderer/camera geometry is never accepted at this boundary.
 *
 * This function still does not decide whether the referenced organism is
 * supported by the active scenario. The eventual atomic append transaction
 * must resolve that separately and fail closed before mutation.
 */
export function assertExternalInoculationPlacementWithinGrid(
  intervention: unknown,
  grid: ExternalInoculationGridAuthority,
): asserts intervention is ExternalInoculationIntervention {
  assertExternalInoculationIntervention(intervention)
  requirePositiveSafeInteger('external inoculation grid width', grid.width)
  requirePositiveSafeInteger('external inoculation grid height', grid.height)

  const cellCount = grid.width * grid.height
  if (!Number.isSafeInteger(cellCount)) {
    throw new Error('external inoculation grid cell count must be a safe integer')
  }
  if (!Array.isArray(grid.mask) && !(grid.mask instanceof Uint8Array)) {
    throw new Error('external inoculation grid mask must be an array or Uint8Array')
  }
  if (grid.mask.length !== cellCount) {
    throw new Error(
      'external inoculation grid mask length must match width * height',
    )
  }

  for (let index = 0; index < grid.mask.length; index += 1) {
    if (
      Array.isArray(grid.mask) &&
      !Object.prototype.hasOwnProperty.call(grid.mask, index)
    ) {
      throw new Error('external inoculation grid mask must be dense')
    }
    const value = grid.mask[index]
    if (value !== 0 && value !== 1) {
      throw new Error('external inoculation grid mask values must be 0 or 1')
    }
  }

  const { x, y } = intervention.placement
  if (x >= grid.width || y >= grid.height) {
    throw new Error('external inoculation placement must be inside grid bounds')
  }
  const cellIndex = y * grid.width + x
  if (grid.mask[cellIndex] !== 1) {
    throw new Error('external inoculation placement must be inside the dish mask')
  }
}

function canonicalText(name: string, value: unknown): asserts value is string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value !== value.trim()
  ) {
    throw new Error(`${name} must be canonical non-empty text`)
  }
}

function requireNonNegativeSafeInteger(name: string, value: unknown): void {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new Error(`${name} must be a non-negative safe integer`)
  }
}

function requirePositiveSafeInteger(name: string, value: unknown): void {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw new Error(`${name} must be a positive safe integer`)
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
