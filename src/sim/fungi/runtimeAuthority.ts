import {
  ASPERGILLUS_NO10_SOURCE_PACK_ID,
  ASPERGILLUS_NO10_TAXON_CONTENT_VERSION,
  ASPERGILLUS_NO10_TAXON_ID,
  type AspergillusNo10SurfaceCheckpoint,
  type AspergillusNo10SupportedGlucoseGPerL,
  aspergillusNo10SurfaceTreatment,
  createAspergillusNo10SurfaceCheckpoint,
  restoreAspergillusNo10SurfaceCheckpoint,
  validateAspergillusNo10SurfaceCheckpoint,
} from './aspergillusNo10Surface'

export const FUNGAL_RUNTIME_AUTHORITY_SCHEMA_VERSION = 1 as const
export const FUNGAL_RUNTIME_CHECKPOINT_SCHEMA_VERSION = 1 as const

export const ASPERGILLUS_NO10_SURFACE_RUNTIME_MODEL_ID =
  'aspergillus-no10-surface-front-source-validation' as const
export const ASPERGILLUS_NO10_SURFACE_RUNTIME_MODEL_VERSION = '1' as const

export type FungalRuntimeAuthorityMode =
  | 'disabled'
  | 'aspergillus-no10-surface-source-validation'

export interface DisabledFungalRuntimeAuthorityConfig {
  readonly schemaVersion: typeof FUNGAL_RUNTIME_AUTHORITY_SCHEMA_VERSION
  readonly mode: 'disabled'
}

export interface AspergillusNo10SurfaceRuntimeAuthorityConfig {
  readonly schemaVersion: typeof FUNGAL_RUNTIME_AUTHORITY_SCHEMA_VERSION
  readonly mode: 'aspergillus-no10-surface-source-validation'
  readonly modelId: typeof ASPERGILLUS_NO10_SURFACE_RUNTIME_MODEL_ID
  readonly modelVersion: typeof ASPERGILLUS_NO10_SURFACE_RUNTIME_MODEL_VERSION
  readonly sourcePackId: typeof ASPERGILLUS_NO10_SOURCE_PACK_ID
  readonly taxonId: typeof ASPERGILLUS_NO10_TAXON_ID
  readonly taxonContentVersion: typeof ASPERGILLUS_NO10_TAXON_CONTENT_VERSION
  readonly treatmentId: string
  readonly glucoseGPerL: AspergillusNo10SupportedGlucoseGPerL
  readonly biologicalTimeUnit: 'h'
  readonly colonyRadiusUnit: 'um'
  readonly plateDiameterUnit: 'cm'
  readonly glucoseTreatmentUnit: 'g/L'
  readonly glucoseSemantics: 'fixed-source-treatment-identity'
}

export type FungalRuntimeAuthorityConfig =
  | DisabledFungalRuntimeAuthorityConfig
  | AspergillusNo10SurfaceRuntimeAuthorityConfig

export interface AspergillusNo10SurfaceRuntimeState {
  readonly modelId: typeof ASPERGILLUS_NO10_SURFACE_RUNTIME_MODEL_ID
  readonly modelVersion: typeof ASPERGILLUS_NO10_SURFACE_RUNTIME_MODEL_VERSION
  readonly checkpoint: AspergillusNo10SurfaceCheckpoint
}

export interface FungalRuntimeAuthorityCheckpoint {
  readonly schemaVersion: typeof FUNGAL_RUNTIME_CHECKPOINT_SCHEMA_VERSION
  readonly authority: 'fungal-runtime-envelope'
  readonly configurationIdentity: string
  readonly state: AspergillusNo10SurfaceRuntimeState | null
}

