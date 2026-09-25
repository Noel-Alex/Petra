import flagshipScenario from '../../data/presets/ecoli_ciprofloxacin_v1.json'
import {
  MODEL_RESOURCE_UNIT,
  type ModelResourceIntervention,
} from './resourceIntervention'
import { requireFiniteNonNegativeFloat32 } from './spatial/field'

export const MODEL_RESOURCE_CONTROL_SCHEMA_VERSION = 1 as const

export type ModelResourceControlGeometry =
  ModelResourceIntervention['geometry']['kind']
export type ModelResourceControlBlendMode =
  ModelResourceIntervention['blendMode']

export interface ModelResourceToolAuthority {
  readonly schemaVersion: typeof MODEL_RESOURCE_CONTROL_SCHEMA_VERSION
  readonly tool: 'resource'
  readonly protocolCommand: 'apply-model-resource'
  readonly resourceContextVersion: string
  readonly parameter: {
    readonly key: string
    readonly label: string
    readonly unit: typeof MODEL_RESOURCE_UNIT
    readonly minimum: number
    readonly maximum: number
    readonly defaultValue: number
    readonly precision: number
  }
  readonly supportedGeometries: readonly ModelResourceControlGeometry[]
  readonly supportedBlendModes: readonly ModelResourceControlBlendMode[]
}

export interface ModelResourceControlProvenance {
  readonly classification: 'engineering'
  readonly physicalBindingStatus: 'unbound'
  readonly context: string
  readonly limitation: string
}

export interface ModelResourceControlProjection {
  readonly toolAuthority: ModelResourceToolAuthority
  readonly provenance: ModelResourceControlProvenance
}

export type BundledFlagshipModelResourceControlResolution =
  | {
      readonly status: 'available'
      readonly projection: ModelResourceControlProjection
    }
  | {
      readonly status: 'unavailable'
      readonly reason: 'scenario-control-metadata-absent'
      readonly resourceContextVersion: string
      readonly unit: typeof MODEL_RESOURCE_UNIT
      readonly limitation: string
    }

type UnknownRecord = Record<string, unknown>

const CONTROL_KEYS = new Set([
  'schemaVersion',
  'tool',
  'protocolCommand',
  'resourceContextVersion',
  'parameter',
  'supportedGeometries',
  'supportedBlendModes',
  'provenance',
])
const PARAMETER_KEYS = new Set([
  'key',
  'label',
  'unit',
  'minimum',
  'maximum',
  'defaultValue',
  'precision',
])
const PROVENANCE_KEYS = new Set([
  'classification',
  'physicalBindingStatus',
  'context',
  'limitation',
])
const RESOURCE_CONTEXT_KEYS_REQUIRED_FOR_ADMISSION = [
  'version',
  'bindingStatus',
  'representation',
  'concentrationUnit',
  'provenance',
] as const
const RESOURCE_CONTEXT_PROVENANCE_KEYS_REQUIRED_FOR_ADMISSION = [
  'classification',
  'limitation',
] as const
const GEOMETRIES = new Set<ModelResourceControlGeometry>([
  'global',
  'radial',
  'stripe',
  'paint',
])
const BLEND_MODES = new Set<ModelResourceControlBlendMode>(['set', 'add'])

