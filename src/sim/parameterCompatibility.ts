export const PARAMETER_COMPATIBILITY_SCHEMA_VERSION = 1 as const

export const PARAMETER_COMPATIBILITY_FIELDS = [
  'organismBackground',
  'mediumSubstrate',
  'temperatureC',
  'pH',
  'oxygenRegime',
  'assayConvention',
  'modelConvention',
] as const

export type ParameterCompatibilityField =
  (typeof PARAMETER_COMPATIBILITY_FIELDS)[number]

export type ParameterCompatibilityDimension =
  | 'compatibilityGroupId'
  | ParameterCompatibilityField

export type ParameterCompatibilityTransferClass = 'transferred' | 'calibrated'

export interface ParameterCompatibilityContext {
  readonly organismBackground?: string
  readonly mediumSubstrate?: string
  readonly temperatureC?: number
  readonly pH?: number
  readonly oxygenRegime?: string
  readonly assayConvention?: string
  readonly modelConvention?: string
}

export interface ParameterCompatibilityTarget {
  readonly compatibilityGroupId: string
  readonly context: ParameterCompatibilityContext
}

export interface ParameterCompatibilityRecord {
  readonly recordId: string
  readonly sourceKey: string
  readonly compatibilityGroupId: string
  readonly context: ParameterCompatibilityContext
}

export interface ParameterCompatibilityTransferDecision {
  readonly recordId: string
  readonly policyId: string
  readonly policyVersion: string
  readonly classification: ParameterCompatibilityTransferClass
  readonly fromCompatibilityGroupId: string
  readonly toCompatibilityGroupId: string
  readonly dimensions: readonly ParameterCompatibilityDimension[]
  readonly limitation: string
}

export interface ParameterCompatibilityComposition {
  readonly schemaVersion: typeof PARAMETER_COMPATIBILITY_SCHEMA_VERSION
  readonly target: ParameterCompatibilityTarget
  readonly requiredFields: readonly ParameterCompatibilityField[]
  readonly records: readonly ParameterCompatibilityRecord[]
  readonly transfers: readonly ParameterCompatibilityTransferDecision[]
}

export type ParameterCompatibilityConflictReason =
  | 'compatibility-group-mismatch'
  | 'context-mismatch'
  | 'missing-record-context'
  | 'missing-target-context'
  | 'transfer-scope-missing'

export interface ParameterCompatibilityConflict {
  readonly recordId: string
  readonly sourceKey: string
  readonly dimension: ParameterCompatibilityDimension
  readonly reason: ParameterCompatibilityConflictReason
  readonly recordValue: string | number | null
  readonly targetValue: string | number | null
}

export interface ParameterCompatibilityAssessment {
  readonly schemaVersion: typeof PARAMETER_COMPATIBILITY_SCHEMA_VERSION
  readonly compatible: boolean
  readonly conflicts: readonly ParameterCompatibilityConflict[]
}

export class ParameterCompatibilityError extends Error {
  readonly conflicts: readonly ParameterCompatibilityConflict[]

  constructor(conflicts: readonly ParameterCompatibilityConflict[]) {
    super(formatCompatibilityConflicts(conflicts))
    this.name = 'ParameterCompatibilityError'
    this.conflicts = conflicts.map((conflict) => ({ ...conflict }))
  }
}

const DIMENSION_ORDER: readonly ParameterCompatibilityDimension[] = [
  'compatibilityGroupId',
  ...PARAMETER_COMPATIBILITY_FIELDS,
]

type CompatibilityValue = string | number

/**
 * Evaluate whether individually sourced parameter records may be composed into
 * one target context without silently reconciling incompatible evidence.
 *
 * Required context is exact by design. A mismatch is allowed only when an
 * explicit versioned transfer/calibration decision covers that exact dimension.
 * Missing machine-readable context cannot be waived by a transfer declaration.
 */
