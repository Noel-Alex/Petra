import {
  ASPERGILLUS_NO10_SOURCE_PACK_ID,
  ASPERGILLUS_NO10_TAXON_CONTENT_VERSION,
  ASPERGILLUS_NO10_TAXON_ID,
  aspergillusNo10SurfaceTreatment,
  type AspergillusNo10SupportedGlucoseGPerL,
} from './aspergillusNo10Surface'

export const FUNGAL_RUNTIME_AUTHORITY_SCHEMA_VERSION = 1 as const
export const FUNGAL_RUNTIME_STATE_ENVELOPE_SCHEMA_VERSION = 1 as const

export const ASPERGILLUS_NO10_DORMANT_RUNTIME_MECHANISM_ID =
  'aspergillus-no10-surface-source-validation@1' as const

export interface DisabledFungalRuntimeAuthority {
  readonly schemaVersion: typeof FUNGAL_RUNTIME_AUTHORITY_SCHEMA_VERSION
  readonly mode: 'disabled'
}

export interface DormantAspergillusNo10RuntimeAuthority {
  readonly schemaVersion: typeof FUNGAL_RUNTIME_AUTHORITY_SCHEMA_VERSION
  readonly mode: 'dormant-source-validation'
  readonly mechanismId: typeof ASPERGILLUS_NO10_DORMANT_RUNTIME_MECHANISM_ID
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

export type FungalRuntimeAuthority =
  | DisabledFungalRuntimeAuthority
  | DormantAspergillusNo10RuntimeAuthority

/**
 * Phase-A runtime carrier.
 *
 * v1 deliberately owns no executable fungal mechanism state and no accepted
 * composed-runtime position. A later schema must bind both atomically before a
 * fungal observation can claim shared Worker/checkpoint authority.
 */
export interface FungalRuntimeStateEnvelope {
  readonly schemaVersion: typeof FUNGAL_RUNTIME_STATE_ENVELOPE_SCHEMA_VERSION
  readonly authority: FungalRuntimeAuthority
  readonly acceptedComposedPosition: null
  readonly mechanismState: null
}

function assertExactKeys(
  name: string,
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[],
): void {
  const actual = Object.keys(value).sort()
  const required = [...expected].sort()
  if (
    actual.length !== required.length ||
    actual.some((key, index) => key !== required[index])
  ) {
    throw new Error(
      `${name} keys must be exactly: ${required.join(', ')}`,
    )
  }
}

function requireRecord(
  name: string,
  value: unknown,
): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} must be an object`)
  }
  return value as Readonly<Record<string, unknown>>
}

export function createDisabledFungalRuntimeAuthority(): DisabledFungalRuntimeAuthority {
  return Object.freeze({
    schemaVersion: FUNGAL_RUNTIME_AUTHORITY_SCHEMA_VERSION,
    mode: 'disabled',
  })
}

export function createDormantAspergillusNo10RuntimeAuthority(
  glucoseGPerL: number,
): DormantAspergillusNo10RuntimeAuthority {
  const treatment = aspergillusNo10SurfaceTreatment(glucoseGPerL)
  return Object.freeze({
    schemaVersion: FUNGAL_RUNTIME_AUTHORITY_SCHEMA_VERSION,
    mode: 'dormant-source-validation',
    mechanismId: ASPERGILLUS_NO10_DORMANT_RUNTIME_MECHANISM_ID,
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

export function validateFungalRuntimeAuthority(
  authority: FungalRuntimeAuthority,
): void {
  const record = requireRecord('fungal runtime authority', authority)
  if (record.schemaVersion !== FUNGAL_RUNTIME_AUTHORITY_SCHEMA_VERSION) {
    throw new Error(
      `unsupported fungal runtime authority schema version: ${String(record.schemaVersion)}`,
    )
  }

  if (record.mode === 'disabled') {
    assertExactKeys(
      'disabled fungal runtime authority',
      record,
      ['schemaVersion', 'mode'],
    )
    return
  }

  if (record.mode !== 'dormant-source-validation') {
    throw new Error(
      `unsupported fungal runtime authority mode: ${String(record.mode)}`,
    )
  }
  assertExactKeys(
    'dormant fungal runtime authority',
    record,
    [
      'schemaVersion',
      'mode',
      'mechanismId',
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
    ],
  )

  if (
    record.mechanismId !== ASPERGILLUS_NO10_DORMANT_RUNTIME_MECHANISM_ID ||
    record.sourcePackId !== ASPERGILLUS_NO10_SOURCE_PACK_ID ||
    record.taxonId !== ASPERGILLUS_NO10_TAXON_ID ||
    record.taxonContentVersion !== ASPERGILLUS_NO10_TAXON_CONTENT_VERSION
  ) {
    throw new Error(
      'dormant fungal runtime authority biological/source identity mismatch',
    )
  }

  if (
    record.biologicalTimeUnit !== 'h' ||
    record.colonyRadiusUnit !== 'um' ||
    record.plateDiameterUnit !== 'cm' ||
    record.glucoseTreatmentUnit !== 'g/L' ||
    record.glucoseSemantics !== 'fixed-source-treatment-identity'
  ) {
    throw new Error('dormant fungal runtime unit/meaning contract mismatch')
  }

  if (typeof record.glucoseGPerL !== 'number') {
    throw new Error('dormant fungal runtime glucose treatment must be numeric')
  }
  const treatment = aspergillusNo10SurfaceTreatment(record.glucoseGPerL)
  if (record.treatmentId !== treatment.treatmentId) {
    throw new Error('dormant fungal runtime treatment identity mismatch')
  }
}

export function cloneFungalRuntimeAuthority(
  authority: FungalRuntimeAuthority,
): FungalRuntimeAuthority {
  validateFungalRuntimeAuthority(authority)
  return authority.mode === 'disabled'
    ? createDisabledFungalRuntimeAuthority()
    : createDormantAspergillusNo10RuntimeAuthority(authority.glucoseGPerL)
}

/**
 * Stable, fingerprint-ready identity material for later composed config
 * integration. This is not itself the composed configuration fingerprint.
 */
export function fungalRuntimeAuthorityCanonicalIdentity(
  authority: FungalRuntimeAuthority,
): string {
  validateFungalRuntimeAuthority(authority)
  if (authority.mode === 'disabled') {
    return JSON.stringify({
      schemaVersion: FUNGAL_RUNTIME_AUTHORITY_SCHEMA_VERSION,
      mode: 'disabled',
    })
  }
  return JSON.stringify({
    schemaVersion: FUNGAL_RUNTIME_AUTHORITY_SCHEMA_VERSION,
    mode: authority.mode,
    mechanismId: authority.mechanismId,
    sourcePackId: authority.sourcePackId,
    taxonId: authority.taxonId,
    taxonContentVersion: authority.taxonContentVersion,
    treatmentId: authority.treatmentId,
    glucoseGPerL: authority.glucoseGPerL,
    biologicalTimeUnit: authority.biologicalTimeUnit,
    colonyRadiusUnit: authority.colonyRadiusUnit,
    plateDiameterUnit: authority.plateDiameterUnit,
    glucoseTreatmentUnit: authority.glucoseTreatmentUnit,
    glucoseSemantics: authority.glucoseSemantics,
  })
}

export function createDormantFungalRuntimeStateEnvelope(
  authority: FungalRuntimeAuthority,
): FungalRuntimeStateEnvelope {
  const detached = cloneFungalRuntimeAuthority(authority)
  return Object.freeze({
    schemaVersion: FUNGAL_RUNTIME_STATE_ENVELOPE_SCHEMA_VERSION,
    authority: detached,
    acceptedComposedPosition: null,
    mechanismState: null,
  })
}

export function validateFungalRuntimeStateEnvelope(
  envelope: FungalRuntimeStateEnvelope,
): void {
  const record = requireRecord('fungal runtime state envelope', envelope)
  assertExactKeys(
    'fungal runtime state envelope',
    record,
    [
      'schemaVersion',
      'authority',
      'acceptedComposedPosition',
      'mechanismState',
    ],
  )
  if (
    record.schemaVersion !== FUNGAL_RUNTIME_STATE_ENVELOPE_SCHEMA_VERSION
  ) {
    throw new Error(
      `unsupported fungal runtime state envelope version: ${String(record.schemaVersion)}`,
    )
  }
  if (record.acceptedComposedPosition !== null) {
    throw new Error(
      'fungal runtime state v1 cannot claim an accepted composed position before live fungal integration',
    )
  }
  if (record.mechanismState !== null) {
    throw new Error(
      'fungal runtime state v1 cannot carry executable mechanism state',
    )
  }
  validateFungalRuntimeAuthority(
    record.authority as FungalRuntimeAuthority,
  )
}

export function restoreFungalRuntimeStateEnvelope(
  envelope: FungalRuntimeStateEnvelope,
): FungalRuntimeStateEnvelope {
  validateFungalRuntimeStateEnvelope(envelope)
  return createDormantFungalRuntimeStateEnvelope(envelope.authority)
}