export function projectModelResourceInterventionControl(
  value: unknown,
  expectedResourceContextVersion: string,
): ModelResourceControlProjection {
  const expectedContextVersion = requireCanonicalText(
    'expected model-resource context version',
    expectedResourceContextVersion,
  )
  const record = requireRecord('model-resource intervention control', value)
  assertOnlyKnownKeys('model-resource intervention control', record, CONTROL_KEYS)

  if (record.schemaVersion !== MODEL_RESOURCE_CONTROL_SCHEMA_VERSION) {
    throw new Error('unsupported model-resource intervention-control schema version')
  }
  if (record.tool !== 'resource') {
    throw new Error('model-resource intervention control must target resource')
  }
  if (record.protocolCommand !== 'apply-model-resource') {
    throw new Error(
      'model-resource intervention control must bind apply-model-resource',
    )
  }

  const resourceContextVersion = requireCanonicalText(
    'model-resource intervention control resourceContextVersion',
    record.resourceContextVersion,
  )
  if (resourceContextVersion !== expectedContextVersion) {
    throw new Error(
      'model-resource intervention control resource context version mismatch',
    )
  }

  const parameter = requireRecord(
    'model-resource intervention control parameter',
    record.parameter,
  )
  assertOnlyKnownKeys(
    'model-resource intervention control parameter',
    parameter,
    PARAMETER_KEYS,
  )
  if (parameter.unit !== MODEL_RESOURCE_UNIT) {
    throw new Error(
      'model-resource intervention control parameter unit must be model-resource',
    )
  }

  const minimum = requireFiniteNonNegativeControlValue(
    'model-resource intervention control parameter minimum',
    parameter.minimum,
  )
  const maximum = requireFiniteNonNegativeControlValue(
    'model-resource intervention control parameter maximum',
    parameter.maximum,
  )
  if (minimum > maximum) {
    throw new RangeError(
      'model-resource intervention control minimum cannot exceed maximum',
    )
  }
  const defaultValue = requireFiniteNonNegativeControlValue(
    'model-resource intervention control parameter default',
    parameter.defaultValue,
  )
  if (defaultValue < minimum || defaultValue > maximum) {
    throw new RangeError(
      'model-resource intervention control default must lie within bounds',
    )
  }
  if (
    typeof parameter.precision !== 'number' ||
    !Number.isSafeInteger(parameter.precision) ||
    parameter.precision < 0 ||
    parameter.precision > 6
  ) {
    throw new RangeError(
      'model-resource intervention control precision must be an integer from 0 to 6',
    )
  }

  const supportedGeometries = requireUniqueEnumSubset(
    'model-resource intervention control supportedGeometries',
    record.supportedGeometries,
    GEOMETRIES,
  )
  const supportedBlendModes = requireUniqueEnumSubset(
    'model-resource intervention control supportedBlendModes',
    record.supportedBlendModes,
    BLEND_MODES,
  )

  const provenance = requireRecord(
    'model-resource intervention control provenance',
    record.provenance,
  )
  assertOnlyKnownKeys(
    'model-resource intervention control provenance',
    provenance,
    PROVENANCE_KEYS,
  )
  if (provenance.classification !== 'engineering') {
    throw new Error(
      'model-resource intervention control provenance must be engineering',
    )
  }
  if (provenance.physicalBindingStatus !== 'unbound') {
    throw new Error(
      'model-resource intervention control physical binding status must remain unbound',
    )
  }

  return Object.freeze({
    toolAuthority: Object.freeze({
      schemaVersion: MODEL_RESOURCE_CONTROL_SCHEMA_VERSION,
      tool: 'resource',
      protocolCommand: 'apply-model-resource',
      resourceContextVersion,
      parameter: Object.freeze({
        key: requireCanonicalText(
          'model-resource intervention control parameter key',
          parameter.key,
        ),
        label: requireCanonicalText(
          'model-resource intervention control parameter label',
          parameter.label,
        ),
        unit: MODEL_RESOURCE_UNIT,
        minimum,
        maximum,
        defaultValue,
        precision: parameter.precision,
      }),
      supportedGeometries: Object.freeze(supportedGeometries),
      supportedBlendModes: Object.freeze(supportedBlendModes),
    }),
    provenance: Object.freeze({
      classification: 'engineering',
      physicalBindingStatus: 'unbound',
      context: requireCanonicalText(
        'model-resource intervention control provenance context',
        provenance.context,
      ),
      limitation: requireCanonicalText(
        'model-resource intervention control provenance limitation',
        provenance.limitation,
      ),
    }),
  })
}

/**
 * Resolve only scenario-owned metadata for the bundled flagship resource tool.
 *
 * Missing metadata is an explicit unavailable product state, not permission to
 * derive bounds/defaults from run initialization, ecology coefficients, field
 * extrema, or another intervention. Malformed declared metadata fails closed.
 *
 * This resolver is not runtime capability admission: metadata availability
 * alone must never enable Apply before the protocol/runtime command exists.
 */
