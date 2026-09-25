import flagshipScenario from '../../data/presets/ecoli_ciprofloxacin_v1.json'

export const FLAGSHIP_CIPROFLOXACIN_CONTROL_SCHEMA_VERSION = 1 as const

export type FlagshipCiprofloxacinControlGeometry =
  | 'global'
  | 'radial'
  | 'stripe'
  | 'paint'

export interface FlagshipCiprofloxacinToolAuthority {
  readonly schemaVersion: typeof FLAGSHIP_CIPROFLOXACIN_CONTROL_SCHEMA_VERSION
  readonly tool: 'antibiotic'
  readonly protocolCommand: 'apply-ciprofloxacin'
  readonly parameter: {
    readonly key: string
    readonly label: string
    readonly unit: 'mg/L'
    readonly minimum: number
    readonly maximum: number
    readonly defaultValue: number
    readonly precision: number
  }
  readonly supportedGeometries: readonly FlagshipCiprofloxacinControlGeometry[]
  readonly blendMode: 'set' | 'add'
}

export interface FlagshipCiprofloxacinControlProvenance {
  readonly classification: 'transferred'
  readonly citation: 'regoes_2004'
  readonly context: string
  readonly sourceTestedRangeMgPerL: {
    readonly minimum: number
    readonly maximum: number
  }
  readonly defaultClassification: 'engineering'
  readonly defaultRationale: string
  readonly transferNote: string
  readonly limitation: string
}

export interface FlagshipCiprofloxacinControlProjection {
  readonly toolAuthority: FlagshipCiprofloxacinToolAuthority
  readonly provenance: FlagshipCiprofloxacinControlProvenance
}

type UnknownRecord = Record<string, unknown>

const TOP_LEVEL_KEYS = new Set([
  'schemaVersion',
  'tool',
  'protocolCommand',
  'parameter',
  'supportedGeometries',
  'blendMode',
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
  'citation',
  'context',
  'sourceTestedRangeMgPerL',
  'defaultClassification',
  'defaultRationale',
  'transferNote',
  'limitation',
])

const SOURCE_RANGE_KEYS = new Set(['minimum', 'maximum'])

const GEOMETRIES = new Set<FlagshipCiprofloxacinControlGeometry>([
  'global',
  'radial',
  'stripe',
  'paint',
])