const DISABLED_CONFIG_KEYS = new Set(['schemaVersion', 'mode'])
const ASPERGILLUS_CONFIG_KEYS = new Set([
  'schemaVersion',
  'mode',
  'modelId',
  'modelVersion',
  'sourcePackId',
  'taxonId',
  'taxonContentVersion',
  'treatmentId',
  'glucoseGPerL',
  'biologicalTimeUnit',
  'colonyRadiusUnit',
  'plateDiameterUnit',
  'glucoseTreatmentUnit',
  'glucoseSemantics',
])
const RUNTIME_CHECKPOINT_KEYS = new Set([
  'schemaVersion',
  'authority',
  'configurationIdentity',
  'state',
])
const RUNTIME_STATE_KEYS = new Set(['modelId', 'modelVersion', 'checkpoint'])
const SURFACE_CHECKPOINT_KEYS = new Set([
  'schemaVersion',
  'authority',
  'sourcePackId',
  'taxonId',
  'taxonContentVersion',
  'treatmentId',
  'glucoseGPerL',
  'inoculationContext',
  'plateDiameterCm',
  'founderPositionCm',
  'biologicalTimeHours',
  'colonyRadiusUm',
  'frontAtDishBoundary',
])
const FOUNDER_POSITION_KEYS = new Set(['x', 'y'])

export function disabledFungalRuntimeAuthorityConfig(): DisabledFungalRuntimeAuthorityConfig {
  return Object.freeze({
    schemaVersion: FUNGAL_RUNTIME_AUTHORITY_SCHEMA_VERSION,
    mode: 'disabled',
  })
}

export function aspergillusNo10SurfaceRuntimeAuthorityConfig(
  glucoseGPerL: number,
): AspergillusNo10SurfaceRuntimeAuthorityConfig {
  const treatment = aspergillusNo10SurfaceTreatment(glucoseGPerL)
  return Object.freeze({
    schemaVersion: FUNGAL_RUNTIME_AUTHORITY_SCHEMA_VERSION,
    mode: 'aspergillus-no10-surface-source-validation',
    modelId: ASPERGILLUS_NO10_SURFACE_RUNTIME_MODEL_ID,
    modelVersion: ASPERGILLUS_NO10_SURFACE_RUNTIME_MODEL_VERSION,
    sourcePackId: ASPERGILLUS_NO10_SOURCE_PACK_ID,
    taxonId: ASPERGILLUS_NO10_TAXON_ID,
    taxonContentVersion: ASPERGILLUS_NO10_TAXON_CONTENT_VERSION,
    treatmentId: treatment.treatmentId,
    glucoseGPerL: treatment.glucoseGPerL,
    biologicalTimeUnit: 'h',
    colonyRadiusUnit: 'um',
    plateDiameterUnit: 'cm',
    glucoseTreatmentUnit: 'g/L',
    glucoseSemantics: 'fixed-source-treatment-identity',
  })
}

export function parseFungalRuntimeAuthorityConfig(
  value: unknown,
): FungalRuntimeAuthorityConfig {
  const record = requireRecord('fungal runtime authority config', value)
  if (record.schemaVersion !== FUNGAL_RUNTIME_AUTHORITY_SCHEMA_VERSION) {
    throw new Error('unsupported fungal runtime authority config version')
  }

  if (record.mode === 'disabled') {
    assertOnlyKnownKeys(
      'disabled fungal runtime authority config',
      record,
      DISABLED_CONFIG_KEYS,
    )
    return disabledFungalRuntimeAuthorityConfig()
  }

  if (record.mode !== 'aspergillus-no10-surface-source-validation') {
    throw new Error('unsupported fungal runtime authority mode')
  }
  assertOnlyKnownKeys(
    'Aspergillus fungal runtime authority config',
    record,
    ASPERGILLUS_CONFIG_KEYS,
  )

  if (
    record.modelId !== ASPERGILLUS_NO10_SURFACE_RUNTIME_MODEL_ID ||
    record.modelVersion !== ASPERGILLUS_NO10_SURFACE_RUNTIME_MODEL_VERSION ||
    record.sourcePackId !== ASPERGILLUS_NO10_SOURCE_PACK_ID ||
    record.taxonId !== ASPERGILLUS_NO10_TAXON_ID ||
    record.taxonContentVersion !== ASPERGILLUS_NO10_TAXON_CONTENT_VERSION
  ) {
    throw new Error('fungal runtime authority biological/model identity mismatch')
  }
  if (
    record.biologicalTimeUnit !== 'h' ||
    record.colonyRadiusUnit !== 'um' ||
    record.plateDiameterUnit !== 'cm' ||
    record.glucoseTreatmentUnit !== 'g/L' ||
    record.glucoseSemantics !== 'fixed-source-treatment-identity'
  ) {
    throw new Error('fungal runtime authority unit/meaning contract mismatch')
  }
  if (typeof record.glucoseGPerL !== 'number') {
    throw new Error('fungal runtime authority glucose treatment must be numeric')
  }

  const canonical = aspergillusNo10SurfaceRuntimeAuthorityConfig(
    record.glucoseGPerL,
  )
  if (record.treatmentId !== canonical.treatmentId) {
    throw new Error('fungal runtime authority treatment identity mismatch')
  }
  return canonical
}

