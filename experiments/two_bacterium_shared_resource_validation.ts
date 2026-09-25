export const TWO_BACTERIUM_SHARED_RESOURCE_VALIDATION_SCHEMA_VERSION =
  'petra-two-bacterium-shared-resource-validation-v2' as const

export const TWO_BACTERIUM_SHARED_RESOURCE_VALIDATION_EXPERIMENT_ID =
  'two-bacterium-shared-resource-validation' as const

export const TWO_BACTERIUM_MECHANISM_SCOPE =
  'shared-resource-local-capacity-only' as const

export const TWO_BACTERIUM_CONTENT_PACK_ID =
  'ecoli-bsubtilis-shared-resource-pack' as const
export const TWO_BACTERIUM_CONTENT_PACK_VERSION = '1.0.0' as const

export const TWO_BACTERIUM_CONTENT_PACK_UNBOUND_LIMITATION =
  'standalone-content-pack-manifest-not-yet-bound' as const

export const TWO_BACTERIUM_TAXON_ROLES = Object.freeze([
  'ecoli-mg1655',
  'bacillus-168-trp-plus-sigE-minus',
] as const)

export type TwoBacteriumTaxonRole = (typeof TWO_BACTERIUM_TAXON_ROLES)[number]

export const REQUIRED_TWO_BACTERIUM_CONTROL_IDS = Object.freeze([
  'isolated-ecoli-growth',
  'isolated-bacillus-growth',
  'zero-resource-no-biomass-production',
  'identical-trait-symmetry',
  'lineage-species-iteration-order-invariance',
  'shared-resource-local-capacity-coherence',
  'same-seed-replay',
  'checkpoint-restore-continuation',
  'exact-lineage-taxon-identity',
  'isolated-growth-target-distance-reported',
  'bacillus-ciprofloxacin-refusal',
  'bacillus-evolution-refusal',
] as const)

export type TwoBacteriumControlId =
  (typeof REQUIRED_TWO_BACTERIUM_CONTROL_IDS)[number]

export const REQUIRED_TWO_BACTERIUM_LIMITATIONS = Object.freeze([
  'model-resource-is-not-glucose',
  'model-biomass-is-not-gcdw',
  'cross-study-isolated-growth-targets-are-not-coculture-measurements',
  'no-direct-antagonism-authority',
  'no-bacillus-ciprofloxacin-authority',
  'no-bacillus-evolution-authority',
] as const)

export type TwoBacteriumRequiredLimitation =
  (typeof REQUIRED_TWO_BACTERIUM_LIMITATIONS)[number]

export interface TwoBacteriumTaxonEvidenceIdentity {
  readonly role: TwoBacteriumTaxonRole
  readonly taxonId: string
  readonly taxonContentVersion: string
  readonly scientificName: string
  readonly background: string
}

export interface TwoBacteriumLineageTaxonAssignment {
  readonly lineageId: string
  readonly taxonId: string
  readonly taxonContentVersion: string
}

export interface TwoBacteriumValidationControl {
  readonly id: TwoBacteriumControlId
  readonly status: 'passed' | 'failed'
  readonly detail: string
}

export interface TwoBacteriumRuntimeSummary {
  readonly status: 'completed' | 'failed' | 'refused'
  readonly durationSeconds: number
  readonly peakRssBytes: number | null
  readonly failures: readonly string[]
}