export function assessParameterCompatibility(
  composition: ParameterCompatibilityComposition,
): ParameterCompatibilityAssessment {
  validateCompositionDeclaration(composition)

  const transferByRecord = new Map<string, ParameterCompatibilityTransferDecision>()
  for (let index = 0; index < composition.transfers.length; index += 1) {
    const transfer = composition.transfers[index]!
    transferByRecord.set(transfer.recordId, transfer)
  }

  const conflicts: ParameterCompatibilityConflict[] = []

  for (let index = 0; index < composition.records.length; index += 1) {
    const record = composition.records[index]!
    const mismatches: ParameterCompatibilityConflict[] = []

    if (
      record.compatibilityGroupId !==
      composition.target.compatibilityGroupId
    ) {
      mismatches.push({
        recordId: record.recordId,
        sourceKey: record.sourceKey,
        dimension: 'compatibilityGroupId',
        reason: 'compatibility-group-mismatch',
        recordValue: record.compatibilityGroupId,
        targetValue: composition.target.compatibilityGroupId,
      })
    }

    for (const field of composition.requiredFields) {
      const recordValue = contextValue(record.context, field)
      const targetValue = contextValue(composition.target.context, field)

      if (recordValue === undefined) {
        mismatches.push({
          recordId: record.recordId,
          sourceKey: record.sourceKey,
          dimension: field,
          reason: 'missing-record-context',
          recordValue: null,
          targetValue: targetValue ?? null,
        })
        continue
      }
      if (targetValue === undefined) {
        mismatches.push({
          recordId: record.recordId,
          sourceKey: record.sourceKey,
          dimension: field,
          reason: 'missing-target-context',
          recordValue,
          targetValue: null,
        })
        continue
      }
      if (!Object.is(recordValue, targetValue)) {
        mismatches.push({
          recordId: record.recordId,
          sourceKey: record.sourceKey,
          dimension: field,
          reason: 'context-mismatch',
          recordValue,
          targetValue,
        })
      }
    }

    const transfer = transferByRecord.get(record.recordId)
    if (transfer === undefined) {
      conflicts.push(...mismatches)
      continue
    }

    const resolvableDimensions = new Set(
      mismatches
        .filter(
          (conflict) =>
            conflict.reason === 'compatibility-group-mismatch' ||
            conflict.reason === 'context-mismatch',
        )
        .map((conflict) => conflict.dimension),
    )

    for (const dimension of transfer.dimensions) {
      if (!resolvableDimensions.has(dimension)) {
        throw new Error(
          `parameter compatibility transfer ${transfer.policyId}@${transfer.policyVersion} for ${record.recordId} scopes non-conflicting dimension ${dimension}`,
        )
      }
    }

    const covered = new Set(transfer.dimensions)
    for (const mismatch of mismatches) {
      if (
        mismatch.reason === 'missing-record-context' ||
        mismatch.reason === 'missing-target-context'
      ) {
        conflicts.push(mismatch)
        continue
      }
      if (!covered.has(mismatch.dimension)) {
        conflicts.push({
          ...mismatch,
          reason: 'transfer-scope-missing',
        })
      }
    }

    if (resolvableDimensions.size === 0) {
      throw new Error(
        `parameter compatibility transfer ${transfer.policyId}@${transfer.policyVersion} for ${record.recordId} is unnecessary because no compatible dimension differs`,
      )
    }
  }

  return {
    schemaVersion: PARAMETER_COMPATIBILITY_SCHEMA_VERSION,
    compatible: conflicts.length === 0,
    conflicts,
  }
}

export function assertParameterCompatibility(
  composition: ParameterCompatibilityComposition,
): void {
  const assessment = assessParameterCompatibility(composition)
  if (!assessment.compatible) {
    throw new ParameterCompatibilityError(assessment.conflicts)
  }
}

/**
 * Canonical identity for one accepted compatibility decision.
 *
 * Ordering of records, required fields, transfers, and transfer dimensions is
 * canonicalized so semantically identical declarations share identity. Any
 * target context, record context, group, source, policy, scope, classification,
 * or limitation change alters the identity.
 */
export function parameterCompatibilityDecisionIdentity(
  composition: ParameterCompatibilityComposition,
): string {
  assertParameterCompatibility(composition)

  const requiredFields = sortFields(composition.requiredFields)
  const records = [...composition.records]
    .sort((left, right) => left.recordId.localeCompare(right.recordId))
    .map((record) => ({
      recordId: record.recordId,
      sourceKey: record.sourceKey,
      compatibilityGroupId: record.compatibilityGroupId,
      context: canonicalContext(record.context, requiredFields),
    }))
  const transfers = [...composition.transfers]
    .sort((left, right) => left.recordId.localeCompare(right.recordId))
    .map((transfer) => ({
      recordId: transfer.recordId,
      policyId: transfer.policyId,
      policyVersion: transfer.policyVersion,
      classification: transfer.classification,
      fromCompatibilityGroupId: transfer.fromCompatibilityGroupId,
      toCompatibilityGroupId: transfer.toCompatibilityGroupId,
      dimensions: sortDimensions(transfer.dimensions),
      limitation: transfer.limitation,
    }))

  return `parameter-compatibility-v1:${JSON.stringify({
    schemaVersion: PARAMETER_COMPATIBILITY_SCHEMA_VERSION,
    target: {
      compatibilityGroupId: composition.target.compatibilityGroupId,
      context: canonicalContext(composition.target.context, requiredFields),
    },
    requiredFields,
    records,
    transfers,
  })}`
}

