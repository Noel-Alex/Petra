import type { GrowthParameters } from './growth'

export const ECOLOGY_EXECUTION_PROFILE_SCHEMA_VERSION = 1 as const

export const REQUIRED_ECOLOGY_EXECUTION_TARGETS = [
  'positive-early-growth',
  'resource-depletion',
  'zero-resource-no-growth',
  'capacity-bound',
  'conservative-neighbour-spread',
] as const

export type EcologyExecutionBehaviorTarget =
  (typeof REQUIRED_ECOLOGY_EXECUTION_TARGETS)[number]

export interface EcologyExecutionProfileProvenance {
  readonly classification: 'engineering'
  readonly context: string
  readonly calibrationNote: string
  readonly limitation: string
}

export interface EcologyExecutionProfile {
  readonly schemaVersion: typeof ECOLOGY_EXECUTION_PROFILE_SCHEMA_VERSION
  readonly id: string
  readonly version: string
  readonly scenarioId: string
  readonly scenarioVersion: string
  readonly resourceContextVersion: string
  readonly classification: 'engineering'
  readonly units: {
    readonly time: 'hour'
    readonly resource: 'model-resource'
    readonly biomass: 'model-biomass'
  }
  readonly hoursPerTick: number
  readonly growth: Readonly<GrowthParameters>
  readonly behaviorTargets: readonly EcologyExecutionBehaviorTarget[]
  readonly provenance: EcologyExecutionProfileProvenance
}

export interface EcologyExecutionProjection {
  readonly profileId: string
  readonly profileVersion: string
  readonly profileIdentity: string
  readonly scenarioId: string
  readonly scenarioVersion: string
  readonly resourceContextVersion: string
  readonly hoursPerTick: number
  readonly growth: Readonly<GrowthParameters>
  readonly units: EcologyExecutionProfile['units']
}

const PROFILE_KEYS = new Set([
  'schemaVersion',
  'id',
  'version',
  'scenarioId',
  'scenarioVersion',
  'resourceContextVersion',
  'classification',
  'units',
  'hoursPerTick',
  'growth',
  'behaviorTargets',
  'provenance',
])

const UNIT_KEYS = new Set(['time', 'resource', 'biomass'])
const GROWTH_KEYS = new Set([
  'maxDivisionRate',
  'halfSaturation',
  'biomassYield',
  'localCapacity',
  'spreadRate',
])
const PROVENANCE_KEYS = new Set([
  'classification',
  'context',
  'calibrationNote',
  'limitation',
])
const TARGETS = new Set<string>(REQUIRED_ECOLOGY_EXECUTION_TARGETS)

type UnknownRecord = Record<string, unknown>

function requireRecord(name: string, value: unknown): UnknownRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} must be an object`)
  }
  return value as UnknownRecord
}

function assertOnlyKnownKeys(
  name: string,
  value: UnknownRecord,
  allowed: ReadonlySet<string>,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new Error(`${name} contains unknown field ${JSON.stringify(key)}`)
    }
  }
}

function requireCanonicalText(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${name} must be a non-empty string`)
  }
  if (value !== value.trim()) {
    throw new Error(`${name} must be canonical with no surrounding whitespace`)
  }
  return value
}

function requireFiniteNonNegative(name: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be finite and non-negative`)
  }
  return value
}

function requirePositiveFinite(name: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be positive and finite`)
  }
  return value
}

function parseBehaviorTargets(value: unknown): readonly EcologyExecutionBehaviorTarget[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('executionProfile.behaviorTargets must be a non-empty array')
  }

  const result: EcologyExecutionBehaviorTarget[] = []
  const seen = new Set<string>()
  for (let index = 0; index < value.length; index += 1) {
    if (!(index in value)) {
      throw new Error('executionProfile.behaviorTargets must be dense')
    }
    const target = requireCanonicalText(
      `executionProfile.behaviorTargets[${index}]`,
      value[index],
    )
    if (!TARGETS.has(target)) {
      throw new Error(
        `executionProfile.behaviorTargets[${index}] is not a supported target`,
      )
    }
    if (seen.has(target)) {
      throw new Error(
        `executionProfile.behaviorTargets contains duplicate target ${JSON.stringify(target)}`,
      )
    }
    seen.add(target)
    result.push(target as EcologyExecutionBehaviorTarget)
  }

  return Object.freeze(result)
}