export interface TwoBacteriumSharedResourceValidationEvidence {
  readonly schemaVersion:
    typeof TWO_BACTERIUM_SHARED_RESOURCE_VALIDATION_SCHEMA_VERSION
  readonly experimentId:
    typeof TWO_BACTERIUM_SHARED_RESOURCE_VALIDATION_EXPERIMENT_ID
  readonly mechanismScope: typeof TWO_BACTERIUM_MECHANISM_SCOPE
  readonly scenario: {
    readonly id: string
    readonly version: string
  }
  readonly contentPack: {
    readonly id: string
    readonly version: string
  } | null
  readonly contentPackBinding: {
    readonly status: 'bound' | 'unbound'
    readonly limitation:
      | typeof TWO_BACTERIUM_CONTENT_PACK_UNBOUND_LIMITATION
      | null
  }
  readonly configurationFingerprint: string
  readonly taxa: readonly TwoBacteriumTaxonEvidenceIdentity[]
  readonly lineageTaxonAssignments:
    readonly TwoBacteriumLineageTaxonAssignment[]
  readonly units: {
    readonly resource: 'model-resource'
    readonly biomass: 'model-biomass'
  }
  readonly seeds: readonly number[]
  readonly horizonTicks: number
  readonly samplingCadenceTicks: number
  readonly controls: readonly TwoBacteriumValidationControl[]
  readonly limitations: readonly string[]
  readonly runtime: TwoBacteriumRuntimeSummary
}

export interface TwoBacteriumEvidenceAssessment {
  /** True only when both mechanistic controls and provenance are promotion-ready. */
  readonly accepted: boolean
  /** Scientific/runtime controls passed independently of packaging completeness. */
  readonly mechanisticAccepted: boolean
  /** Exact standalone content-pack id/version is bound rather than inferred. */
  readonly provenanceComplete: boolean
  readonly structuralErrors: readonly string[]
  readonly rejectionReasons: readonly string[]
  readonly promotionBlockers: readonly string[]
}

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isCanonicalString(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.trim() === value
  )
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function taxonKey(taxonId: string, contentVersion: string): string {
  return `${taxonId}@${contentVersion}`
}

function validateCanonicalIdentity(
  value: unknown,
  label: string,
  errors: string[],
): value is { readonly id: string; readonly version: string } {
  if (!isRecord(value)) {
    errors.push(`${label} must be an object`)
    return false
  }
  if (!isCanonicalString(value.id)) {
    errors.push(`${label}.id must be a non-empty canonical string`)
  }
  if (!isCanonicalString(value.version)) {
    errors.push(`${label}.version must be a non-empty canonical string`)
  }
  return isCanonicalString(value.id) && isCanonicalString(value.version)
}

function validateContentPackBinding(
  contentPack: unknown,
  bindingValue: unknown,
  scenarioValue: unknown,
  errors: string[],
): void {
  if (!isRecord(bindingValue)) {
    errors.push('contentPackBinding must be an object')
    return
  }

  if (bindingValue.status === 'bound') {
    if (bindingValue.limitation !== null) {
      errors.push('bound contentPackBinding.limitation must be null')
    }
    const packValid = validateCanonicalIdentity(
      contentPack,
      'contentPack',
      errors,
    )
    if (packValid) {
      if (
        contentPack.id !== TWO_BACTERIUM_CONTENT_PACK_ID ||
        contentPack.version !== TWO_BACTERIUM_CONTENT_PACK_VERSION
      ) {
        errors.push(
          `bound contentPack must equal ${TWO_BACTERIUM_CONTENT_PACK_ID}@${TWO_BACTERIUM_CONTENT_PACK_VERSION}`,
        )
      }
      if (
        isRecord(scenarioValue) &&
        isCanonicalString(scenarioValue.id) &&
        isCanonicalString(scenarioValue.version) &&
        contentPack.id === scenarioValue.id &&
        contentPack.version === scenarioValue.version
      ) {
        errors.push(
          'contentPack identity must not alias scenario identity',
        )
      }
    }
    return
  }

  if (bindingValue.status === 'unbound') {
    if (contentPack !== null) {
      errors.push('unbound contentPackBinding requires contentPack to be null')
    }
    if (
      bindingValue.limitation !==
      TWO_BACTERIUM_CONTENT_PACK_UNBOUND_LIMITATION
    ) {
      errors.push(
        `unbound contentPackBinding.limitation must be ${TWO_BACTERIUM_CONTENT_PACK_UNBOUND_LIMITATION}`,
      )
    }
    return
  }

  errors.push('contentPackBinding.status must be bound or unbound')
}