function validateCompositionDeclaration(
  composition: ParameterCompatibilityComposition,
): void {
  if (composition.schemaVersion !== PARAMETER_COMPATIBILITY_SCHEMA_VERSION) {
    throw new Error(
      `unsupported parameter compatibility schema version: ${composition.schemaVersion}`,
    )
  }

  canonicalText(
    'parameter compatibility target group id',
    composition.target.compatibilityGroupId,
  )
  validateContext('parameter compatibility target context', composition.target.context)

  validateDenseUniqueFields(composition.requiredFields, 'required compatibility fields')

  if (!Array.isArray(composition.records) || composition.records.length === 0) {
    throw new Error('parameter compatibility records must be a non-empty array')
  }

  const recordIds = new Set<string>()
  const recordsById = new Map<string, ParameterCompatibilityRecord>()
  for (let index = 0; index < composition.records.length; index += 1) {
    if (!(index in composition.records)) {
      throw new Error('parameter compatibility records must be dense')
    }
    const record = composition.records[index]!
    canonicalText(`parameter compatibility record ${index} id`, record.recordId)
    canonicalText(
      `parameter compatibility record ${record.recordId} source key`,
      record.sourceKey,
    )
    canonicalText(
      `parameter compatibility record ${record.recordId} group id`,
      record.compatibilityGroupId,
    )
    if (recordIds.has(record.recordId)) {
      throw new Error(`duplicate parameter compatibility record id: ${record.recordId}`)
    }
    validateContext(
      `parameter compatibility record ${record.recordId} context`,
      record.context,
    )
    recordIds.add(record.recordId)
    recordsById.set(record.recordId, record)
  }

  if (!Array.isArray(composition.transfers)) {
    throw new Error('parameter compatibility transfers must be an array')
  }

  const transferredRecords = new Set<string>()
  for (let index = 0; index < composition.transfers.length; index += 1) {
    if (!(index in composition.transfers)) {
      throw new Error('parameter compatibility transfers must be dense')
    }
    const transfer = composition.transfers[index]!
    canonicalText(`parameter compatibility transfer ${index} record id`, transfer.recordId)
    canonicalText(`parameter compatibility transfer ${transfer.recordId} policy id`, transfer.policyId)
    canonicalText(
      `parameter compatibility transfer ${transfer.recordId} policy version`,
      transfer.policyVersion,
    )
    canonicalText(
      `parameter compatibility transfer ${transfer.recordId} source group id`,
      transfer.fromCompatibilityGroupId,
    )
    canonicalText(
      `parameter compatibility transfer ${transfer.recordId} target group id`,
      transfer.toCompatibilityGroupId,
    )
    canonicalText(
      `parameter compatibility transfer ${transfer.recordId} limitation`,
      transfer.limitation,
    )
    if (
      transfer.classification !== 'transferred' &&
      transfer.classification !== 'calibrated'
    ) {
      throw new Error(
        `parameter compatibility transfer ${transfer.recordId} classification must be transferred or calibrated`,
      )
    }
    validateDenseUniqueDimensions(
      transfer.dimensions,
      `parameter compatibility transfer ${transfer.recordId} dimensions`,
    )

    const record = recordsById.get(transfer.recordId)
    if (record === undefined) {
      throw new Error(
        `parameter compatibility transfer references unknown record: ${transfer.recordId}`,
      )
    }
    if (transferredRecords.has(transfer.recordId)) {
      throw new Error(
        `parameter compatibility record ${transfer.recordId} has more than one transfer decision`,
      )
    }
    if (transfer.fromCompatibilityGroupId !== record.compatibilityGroupId) {
      throw new Error(
        `parameter compatibility transfer ${transfer.recordId} source group does not match its record`,
      )
    }
    if (
      transfer.toCompatibilityGroupId !==
      composition.target.compatibilityGroupId
    ) {
      throw new Error(
        `parameter compatibility transfer ${transfer.recordId} target group does not match the composition target`,
      )
    }
    transferredRecords.add(transfer.recordId)
  }
}