export function projectFlagshipCiprofloxacinControl(
  value: unknown,
): FlagshipCiprofloxacinControlProjection {
  const record = requireRecord('flagship ciprofloxacin intervention control', value)
  assertOnlyKnownKeys(
    'flagship ciprofloxacin intervention control',
    record,
    TOP_LEVEL_KEYS,
  )

  if (record.schemaVersion !== FLAGSHIP_CIPROFLOXACIN_CONTROL_SCHEMA_VERSION) {
    throw new Error(
      'unsupported flagship ciprofloxacin intervention-control schema version',
    )
  }
  if (record.tool !== 'antibiotic') {
    throw new Error('flagship ciprofloxacin intervention control must target antibiotic')
  }
  if (record.protocolCommand !== 'apply-ciprofloxacin') {
    throw new Error(
      'flagship ciprofloxacin intervention control must bind apply-ciprofloxacin',
    )
  }

  const parameter = requireRecord(
    'flagship ciprofloxacin intervention control parameter',
    record.parameter,
  )
  assertOnlyKnownKeys(
    'flagship ciprofloxacin intervention control parameter',
    parameter,
    PARAMETER_KEYS,
  )

  const minimum = requireFiniteNonNegative(
    'flagship ciprofloxacin intervention control parameter minimum',
    parameter.minimum,
  )
  const maximum = requireFiniteNonNegative(
    'flagship ciprofloxacin intervention control parameter maximum',
    parameter.maximum,
  )
  if (minimum > maximum) {
    throw new RangeError(
      'flagship ciprofloxacin intervention control minimum cannot exceed maximum',
    )
  }
  const defaultValue = requireFiniteNonNegative(
    'flagship ciprofloxacin intervention control parameter default',
    parameter.defaultValue,
  )
  if (defaultValue < minimum || defaultValue > maximum) {
    throw new RangeError(
      'flagship ciprofloxacin intervention control default must lie within bounds',
    )
  }
  if (
    typeof parameter.precision !== 'number' ||
    !Number.isSafeInteger(parameter.precision) ||
    parameter.precision < 0 ||
    parameter.precision > 6
  ) {
    throw new RangeError(
      'flagship ciprofloxacin intervention control precision must be an integer from 0 to 6',
    )
  }
  if (parameter.unit !== 'mg/L') {
    throw new Error(
      'flagship ciprofloxacin intervention control parameter unit must be mg/L',
    )
  }

  if (!Array.isArray(record.supportedGeometries) || record.supportedGeometries.length === 0) {
    throw new Error(
      'flagship ciprofloxacin intervention control must declare supported geometries',
    )
  }
  const seen = new Set<FlagshipCiprofloxacinControlGeometry>()
  const supportedGeometries = record.supportedGeometries.map((value, index) => {
    if (
      typeof value !== 'string' ||
      !GEOMETRIES.has(value as FlagshipCiprofloxacinControlGeometry)
    ) {
      throw new Error(
        `flagship ciprofloxacin intervention control supportedGeometries[${index}] is unsupported`,
      )
    }
    const geometry = value as FlagshipCiprofloxacinControlGeometry
    if (seen.has(geometry)) {
      throw new Error(
        `duplicate flagship ciprofloxacin intervention control geometry: ${geometry}`,
      )
    }
    seen.add(geometry)
    return geometry
  })

  if (record.blendMode !== 'set' && record.blendMode !== 'add') {
    throw new Error(
      'flagship ciprofloxacin intervention control blend mode must be set or add',
    )
  }

  const provenance = requireRecord(
    'flagship ciprofloxacin intervention control provenance',
    record.provenance,
  )
  assertOnlyKnownKeys(
    'flagship ciprofloxacin intervention control provenance',
    provenance,
    PROVENANCE_KEYS,
  )
  if (provenance.classification !== 'transferred') {
    throw new Error(
      'flagship ciprofloxacin intervention control provenance must be transferred',
    )
  }
  if (provenance.citation !== 'regoes_2004') {
    throw new Error(
      'flagship ciprofloxacin intervention control must cite regoes_2004',
    )
  }
  if (provenance.defaultClassification !== 'engineering') {
    throw new Error(
      'flagship ciprofloxacin intervention control default must be classified as engineering',
    )
  }

  const sourceRange = requireRecord(
    'flagship ciprofloxacin intervention control provenance source range',
    provenance.sourceTestedRangeMgPerL,
  )
  assertOnlyKnownKeys(
    'flagship ciprofloxacin intervention control provenance source range',
    sourceRange,
    SOURCE_RANGE_KEYS,
  )
  const sourceMinimum = requireFiniteNonNegative(
    'flagship ciprofloxacin intervention control provenance source range minimum',
    sourceRange.minimum,
  )
  const sourceMaximum = requireFiniteNonNegative(
    'flagship ciprofloxacin intervention control provenance source range maximum',
    sourceRange.maximum,
  )
  if (sourceMinimum > sourceMaximum) {
    throw new RangeError(
      'flagship ciprofloxacin intervention control source range minimum cannot exceed maximum',
    )
  }
  if (sourceMinimum !== minimum || sourceMaximum !== maximum) {
    throw new Error(
      'flagship ciprofloxacin intervention control bounds must exactly match the declared source-tested range',
    )
  }

  return Object.freeze({
    toolAuthority: Object.freeze({
      schemaVersion: FLAGSHIP_CIPROFLOXACIN_CONTROL_SCHEMA_VERSION,
      tool: 'antibiotic',
      protocolCommand: 'apply-ciprofloxacin',
      parameter: Object.freeze({
        key: requireCanonicalText(
          'flagship ciprofloxacin intervention control parameter key',
          parameter.key,
        ),
        label: requireCanonicalText(
          'flagship ciprofloxacin intervention control parameter label',
          parameter.label,
        ),
        unit: 'mg/L',
        minimum,
        maximum,
        defaultValue,
        precision: parameter.precision,
      }),
      supportedGeometries: Object.freeze(supportedGeometries),
      blendMode: record.blendMode,
    }),
    provenance: Object.freeze({
      classification: 'transferred',
      citation: 'regoes_2004',
      context: requireCanonicalText(
        'flagship ciprofloxacin intervention control provenance context',
        provenance.context,
      ),
      sourceTestedRangeMgPerL: Object.freeze({
        minimum: sourceMinimum,
        maximum: sourceMaximum,
      }),
      defaultClassification: 'engineering',
      defaultRationale: requireCanonicalText(
        'flagship ciprofloxacin intervention control provenance default rationale',
        provenance.defaultRationale,
      ),
      transferNote: requireCanonicalText(
        'flagship ciprofloxacin intervention control provenance transfer note',
        provenance.transferNote,
      ),
      limitation: requireCanonicalText(
        'flagship ciprofloxacin intervention control provenance limitation',
        provenance.limitation,
      ),
    }),
  })
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

function requireFiniteNonNegative(name: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be finite and non-negative`)
  }
  return value
}


/**
 * Resolve the bundled flagship's scenario-owned product control authority.
 * This is a presentation/command guardrail only; it does not change composed
 * biology, checkpoint state, or the protocol command vocabulary.
 */
export function projectBundledFlagshipCiprofloxacinControl(): FlagshipCiprofloxacinControlProjection {
  const scenario = requireRecord('flagship scenario', flagshipScenario)
  const drug = requireRecord('flagship scenario drug', scenario.drug)
  return projectFlagshipCiprofloxacinControl(drug.interventionControl)
}