function validateTaxa(
  value: unknown,
  errors: string[],
): Map<string, TwoBacteriumTaxonRole> {
  const identities = new Map<string, TwoBacteriumTaxonRole>()
  const seenRoles = new Set<TwoBacteriumTaxonRole>()

  if (!Array.isArray(value) || value.length !== TWO_BACTERIUM_TAXON_ROLES.length) {
    errors.push('taxa must contain exactly the two required taxon roles')
    return identities
  }

  for (const [index, entry] of value.entries()) {
    if (!isRecord(entry)) {
      errors.push(`taxa[${index}] must be an object`)
      continue
    }

    const role = entry.role
    if (
      typeof role !== 'string' ||
      !TWO_BACTERIUM_TAXON_ROLES.includes(role as TwoBacteriumTaxonRole)
    ) {
      errors.push(`taxa[${index}].role is not a supported validation role`)
      continue
    }
    const typedRole = role as TwoBacteriumTaxonRole
    if (seenRoles.has(typedRole)) {
      errors.push(`duplicate taxon role: ${typedRole}`)
    }
    seenRoles.add(typedRole)

    for (const field of [
      'taxonId',
      'taxonContentVersion',
      'scientificName',
      'background',
    ] as const) {
      if (!isCanonicalString(entry[field])) {
        errors.push(
          `taxa[${index}].${field} must be a non-empty canonical string`,
        )
      }
    }

    if (
      isCanonicalString(entry.taxonId) &&
      isCanonicalString(entry.taxonContentVersion)
    ) {
      const key = taxonKey(entry.taxonId, entry.taxonContentVersion)
      if (identities.has(key)) {
        errors.push(
          'the two validation roles must not share the same exact taxon revision',
        )
      } else {
        identities.set(key, typedRole)
      }
    }
  }

  for (const role of TWO_BACTERIUM_TAXON_ROLES) {
    if (!seenRoles.has(role)) {
      errors.push(`missing required taxon role: ${role}`)
    }
  }

  return identities
}

function validateLineageTaxonAssignments(
  value: unknown,
  identities: ReadonlyMap<string, TwoBacteriumTaxonRole>,
  errors: string[],
): void {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push('lineageTaxonAssignments must be a non-empty array')
    return
  }

  const lineageIds = new Set<string>()
  const representedRoles = new Set<TwoBacteriumTaxonRole>()

  for (const [index, entry] of value.entries()) {
    if (!isRecord(entry)) {
      errors.push(`lineageTaxonAssignments[${index}] must be an object`)
      continue
    }

    if (!isCanonicalString(entry.lineageId)) {
      errors.push(
        `lineageTaxonAssignments[${index}].lineageId must be a non-empty canonical string`,
      )
    } else if (lineageIds.has(entry.lineageId)) {
      errors.push(`duplicate runtime lineage id: ${entry.lineageId}`)
    } else {
      lineageIds.add(entry.lineageId)
    }

    if (
      !isCanonicalString(entry.taxonId) ||
      !isCanonicalString(entry.taxonContentVersion)
    ) {
      errors.push(
        `lineageTaxonAssignments[${index}] must carry exact taxonId + taxonContentVersion`,
      )
      continue
    }

    const role = identities.get(
      taxonKey(entry.taxonId, entry.taxonContentVersion),
    )
    if (role === undefined) {
      errors.push(
        `lineageTaxonAssignments[${index}] references an unknown or stale taxon revision`,
      )
    } else {
      representedRoles.add(role)
    }
  }

  for (const role of TWO_BACTERIUM_TAXON_ROLES) {
    if (!representedRoles.has(role)) {
      errors.push(
        `runtime lineage assignments do not represent required taxon role: ${role}`,
      )
    }
  }
}

