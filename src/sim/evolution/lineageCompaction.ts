import {
  LineageRegistry,
  type LineageRecord,
  type LineageRegistryCheckpoint,
} from './lineage'

export const LINEAGE_COMPACTION_POLICY_VERSION = 1 as const
export const LINEAGE_COMPACTION_PLAN_SCHEMA_VERSION = 1 as const

export interface LineageCompactionPolicy {
  readonly version: typeof LINEAGE_COMPACTION_POLICY_VERSION
  /**
   * Extinct lineage dense channels remain retained for this much biological
   * time after authoritative extinction before they become release-eligible.
   */
  readonly extinctDenseStateRetentionHours: number
}

export type LineageDenseStateDisposition =
  | 'retain-extant'
  | 'retain-recently-extinct'
  | 'release-extinct-dense-state'

export interface LineageDenseStateDecision {
  readonly lineageId: string
  readonly disposition: LineageDenseStateDisposition
  readonly extinctAtHours: number | null
  readonly releaseEligibleAtHours: number | null
}

export interface LineageCompactionPlan {
  readonly schemaVersion: typeof LINEAGE_COMPACTION_PLAN_SCHEMA_VERSION
  readonly policyIdentity: string
  readonly currentTimeHours: number
  /**
   * Registry checkpoint identity remains intact. This plan authorizes only
   * external dense-state retention/release; it never removes ancestry/events.
   */
  readonly lineageCheckpointVersion: LineageRegistryCheckpoint['version']
  readonly lineageNextId: number
  readonly retainedAncestryRecordCount: number
  readonly retainedEventCount: number
  readonly decisions: readonly LineageDenseStateDecision[]
  readonly retainDenseStateLineageIds: readonly string[]
  readonly releaseDenseStateLineageIds: readonly string[]
}

export function lineageCompactionPolicyIdentity(
  policy: LineageCompactionPolicy,
): string {
  const retentionHours = validatePolicy(policy)
  return `lineage-compaction-policy:v1:extinct-dense-retention-hours=${retentionHours}`
}

/**
 * Plans deterministic dense-state compaction without mutating lineage authority.
 *
 * The LineageRegistry checkpoint is validated through the canonical restore
 * boundary first. Every lineage record, event, and allocator position remains
 * authoritative regardless of the returned dense-state disposition.
 */
export function planLineageDenseStateCompaction(
  checkpoint: LineageRegistryCheckpoint,
  policy: LineageCompactionPolicy,
  currentTimeHours: number,
): LineageCompactionPlan {
  const normalizedCurrentTimeHours = validateCurrentTime(currentTimeHours)
  const retentionHours = validatePolicy(policy)

  const registry = LineageRegistry.restore(checkpoint)
  const records = registry.list()
  const events = registry.eventLog()
  const latestEventTime = events.at(-1)?.timeHours ?? 0

  if (normalizedCurrentTimeHours < latestEventTime) {
    throw new Error(
      'lineage compaction current time cannot precede authoritative lineage history',
    )
  }

  const decisions = records.map((record) =>
    buildDecision(record, retentionHours, normalizedCurrentTimeHours),
  )
  const retainDenseStateLineageIds = decisions
    .filter((decision) => decision.disposition !== 'release-extinct-dense-state')
    .map((decision) => decision.lineageId)
  const releaseDenseStateLineageIds = decisions
    .filter((decision) => decision.disposition === 'release-extinct-dense-state')
    .map((decision) => decision.lineageId)

  return {
    schemaVersion: LINEAGE_COMPACTION_PLAN_SCHEMA_VERSION,
    policyIdentity: lineageCompactionPolicyIdentity(policy),
    currentTimeHours: normalizedCurrentTimeHours,
    lineageCheckpointVersion: checkpoint.version,
    lineageNextId: checkpoint.nextId,
    retainedAncestryRecordCount: records.length,
    retainedEventCount: events.length,
    decisions,
    retainDenseStateLineageIds,
    releaseDenseStateLineageIds,
  }
}

function buildDecision(
  record: LineageRecord,
  retentionHours: number,
  currentTimeHours: number,
): LineageDenseStateDecision {
  if (record.extinctAtHours === null) {
    return {
      lineageId: record.lineageId,
      disposition: 'retain-extant',
      extinctAtHours: null,
      releaseEligibleAtHours: null,
    }
  }

  const releaseEligibleAtHours = record.extinctAtHours + retentionHours
  if (!Number.isFinite(releaseEligibleAtHours)) {
    throw new Error(
      `lineage ${record.lineageId} compaction eligibility time is not finite`,
    )
  }

  return {
    lineageId: record.lineageId,
    disposition:
      currentTimeHours >= releaseEligibleAtHours
        ? 'release-extinct-dense-state'
        : 'retain-recently-extinct',
    extinctAtHours: record.extinctAtHours,
    releaseEligibleAtHours,
  }
}

function validatePolicy(policy: LineageCompactionPolicy): number {
  if (policy.version !== LINEAGE_COMPACTION_POLICY_VERSION) {
    throw new Error('unsupported lineage compaction policy version')
  }

  const retentionHours = normalizeZero(policy.extinctDenseStateRetentionHours)
  if (!Number.isFinite(retentionHours) || retentionHours < 0) {
    throw new Error(
      'lineage compaction retention must be a finite non-negative number of hours',
    )
  }

  return retentionHours
}

function validateCurrentTime(currentTimeHours: number): number {
  const normalized = normalizeZero(currentTimeHours)
  if (!Number.isFinite(normalized) || normalized < 0) {
    throw new Error(
      'lineage compaction current time must be finite and non-negative',
    )
  }
  return normalized
}

function normalizeZero(value: number): number {
  return Object.is(value, -0) ? 0 : value
}