function validateContext(
  label: string,
  context: ParameterCompatibilityContext,
): void {
  for (const field of PARAMETER_COMPATIBILITY_FIELDS) {
    const value = contextValue(context, field)
    if (value === undefined) continue
    if (typeof value === 'string') {
      canonicalText(`${label} ${field}`, value)
      continue
    }
    if (!Number.isFinite(value)) {
      throw new Error(`${label} ${field} must be finite`)
    }
  }
}

function validateDenseUniqueFields(
  fields: readonly ParameterCompatibilityField[],
  label: string,
): void {
  if (!Array.isArray(fields)) {
    throw new Error(`${label} must be an array`)
  }
  const seen = new Set<ParameterCompatibilityField>()
  for (let index = 0; index < fields.length; index += 1) {
    if (!(index in fields)) {
      throw new Error(`${label} must be dense`)
    }
    const field = fields[index]!
    if (!PARAMETER_COMPATIBILITY_FIELDS.includes(field)) {
      throw new Error(`${label} contains unsupported field: ${String(field)}`)
    }
    if (seen.has(field)) {
      throw new Error(`${label} contains duplicate field: ${field}`)
    }
    seen.add(field)
  }
}

function validateDenseUniqueDimensions(
  dimensions: readonly ParameterCompatibilityDimension[],
  label: string,
): void {
  if (!Array.isArray(dimensions) || dimensions.length === 0) {
    throw new Error(`${label} must be a non-empty array`)
  }
  const seen = new Set<ParameterCompatibilityDimension>()
  for (let index = 0; index < dimensions.length; index += 1) {
    if (!(index in dimensions)) {
      throw new Error(`${label} must be dense`)
    }
    const dimension = dimensions[index]!
    if (!DIMENSION_ORDER.includes(dimension)) {
      throw new Error(
        `${label} contains unsupported dimension: ${String(dimension)}`,
      )
    }
    if (seen.has(dimension)) {
      throw new Error(`${label} contains duplicate dimension: ${dimension}`)
    }
    seen.add(dimension)
  }
}

function contextValue(
  context: ParameterCompatibilityContext,
  field: ParameterCompatibilityField,
): CompatibilityValue | undefined {
  switch (field) {
    case 'organismBackground':
      return context.organismBackground
    case 'mediumSubstrate':
      return context.mediumSubstrate
    case 'temperatureC':
      return context.temperatureC
    case 'pH':
      return context.pH
    case 'oxygenRegime':
      return context.oxygenRegime
    case 'assayConvention':
      return context.assayConvention
    case 'modelConvention':
      return context.modelConvention
  }
}

function canonicalContext(
  context: ParameterCompatibilityContext,
  fields: readonly ParameterCompatibilityField[],
): Record<string, CompatibilityValue> {
  const result: Record<string, CompatibilityValue> = {}
  for (const field of fields) {
    const value = contextValue(context, field)
    if (value !== undefined) result[field] = value
  }
  return result
}

function sortFields(
  fields: readonly ParameterCompatibilityField[],
): ParameterCompatibilityField[] {
  return [...fields].sort(
    (left, right) =>
      PARAMETER_COMPATIBILITY_FIELDS.indexOf(left) -
      PARAMETER_COMPATIBILITY_FIELDS.indexOf(right),
  )
}

function sortDimensions(
  dimensions: readonly ParameterCompatibilityDimension[],
): ParameterCompatibilityDimension[] {
  return [...dimensions].sort(
    (left, right) =>
      DIMENSION_ORDER.indexOf(left) - DIMENSION_ORDER.indexOf(right),
  )
}

function canonicalText(label: string, value: string): void {
  if (value.length === 0 || value !== value.trim()) {
    throw new Error(`${label} must be a canonical non-empty string`)
  }
}

function formatCompatibilityConflicts(
  conflicts: readonly ParameterCompatibilityConflict[],
): string {
  const detail = conflicts
    .map(
      (conflict) =>
        `${conflict.recordId} [${conflict.sourceKey}] ${conflict.dimension}: ${conflict.reason} (record=${formatValue(conflict.recordValue)}, target=${formatValue(conflict.targetValue)})`,
    )
    .join('; ')
  return `parameter compatibility check failed: ${detail}`
}

function formatValue(value: string | number | null): string {
  return value === null ? '<missing>' : JSON.stringify(value)
}