function validateSeeds(value: unknown, errors: string[]): void {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push('seeds must be a non-empty array')
    return
  }

  const seen = new Set<number>()
  for (const [index, seed] of value.entries()) {
    if (!isNonNegativeSafeInteger(seed)) {
      errors.push(`seeds[${index}] must be a non-negative safe integer`)
      continue
    }
    if (seen.has(seed)) {
      errors.push(`duplicate seed: ${seed}`)
    }
    seen.add(seed)
  }
}

function validateControls(value: unknown, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push('controls must be an array')
    return
  }

  const required = new Set<string>(REQUIRED_TWO_BACTERIUM_CONTROL_IDS)
  const seen = new Set<string>()

  for (const [index, entry] of value.entries()) {
    if (!isRecord(entry)) {
      errors.push(`controls[${index}] must be an object`)
      continue
    }
    if (
      typeof entry.id !== 'string' ||
      !required.has(entry.id)
    ) {
      errors.push(`controls[${index}].id is not a required control id`)
      continue
    }
    if (seen.has(entry.id)) {
      errors.push(`duplicate control id: ${entry.id}`)
    }
    seen.add(entry.id)

    if (entry.status !== 'passed' && entry.status !== 'failed') {
      errors.push(`controls[${index}].status must be passed or failed`)
    }
    if (!isCanonicalString(entry.detail)) {
      errors.push(
        `controls[${index}].detail must be a non-empty canonical string`,
      )
    }
  }

  for (const id of REQUIRED_TWO_BACTERIUM_CONTROL_IDS) {
    if (!seen.has(id)) {
      errors.push(`missing required control: ${id}`)
    }
  }

  if (value.length !== REQUIRED_TWO_BACTERIUM_CONTROL_IDS.length) {
    errors.push(
      'controls must contain each required control exactly once and no extras',
    )
  }
}

function validateLimitations(value: unknown, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push('limitations must be an array')
    return
  }

  const seen = new Set<string>()
  for (const [index, entry] of value.entries()) {
    if (!isCanonicalString(entry)) {
      errors.push(
        `limitations[${index}] must be a non-empty canonical string`,
      )
      continue
    }
    if (seen.has(entry)) {
      errors.push(`duplicate limitation: ${entry}`)
    }
    seen.add(entry)
  }

  for (const limitation of REQUIRED_TWO_BACTERIUM_LIMITATIONS) {
    if (!seen.has(limitation)) {
      errors.push(`missing required limitation: ${limitation}`)
    }
  }
}

function validateRuntime(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push('runtime must be an object')
    return
  }
  if (
    value.status !== 'completed' &&
    value.status !== 'failed' &&
    value.status !== 'refused'
  ) {
    errors.push('runtime.status must be completed, failed, or refused')
  }
  if (!isNonNegativeFiniteNumber(value.durationSeconds)) {
    errors.push('runtime.durationSeconds must be finite and non-negative')
  }
  if (
    value.peakRssBytes !== null &&
    !isNonNegativeSafeInteger(value.peakRssBytes)
  ) {
    errors.push('runtime.peakRssBytes must be null or a non-negative safe integer')
  }
  if (!Array.isArray(value.failures)) {
    errors.push('runtime.failures must be an array')
  } else {
    const seen = new Set<string>()
    for (const [index, failure] of value.failures.entries()) {
      if (!isCanonicalString(failure)) {
        errors.push(
          `runtime.failures[${index}] must be a non-empty canonical string`,
        )
        continue
      }
      if (seen.has(failure)) {
        errors.push(`duplicate runtime failure: ${failure}`)
      }
      seen.add(failure)
    }
  }
}