/**
 * Canonical replay/configuration identity for the optional fungal runtime
 * mechanism. This string is designed to join composed configuration identity
 * later; creating it does not itself make the fungal state part of a composed
 * Worker transaction.
 */
export function fungalRuntimeAuthorityConfigurationIdentity(
  value: FungalRuntimeAuthorityConfig,
): string {
  const config = parseFungalRuntimeAuthorityConfig(value)
  if (config.mode === 'disabled') {
    return JSON.stringify({
      schemaVersion: config.schemaVersion,
      mode: config.mode,
    })
  }
  return JSON.stringify({
    schemaVersion: config.schemaVersion,
    mode: config.mode,
    modelId: config.modelId,
    modelVersion: config.modelVersion,
    sourcePackId: config.sourcePackId,
    taxonId: config.taxonId,
    taxonContentVersion: config.taxonContentVersion,
    treatmentId: config.treatmentId,
    glucoseGPerL: config.glucoseGPerL,
    biologicalTimeUnit: config.biologicalTimeUnit,
    colonyRadiusUnit: config.colonyRadiusUnit,
    plateDiameterUnit: config.plateDiameterUnit,
    glucoseTreatmentUnit: config.glucoseTreatmentUnit,
    glucoseSemantics: config.glucoseSemantics,
  })
}

export function initializeFungalRuntimeAuthorityCheckpoint(
  configValue: FungalRuntimeAuthorityConfig,
): FungalRuntimeAuthorityCheckpoint {
  const config = parseFungalRuntimeAuthorityConfig(configValue)
  return checkpointFungalRuntimeAuthorityState(
    config,
    config.mode === 'disabled'
      ? null
      : createAspergillusNo10SurfaceCheckpoint(config.glucoseGPerL),
  )
}

/**
 * Wrap a mechanism-owned fungal checkpoint without stepping it. Later composed
 * integration may call this only after the candidate mechanism state is
 * accepted as part of the same simulation transaction.
 */
export function checkpointFungalRuntimeAuthorityState(
  configValue: FungalRuntimeAuthorityConfig,
  state: AspergillusNo10SurfaceCheckpoint | null,
): FungalRuntimeAuthorityCheckpoint {
  const config = parseFungalRuntimeAuthorityConfig(configValue)
  const configurationIdentity =
    fungalRuntimeAuthorityConfigurationIdentity(config)

  if (config.mode === 'disabled') {
    if (state !== null) {
      throw new Error('disabled fungal runtime authority cannot carry state')
    }
    return Object.freeze({
      schemaVersion: FUNGAL_RUNTIME_CHECKPOINT_SCHEMA_VERSION,
      authority: 'fungal-runtime-envelope',
      configurationIdentity,
      state: null,
    })
  }

  if (state === null) {
    throw new Error('enabled fungal runtime authority requires mechanism state')
  }
  assertStrictSurfaceCheckpointShape(state)
  validateAspergillusNo10SurfaceCheckpoint(state)
  assertSurfaceStateMatchesConfig(config, state)
  const restored = restoreAspergillusNo10SurfaceCheckpoint(state)

  return Object.freeze({
    schemaVersion: FUNGAL_RUNTIME_CHECKPOINT_SCHEMA_VERSION,
    authority: 'fungal-runtime-envelope',
    configurationIdentity,
    state: Object.freeze({
      modelId: ASPERGILLUS_NO10_SURFACE_RUNTIME_MODEL_ID,
      modelVersion: ASPERGILLUS_NO10_SURFACE_RUNTIME_MODEL_VERSION,
      checkpoint: restored,
    }),
  })
}

