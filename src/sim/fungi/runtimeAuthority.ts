import {
  ASPERGILLUS_NO10_SOURCE_PACK_ID,
  ASPERGILLUS_NO10_TAXON_CONTENT_VERSION,
  ASPERGILLUS_NO10_TAXON_ID,
  aspergillusNo10SurfaceTreatment,
  createAspergillusNo10SurfaceCheckpoint,
  observeAspergillusNo10SurfaceCheckpoint,
  restoreAspergillusNo10SurfaceCheckpoint,
  validateAspergillusNo10SurfaceCheckpoint,
  type AspergillusNo10SurfaceCheckpoint,
  type AspergillusNo10SurfaceObservation,
  type AspergillusNo10SupportedGlucoseGPerL,
} from './aspergillusNo10Surface'

export const FUNGAL_RUNTIME_AUTHORITY_SCHEMA_VERSION = 1 as const
export const FUNGAL_RUNTIME_AUTHORITY_STATE_SCHEMA_VERSION = 1 as const
export const FUNGAL_RUNTIME_MECHANISM_OBSERVATION_SCHEMA_VERSION = 1 as const

export const ASPERGILLUS_NO10_SURFACE_RUNTIME_MECHANISM_ID =
  'aspergillus-no10-source-validation-surface-front-v1' as const

/**
 * Replay-critical identity for the currently supported fungal runtime mechanism.
 *
 * This is deliberately narrower than a general fungal engine. It names one
 * exact source-validation mechanism and one exact source treatment. It does not
 * authorize mutable glucose/resource coupling, biomass, branch topology,
 * antimicrobial response, or bacteria-fungus interactions.
 */
export interface AspergillusNo10SurfaceRuntimeAuthority {
  readonly schemaVersion: typeof FUNGAL_RUNTIME_AUTHORITY_SCHEMA_VERSION
  readonly mechanismId: typeof ASPERGILLUS_NO10_SURFACE_RUNTIME_MECHANISM_ID
  readonly sourcePackId: typeof ASPERGILLUS_NO10_SOURCE_PACK_ID
  readonly taxonId: typeof ASPERGILLUS_NO10_TAXON_ID
  readonly taxonContentVersion: typeof ASPERGILLUS_NO10_TAXON_CONTENT_VERSION
  readonly treatmentId: string
  readonly glucoseGPerL: AspergillusNo10SupportedGlucoseGPerL
}

export type FungalRuntimeAuthority = AspergillusNo10SurfaceRuntimeAuthority

/**
 * Mechanism-owned checkpoint wrapper prepared for future composed-runtime
 * admission. The nested source checkpoint retains its physical units and exact
 * validation law; it is never coerced into bacterial model-resource or
 * model-biomass channels.
 */
export interface FungalRuntimeAuthorityState {
  readonly schemaVersion: typeof FUNGAL_RUNTIME_AUTHORITY_STATE_SCHEMA_VERSION
  readonly authorityIdentity: string
  readonly checkpoint: AspergillusNo10SurfaceCheckpoint
}

/**
 * Detached mechanism observation. A future composed-runtime transaction must
 * bind this record to the exact accepted run/branch/checkpoint position before
 * it can become live heterogeneous render authority.
 */
export interface FungalRuntimeMechanismObservation {
  readonly schemaVersion:
    typeof FUNGAL_RUNTIME_MECHANISM_OBSERVATION_SCHEMA_VERSION
  readonly authorityIdentity: string
  readonly mechanismId: typeof ASPERGILLUS_NO10_SURFACE_RUNTIME_MECHANISM_ID
  readonly observation: AspergillusNo10SurfaceObservation
}

const AUTHORITY_KEYS = new Set([
  'schemaVersion',
  'mechanismId',
  'sourcePackId',
  'taxonId',
  'taxonContentVersion',
  'treatmentId',
  'glucoseGPerL',
])

const STATE_KEYS = new Set([
  'schemaVersion',
  'authorityIdentity',
  'checkpoint',
])

export function createAspergillusNo10SurfaceRuntimeAuthority(
  glucoseGPerL: number,
): AspergillusNo10SurfaceRuntimeAuthority {
  const treatment = aspergillusNo10SurfaceTreatment(glucoseGPerL)
  return Object.freeze({
    schemaVersion: FUNGAL_RUNTIME_AUTHORITY_SCHEMA_VERSION,
    mechanismId: ASPERGILLUS_NO10_SURFACE_RUNTIME_MECHANISM_ID,
    sourcePackId: ASPERGILLUS_NO10_SOURCE_PACK_ID,
    taxonId: ASPERGILLUS_NO10_TAXON_ID,
    taxonContentVersion: ASPERGILLUS_NO10_TAXON_CONTENT_VERSION,
    treatmentId: treatment.treatmentId,
    glucoseGPerL: treatment.glucoseGPerL,
  })
}

