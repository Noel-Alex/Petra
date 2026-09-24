import { describe, expect, it } from 'vitest'

import { LineageRegistry, type LineageRegistryCheckpoint } from './lineage'
import {
  lineageCompactionPolicyIdentity,
  planLineageDenseStateCompaction,
  type LineageCompactionPolicy,
} from './lineageCompaction'

const POLICY = {
  version: 1,
  extinctDenseStateRetentionHours: 2,
} as const satisfies LineageCompactionPolicy

function buildCheckpoint(): LineageRegistryCheckpoint {
  const registry = new LineageRegistry()
  const founder = registry.create({
    parentLineageId: null,
    genotypeId: 'WT',
    createdAtHours: 0,
    originCellIndex: 0,
    mutationClass: null,
  })
  const child = registry.create({
    parentLineageId: founder.lineageId,
    genotypeId: 'A',
    createdAtHours: 0.5,
    originCellIndex: 1,
    mutationClass: 'first-step',
  })
  registry.markExtinct(founder.lineageId, 1)
  registry.create({
    parentLineageId: child.lineageId,
    genotypeId: 'AB',
    createdAtHours: 2,
    originCellIndex: 2,
    mutationClass: 'second-step',
  })
  registry.markExtinct(child.lineageId, 2.5)
  return registry.checkpoint()
}

describe('lineage dense-state compaction planning', () => {
  it('releases only extinct dense state whose retention window elapsed', () => {
    const checkpoint = buildCheckpoint()

    const plan = planLineageDenseStateCompaction(checkpoint, POLICY, 3)

    expect(plan.policyIdentity).toBe(
      'lineage-compaction-policy:v1:extinct-dense-retention-hours=2',
    )
    expect(plan.decisions).toEqual([
      {
        lineageId: 'L1',
        disposition: 'release-extinct-dense-state',
        extinctAtHours: 1,
        releaseEligibleAtHours: 3,
      },
      {
        lineageId: 'L2',
        disposition: 'retain-recently-extinct',
        extinctAtHours: 2.5,
        releaseEligibleAtHours: 4.5,
      },
      {
        lineageId: 'L3',
        disposition: 'retain-extant',
        extinctAtHours: null,
        releaseEligibleAtHours: null,
      },
    ])
    expect(plan.releaseDenseStateLineageIds).toEqual(['L1'])
    expect(plan.retainDenseStateLineageIds).toEqual(['L2', 'L3'])
  })

  it('preserves complete ancestry/event/allocator authority while planning release', () => {
    const checkpoint = buildCheckpoint()
    const checkpointBefore = structuredClone(checkpoint)

    const plan = planLineageDenseStateCompaction(checkpoint, POLICY, 3)

    expect(checkpoint).toEqual(checkpointBefore)
    expect(plan.retainedAncestryRecordCount).toBe(checkpoint.records.length)
    expect(plan.retainedEventCount).toBe(checkpoint.events.length)
    expect(plan.lineageNextId).toBe(checkpoint.nextId)

    const restored = LineageRegistry.restore(checkpoint)
    expect(restored.list().map((record) => record.lineageId)).toEqual([
      'L1',
      'L2',
      'L3',
    ])
    expect(restored.eventLog()).toEqual(checkpoint.events)
  })

  it('is deterministic and preserves checkpoint creation order in every list', () => {
    const checkpoint = buildCheckpoint()

    const first = planLineageDenseStateCompaction(checkpoint, POLICY, 10)
    const second = planLineageDenseStateCompaction(checkpoint, POLICY, 10)

    expect(second).toEqual(first)
    expect(first.decisions.map((decision) => decision.lineageId)).toEqual([
      'L1',
      'L2',
      'L3',
    ])
    expect(first.releaseDenseStateLineageIds).toEqual(['L1', 'L2'])
    expect(first.retainDenseStateLineageIds).toEqual(['L3'])
  })

  it('treats the exact retention boundary as release-eligible', () => {
    const checkpoint = buildCheckpoint()

    expect(
      planLineageDenseStateCompaction(checkpoint, POLICY, 3)
        .releaseDenseStateLineageIds,
    ).toContain('L1')
    expect(
      planLineageDenseStateCompaction(checkpoint, POLICY, 2.999)
        .releaseDenseStateLineageIds,
    ).not.toContain('L1')
  })

  it('rejects planning against a biological time before authoritative history', () => {
    const checkpoint = buildCheckpoint()

    expect(() =>
      planLineageDenseStateCompaction(checkpoint, POLICY, 2),
    ).toThrow(/cannot precede authoritative lineage history/)
  })

  it('rejects malformed lineage authority through the canonical restore gate', () => {
    const checkpoint = buildCheckpoint()

    expect(() =>
      planLineageDenseStateCompaction(
        {
          ...checkpoint,
          nextId: 1,
        },
        POLICY,
        3,
      ),
    ).toThrow(/nextId must be/)
  })

  it('rejects invalid policies and canonicalizes negative zero identity', () => {
    expect(() =>
      planLineageDenseStateCompaction(
        buildCheckpoint(),
        {
          version: 1,
          extinctDenseStateRetentionHours: -1,
        },
        3,
      ),
    ).toThrow(/retention must be a finite non-negative/)

    expect(() =>
      planLineageDenseStateCompaction(
        buildCheckpoint(),
        {
          version: 1,
          extinctDenseStateRetentionHours: Number.NaN,
        },
        3,
      ),
    ).toThrow(/retention must be a finite non-negative/)

    expect(
      lineageCompactionPolicyIdentity({
        version: 1,
        extinctDenseStateRetentionHours: -0,
      }),
    ).toBe('lineage-compaction-policy:v1:extinct-dense-retention-hours=0')
  })

  it('fails closed when the eligibility timestamp would overflow', () => {
    const registry = new LineageRegistry()
    const lineage = registry.create({
      parentLineageId: null,
      genotypeId: 'WT',
      createdAtHours: 0,
      originCellIndex: null,
      mutationClass: null,
    })
    registry.markExtinct(lineage.lineageId, 1e308)

    expect(() =>
      planLineageDenseStateCompaction(
        registry.checkpoint(),
        {
          version: 1,
          extinctDenseStateRetentionHours: 1e308,
        },
        1e308,
      ),
    ).toThrow(/eligibility time is not finite/)
  })
})