export function parseEcologyExecutionProfile(
  value: unknown,
): EcologyExecutionProfile {
  const record = requireRecord('executionProfile', value)
  assertOnlyKnownKeys('executionProfile', record, PROFILE_KEYS)

  if (record.schemaVersion !== ECOLOGY_EXECUTION_PROFILE_SCHEMA_VERSION) {
    throw new Error('unsupported ecology execution-profile schema version')
  }
  if (record.classification !== 'engineering') {
    throw new Error('executionProfile.classification must be "engineering"')
  }

  const units = requireRecord('executionProfile.units', record.units)
  assertOnlyKnownKeys('executionProfile.units', units, UNIT_KEYS)
  if (
    units.time !== 'hour' ||
    units.resource !== 'model-resource' ||
    units.biomass !== 'model-biomass'
  ) {
    throw new Error(
      'executionProfile units must remain hour/model-resource/model-biomass',
    )
  }

  const growthRecord = requireRecord('executionProfile.growth', record.growth)
  assertOnlyKnownKeys('executionProfile.growth', growthRecord, GROWTH_KEYS)
  const growth: GrowthParameters = {
    maxDivisionRate: requireFiniteNonNegative(
      'executionProfile.growth.maxDivisionRate',
      growthRecord.maxDivisionRate,
    ),
    halfSaturation: requirePositiveFinite(
      'executionProfile.growth.halfSaturation',
      growthRecord.halfSaturation,
    ),
    biomassYield: requirePositiveFinite(
      'executionProfile.growth.biomassYield',
      growthRecord.biomassYield,
    ),
    localCapacity: requirePositiveFinite(
      'executionProfile.growth.localCapacity',
      growthRecord.localCapacity,
    ),
    spreadRate: requireFiniteNonNegative(
      'executionProfile.growth.spreadRate',
      growthRecord.spreadRate,
    ),
  }

  const hoursPerTick = requirePositiveFinite(
    'executionProfile.hoursPerTick',
    record.hoursPerTick,
  )
  if (growth.spreadRate * hoursPerTick > 0.25) {
    throw new Error(
      'executionProfile spreadRate * hoursPerTick must be <= 0.25',
    )
  }

  const provenance = requireRecord(
    'executionProfile.provenance',
    record.provenance,
  )
  assertOnlyKnownKeys(
    'executionProfile.provenance',
    provenance,
    PROVENANCE_KEYS,
  )
  if (provenance.classification !== 'engineering') {
    throw new Error(
      'executionProfile.provenance.classification must be "engineering"',
    )
  }

  const parsed: EcologyExecutionProfile = {
    schemaVersion: ECOLOGY_EXECUTION_PROFILE_SCHEMA_VERSION,
    id: requireCanonicalText('executionProfile.id', record.id),
    version: requireCanonicalText('executionProfile.version', record.version),
    scenarioId: requireCanonicalText(
      'executionProfile.scenarioId',
      record.scenarioId,
    ),
    scenarioVersion: requireCanonicalText(
      'executionProfile.scenarioVersion',
      record.scenarioVersion,
    ),
    resourceContextVersion: requireCanonicalText(
      'executionProfile.resourceContextVersion',
      record.resourceContextVersion,
    ),
    classification: 'engineering',
    units: Object.freeze({
      time: 'hour',
      resource: 'model-resource',
      biomass: 'model-biomass',
    }),
    hoursPerTick,
    growth: Object.freeze(growth),
    behaviorTargets: parseBehaviorTargets(record.behaviorTargets),
    provenance: Object.freeze({
      classification: 'engineering',
      context: requireCanonicalText(
        'executionProfile.provenance.context',
        provenance.context,
      ),
      calibrationNote: requireCanonicalText(
        'executionProfile.provenance.calibrationNote',
        provenance.calibrationNote,
      ),
      limitation: requireCanonicalText(
        'executionProfile.provenance.limitation',
        provenance.limitation,
      ),
    }),
  }

  return Object.freeze(parsed)
}

export function ecologyExecutionProfileIdentity(
  profile: EcologyExecutionProfile,
): string {
  const parsed = parseEcologyExecutionProfile(profile)
  return JSON.stringify({
    schemaVersion: parsed.schemaVersion,
    id: parsed.id,
    version: parsed.version,
    scenarioId: parsed.scenarioId,
    scenarioVersion: parsed.scenarioVersion,
    resourceContextVersion: parsed.resourceContextVersion,
    classification: parsed.classification,
    units: {
      time: parsed.units.time,
      resource: parsed.units.resource,
      biomass: parsed.units.biomass,
    },
    hoursPerTick: parsed.hoursPerTick,
    growth: {
      maxDivisionRate: parsed.growth.maxDivisionRate,
      halfSaturation: parsed.growth.halfSaturation,
      biomassYield: parsed.growth.biomassYield,
      localCapacity: parsed.growth.localCapacity,
      spreadRate: parsed.growth.spreadRate,
    },
    behaviorTargets: [...parsed.behaviorTargets],
    provenance: {
      classification: parsed.provenance.classification,
      context: parsed.provenance.context,
      calibrationNote: parsed.provenance.calibrationNote,
      limitation: parsed.provenance.limitation,
    },
  })
}

export function projectEcologyExecutionProfile(
  value: unknown,
): EcologyExecutionProjection {
  const profile = parseEcologyExecutionProfile(value)
  return Object.freeze({
    profileId: profile.id,
    profileVersion: profile.version,
    profileIdentity: ecologyExecutionProfileIdentity(profile),
    scenarioId: profile.scenarioId,
    scenarioVersion: profile.scenarioVersion,
    resourceContextVersion: profile.resourceContextVersion,
    hoursPerTick: profile.hoursPerTick,
    growth: Object.freeze({ ...profile.growth }),
    units: Object.freeze({ ...profile.units }),
  })
}