export function validateTwoBacteriumSharedResourceValidationEvidence(
  value: unknown,
): readonly string[] {
  const errors: string[] = []
  if (!isRecord(value)) {
    return Object.freeze(['evidence must be an object'])
  }

  if (
    value.schemaVersion !==
    TWO_BACTERIUM_SHARED_RESOURCE_VALIDATION_SCHEMA_VERSION
  ) {
    errors.push(
      `schemaVersion must be ${TWO_BACTERIUM_SHARED_RESOURCE_VALIDATION_SCHEMA_VERSION}`,
    )
  }
  if (
    value.experimentId !==
    TWO_BACTERIUM_SHARED_RESOURCE_VALIDATION_EXPERIMENT_ID
  ) {
    errors.push(
      `experimentId must be ${TWO_BACTERIUM_SHARED_RESOURCE_VALIDATION_EXPERIMENT_ID}`,
    )
  }
  if (value.mechanismScope !== TWO_BACTERIUM_MECHANISM_SCOPE) {
    errors.push(`mechanismScope must be ${TWO_BACTERIUM_MECHANISM_SCOPE}`)
  }

  validateCanonicalIdentity(value.scenario, 'scenario', errors)
  validateContentPackBinding(
    value.contentPack,
    value.contentPackBinding,
    value.scenario,
    errors,
  )

  if (!isCanonicalString(value.configurationFingerprint)) {
    errors.push(
      'configurationFingerprint must be a non-empty canonical string',
    )
  }

  const identities = validateTaxa(value.taxa, errors)
  validateLineageTaxonAssignments(
    value.lineageTaxonAssignments,
    identities,
    errors,
  )

  if (!isRecord(value.units)) {
    errors.push('units must be an object')
  } else {
    if (value.units.resource !== 'model-resource') {
      errors.push('units.resource must remain model-resource')
    }
    if (value.units.biomass !== 'model-biomass') {
      errors.push('units.biomass must remain model-biomass')
    }
  }

  validateSeeds(value.seeds, errors)

  if (!isPositiveSafeInteger(value.horizonTicks)) {
    errors.push('horizonTicks must be a positive safe integer')
  }
  if (!isPositiveSafeInteger(value.samplingCadenceTicks)) {
    errors.push('samplingCadenceTicks must be a positive safe integer')
  } else if (
    isPositiveSafeInteger(value.horizonTicks) &&
    value.samplingCadenceTicks > value.horizonTicks
  ) {
    errors.push('samplingCadenceTicks must not exceed horizonTicks')
  }

  validateControls(value.controls, errors)
  validateLimitations(value.limitations, errors)
  validateRuntime(value.runtime, errors)

  return Object.freeze(errors)
}

export function assessTwoBacteriumSharedResourceValidationEvidence(
  value: unknown,
): TwoBacteriumEvidenceAssessment {
  const structuralErrors =
    validateTwoBacteriumSharedResourceValidationEvidence(value)
  if (structuralErrors.length > 0 || !isRecord(value)) {
    return Object.freeze({
      accepted: false,
      mechanisticAccepted: false,
      provenanceComplete: false,
      structuralErrors,
      rejectionReasons: Object.freeze([
        'evidence failed structural validation',
      ]),
      promotionBlockers: Object.freeze([
        'evidence failed structural validation',
      ]),
    })
  }

  const rejectionReasons: string[] = []
  const controls = value.controls as readonly UnknownRecord[]
  for (const control of controls) {
    if (control.status !== 'passed') {
      rejectionReasons.push(`required control failed: ${String(control.id)}`)
    }
  }

  const runtime = value.runtime as UnknownRecord
  if (runtime.status !== 'completed') {
    rejectionReasons.push(
      `runtime did not complete: ${String(runtime.status)}`,
    )
  }
  if (
    Array.isArray(runtime.failures) &&
    runtime.failures.length > 0
  ) {
    rejectionReasons.push('runtime reported one or more failures')
  }

  const contentPackBinding = value.contentPackBinding as UnknownRecord
  const mechanisticAccepted = rejectionReasons.length === 0
  const provenanceComplete = contentPackBinding.status === 'bound'
  const promotionBlockers = provenanceComplete
    ? []
    : ['content pack manifest is unbound']

  return Object.freeze({
    accepted: mechanisticAccepted && provenanceComplete,
    mechanisticAccepted,
    provenanceComplete,
    structuralErrors,
    rejectionReasons: Object.freeze(rejectionReasons),
    promotionBlockers: Object.freeze(promotionBlockers),
  })
}