export function assertFungalRuntimeAuthority(
  value: unknown,
): asserts value is FungalRuntimeAuthority {
  const authority = requireRecord('fungal runtime authority', value)
  assertOnlyKeys(authority, AUTHORITY_KEYS, 'fungal runtime authority')

  if (authority.schemaVersion !== FUNGAL_RUNTIME_AUTHORITY_SCHEMA_VERSION) {
    throw new Error('unsupported fungal runtime authority schema version')
  }
  if (authority.mechanismId !== ASPERGILLUS_NO10_SURFACE_RUNTIME_MECHANISM_ID) {
    throw new Error('unsupported fungal runtime mechanism')
  }
  if (
    authority.sourcePackId !== ASPERGILLUS_NO10_SOURCE_PACK_ID ||
    authority.taxonId !== ASPERGILLUS_NO10_TAXON_ID ||
    authority.taxonContentVersion !== ASPERGILLUS_NO10_TAXON_CONTENT_VERSION
  ) {
    throw new Error('fungal runtime authority biological identity mismatch')
  }
  if (typeof authority.glucoseGPerL !== 'number') {
    throw new Error('fungal runtime authority glucose treatment must be numeric')
  }

  const expected = createAspergillusNo10SurfaceRuntimeAuthority(
    authority.glucoseGPerL,
  )
  if (authority.treatmentId !== expected.treatmentId) {
    throw new Error('fungal runtime authority treatment identity mismatch')
  }
}

/**
 * Canonical replay/config identity for optional fungal runtime authority.
 *
 * Null means the mechanism is absent and is intentionally identity-distinct
 * from any enabled source-validation treatment.
 */
export function fungalRuntimeAuthorityIdentity(
  authority: FungalRuntimeAuthority | null,
): string | null {
  if (authority === null) return null
  assertFungalRuntimeAuthority(authority)
  return JSON.stringify({
    schemaVersion: authority.schemaVersion,
    mechanismId: authority.mechanismId,
    sourcePackId: authority.sourcePackId,
    taxonId: authority.taxonId,
    taxonContentVersion: authority.taxonContentVersion,
    treatmentId: authority.treatmentId,
    glucoseGPerL: authority.glucoseGPerL,
  })
}

/**
 * Prepare the exact mechanism checkpoint without attaching it to composed
 * execution. Phase-A callers may persist/validate this authority, but executable
 * composed stepping remains a separate gate.
 */
export function createFungalRuntimeAuthorityState(
  authority: FungalRuntimeAuthority,
): FungalRuntimeAuthorityState {
  assertFungalRuntimeAuthority(authority)
  const checkpoint = createAspergillusNo10SurfaceCheckpoint(
    authority.glucoseGPerL,
  )
  const state = {
    schemaVersion: FUNGAL_RUNTIME_AUTHORITY_STATE_SCHEMA_VERSION,
    authorityIdentity: fungalRuntimeAuthorityIdentity(authority)!,
    checkpoint,
  } satisfies FungalRuntimeAuthorityState
  validateFungalRuntimeAuthorityState(state, authority)
  return freezeState(state)
}

export function validateFungalRuntimeAuthorityState(
  value: unknown,
  authority: FungalRuntimeAuthority,
): asserts value is FungalRuntimeAuthorityState {
  assertFungalRuntimeAuthority(authority)
  const state = requireRecord('fungal runtime authority state', value)
  assertOnlyKeys(state, STATE_KEYS, 'fungal runtime authority state')

  if (
    state.schemaVersion !== FUNGAL_RUNTIME_AUTHORITY_STATE_SCHEMA_VERSION
  ) {
    throw new Error('unsupported fungal runtime authority state schema version')
  }

  const expectedIdentity = fungalRuntimeAuthorityIdentity(authority)!
  if (state.authorityIdentity !== expectedIdentity) {
    throw new Error('fungal runtime authority state identity mismatch')
  }

  const checkpoint = state.checkpoint as AspergillusNo10SurfaceCheckpoint
  validateAspergillusNo10SurfaceCheckpoint(checkpoint)
  if (
    checkpoint.sourcePackId !== authority.sourcePackId ||
    checkpoint.taxonId !== authority.taxonId ||
    checkpoint.taxonContentVersion !== authority.taxonContentVersion ||
    checkpoint.treatmentId !== authority.treatmentId ||
    checkpoint.glucoseGPerL !== authority.glucoseGPerL
  ) {
    throw new Error(
      'fungal runtime checkpoint does not match configured authority',
    )
  }
}

export function cloneFungalRuntimeAuthorityState(
  state: FungalRuntimeAuthorityState,
  authority: FungalRuntimeAuthority,
): FungalRuntimeAuthorityState {
  validateFungalRuntimeAuthorityState(state, authority)
  return freezeState({
    schemaVersion: FUNGAL_RUNTIME_AUTHORITY_STATE_SCHEMA_VERSION,
    authorityIdentity: state.authorityIdentity,
    checkpoint: restoreAspergillusNo10SurfaceCheckpoint(state.checkpoint),
  })
}

export function observeFungalRuntimeAuthorityState(
  state: FungalRuntimeAuthorityState,
  authority: FungalRuntimeAuthority,
): FungalRuntimeMechanismObservation {
  validateFungalRuntimeAuthorityState(state, authority)
  return Object.freeze({
    schemaVersion: FUNGAL_RUNTIME_MECHANISM_OBSERVATION_SCHEMA_VERSION,
    authorityIdentity: state.authorityIdentity,
    mechanismId: authority.mechanismId,
    observation: observeAspergillusNo10SurfaceCheckpoint(state.checkpoint),
  })
}

function freezeState(
  state: FungalRuntimeAuthorityState,
): FungalRuntimeAuthorityState {
  return Object.freeze({
    schemaVersion: state.schemaVersion,
    authorityIdentity: state.authorityIdentity,
    checkpoint: restoreAspergillusNo10SurfaceCheckpoint(state.checkpoint),
  })
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
  name: string,
  value: unknown,
): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} must be an object`)
  }
  return value as Record<string, unknown>
}