export function restoreFungalRuntimeAuthorityCheckpoint(
  configValue: FungalRuntimeAuthorityConfig,
  value: unknown,
): FungalRuntimeAuthorityCheckpoint {
  const config = parseFungalRuntimeAuthorityConfig(configValue)
  const record = requireRecord('fungal runtime checkpoint', value)
  assertOnlyKnownKeys(
    'fungal runtime checkpoint',
    record,
    RUNTIME_CHECKPOINT_KEYS,
  )
  if (record.schemaVersion !== FUNGAL_RUNTIME_CHECKPOINT_SCHEMA_VERSION) {
    throw new Error('unsupported fungal runtime checkpoint version')
  }
  if (record.authority !== 'fungal-runtime-envelope') {
    throw new Error('fungal runtime checkpoint authority mismatch')
  }

  const expectedIdentity = fungalRuntimeAuthorityConfigurationIdentity(config)
  if (record.configurationIdentity !== expectedIdentity) {
    throw new Error('fungal runtime checkpoint configuration identity mismatch')
  }

  if (config.mode === 'disabled') {
    if (record.state !== null) {
      throw new Error('disabled fungal runtime checkpoint must not carry state')
    }
    return checkpointFungalRuntimeAuthorityState(config, null)
  }

  const stateRecord = requireRecord('fungal runtime checkpoint state', record.state)
  assertOnlyKnownKeys(
    'fungal runtime checkpoint state',
    stateRecord,
    RUNTIME_STATE_KEYS,
  )
  if (
    stateRecord.modelId !== ASPERGILLUS_NO10_SURFACE_RUNTIME_MODEL_ID ||
    stateRecord.modelVersion !== ASPERGILLUS_NO10_SURFACE_RUNTIME_MODEL_VERSION
  ) {
    throw new Error('fungal runtime checkpoint model identity mismatch')
  }

  const checkpointRecord = requireRecord(
    'fungal runtime mechanism checkpoint',
    stateRecord.checkpoint,
  )
  assertStrictSurfaceCheckpointShape(checkpointRecord)
  validateAspergillusNo10SurfaceCheckpoint(
    checkpointRecord as unknown as AspergillusNo10SurfaceCheckpoint,
  )
  return checkpointFungalRuntimeAuthorityState(
    config,
    checkpointRecord as unknown as AspergillusNo10SurfaceCheckpoint,
  )
}

function assertSurfaceStateMatchesConfig(
  config: AspergillusNo10SurfaceRuntimeAuthorityConfig,
  state: AspergillusNo10SurfaceCheckpoint,
): void {
  if (
    state.sourcePackId !== config.sourcePackId ||
    state.taxonId !== config.taxonId ||
    state.taxonContentVersion !== config.taxonContentVersion ||
    state.treatmentId !== config.treatmentId ||
    state.glucoseGPerL !== config.glucoseGPerL
  ) {
    throw new Error('fungal runtime state does not match configured authority')
  }
}

function assertStrictSurfaceCheckpointShape(value: unknown): void {
  const record = requireRecord('fungal surface checkpoint', value)
  assertOnlyKnownKeys(
    'fungal surface checkpoint',
    record,
    SURFACE_CHECKPOINT_KEYS,
  )
  const founderPosition = requireRecord(
    'fungal surface checkpoint founder position',
    record.founderPositionCm,
  )
  assertOnlyKnownKeys(
    'fungal surface checkpoint founder position',
    founderPosition,
    FOUNDER_POSITION_KEYS,
  )
}

function assertOnlyKnownKeys(
  name: string,
  record: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): void {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      throw new Error(`${name} contains unsupported field: ${key}`)
    }
  }
}

function requireRecord(
  name: string,
  value: unknown,
): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} must be an object`)
  }
  return value as Record<string, unknown>
}