export function resolveBundledFlagshipModelResourceControl(): BundledFlagshipModelResourceControlResolution {
  const scenario = requireRecord('flagship scenario', flagshipScenario)
  const environment = requireRecord(
    'flagship scenario environment',
    scenario.environment,
  )
  const resourceContext = requireRecord(
    'flagship scenario resource context',
    environment.resourceContext,
  )
  for (const key of RESOURCE_CONTEXT_KEYS_REQUIRED_FOR_ADMISSION) {
    if (!Object.prototype.hasOwnProperty.call(resourceContext, key)) {
      throw new Error(
        `flagship scenario resource context is missing required field ${JSON.stringify(key)}`,
      )
    }
  }

  const resourceContextVersion = requireCanonicalText(
    'flagship scenario resource context version',
    resourceContext.version,
  )
  if (resourceContext.bindingStatus !== 'unbound') {
    throw new Error(
      'bundled flagship model-resource control resolver requires unbound resource context',
    )
  }
  if (resourceContext.representation !== 'dimensionless_model_resource') {
    throw new Error(
      'bundled flagship resource representation must remain dimensionless_model_resource',
    )
  }
  if (resourceContext.concentrationUnit !== MODEL_RESOURCE_UNIT) {
    throw new Error(
      'bundled flagship resource context unit must remain model-resource',
    )
  }

  const contextProvenance = requireRecord(
    'flagship scenario resource context provenance',
    resourceContext.provenance,
  )
  for (const key of RESOURCE_CONTEXT_PROVENANCE_KEYS_REQUIRED_FOR_ADMISSION) {
    if (!Object.prototype.hasOwnProperty.call(contextProvenance, key)) {
      throw new Error(
        `flagship scenario resource context provenance is missing required field ${JSON.stringify(key)}`,
      )
    }
  }
  if (contextProvenance.classification !== 'engineering') {
    throw new Error(
      'bundled flagship resource context provenance must remain engineering',
    )
  }
  const limitation = requireCanonicalText(
    'flagship scenario resource context limitation',
    contextProvenance.limitation,
  )

  if (!Object.prototype.hasOwnProperty.call(resourceContext, 'interventionControl')) {
    return Object.freeze({
      status: 'unavailable',
      reason: 'scenario-control-metadata-absent',
      resourceContextVersion,
      unit: MODEL_RESOURCE_UNIT,
      limitation,
    })
  }

  return Object.freeze({
    status: 'available',
    projection: projectModelResourceInterventionControl(
      resourceContext.interventionControl,
      resourceContextVersion,
    ),
  })
}

function requireFiniteNonNegativeControlValue(
  name: string,
  value: unknown,
): number {
  if (typeof value !== 'number') {
    throw new RangeError(`${name} must be finite and non-negative`)
  }
  requireFiniteNonNegativeFloat32(name, value)
  return value
}

function requireUniqueEnumSubset<T extends string>(
  name: string,
  value: unknown,
  allowed: ReadonlySet<T>,
): T[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${name} must be a non-empty array`)
  }

  const result: T[] = []
  const seen = new Set<T>()
  for (let index = 0; index < value.length; index += 1) {
    const candidate = value[index]
    if (typeof candidate !== 'string' || !allowed.has(candidate as T)) {
      throw new Error(`${name}[${index}] is unsupported`)
    }
    const typed = candidate as T
    if (seen.has(typed)) {
      throw new Error(`duplicate ${name} value: ${typed}`)
    }
    seen.add(typed)
    result.push(typed)
  }
  return result
}

function requireRecord(name: string, value: unknown): UnknownRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`)
  }
  return value as UnknownRecord
}

function assertOnlyKnownKeys(
  name: string,
  record: UnknownRecord,
  allowed: ReadonlySet<string>,
): void {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      throw new Error(`${name} contains unknown field ${JSON.stringify(key)}`)
    }
  }
}

function requireCanonicalText(name: string, value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value !== value.trim()
  ) {
    throw new Error(`${name} must be a canonical non-empty string`)
  }
  return value
}
