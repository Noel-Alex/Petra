import { describe, expect, it } from 'vitest'
import { LineageRegistry, type LineageRegistryCheckpoint } from './lineage'

describe('lineage parent lifetime chronology', () => {
  it('rejects a child created after its parent is extinct', () => {
    const registry = new LineageRegistry()
    const parent = registry.create({ parentLineageId: null, genotypeId: 'WT', createdAtHours: 0, originCellIndex: null, mutationClass: null })
    registry.markExtinct(parent.lineageId, 1)

    expect(() => registry.create({ parentLineageId: parent.lineageId, genotypeId: 'A', createdAtHours: 2, originCellIndex: null, mutationClass: 'target' })).toThrow(/after its parent extinction/)
    expect(registry.list()).toHaveLength(1)
  })

  it('rejects retroactive extinction before an existing child birth without mutating authority', () => {
    const registry = new LineageRegistry()
    const parent = registry.create({ parentLineageId: null, genotypeId: 'WT', createdAtHours: 0, originCellIndex: null, mutationClass: null })
    registry.create({ parentLineageId: parent.lineageId, genotypeId: 'A', createdAtHours: 2, originCellIndex: null, mutationClass: 'target' })
    const before = registry.checkpoint()

    expect(() => registry.markExtinct(parent.lineageId, 1)).toThrow(/cannot precede an existing child creation/)
    expect(registry.checkpoint()).toEqual(before)
  })

  it('allows equal-time child creation and parent extinction in deterministic insertion order', () => {
    const registry = new LineageRegistry()
    const parent = registry.create({ parentLineageId: null, genotypeId: 'WT', createdAtHours: 0, originCellIndex: null, mutationClass: null })
    const child = registry.create({ parentLineageId: parent.lineageId, genotypeId: 'A', createdAtHours: 1, originCellIndex: null, mutationClass: 'target' })
    registry.markExtinct(parent.lineageId, 1)

    expect(child.createdAtHours).toBe(1)
    expect(registry.eventLog().map(({ kind, lineageId, timeHours }) => [kind, lineageId, timeHours])).toEqual([
      ['lineage-created', 'L1', 0],
      ['lineage-created', 'L2', 1],
      ['lineage-extinct', 'L1', 1],
    ])
    expect(LineageRegistry.restore(registry.checkpoint()).checkpoint()).toEqual(registry.checkpoint())
  })

  it('rejects checkpoints whose child is born after parent extinction', () => {
    const registry = new LineageRegistry()
    const parent = registry.create({ parentLineageId: null, genotypeId: 'WT', createdAtHours: 0, originCellIndex: null, mutationClass: null })
    registry.create({ parentLineageId: parent.lineageId, genotypeId: 'A', createdAtHours: 1, originCellIndex: null, mutationClass: 'target' })
    registry.markExtinct(parent.lineageId, 2)
    const checkpoint = registry.checkpoint()

    const corrupted: LineageRegistryCheckpoint = {
      ...checkpoint,
      records: checkpoint.records.map((record) => record.lineageId === parent.lineageId ? { ...record, extinctAtHours: 0.5 } : record),
      events: checkpoint.events.map((event) => event.kind === 'lineage-extinct' && event.lineageId === parent.lineageId ? { ...event, timeHours: 0.5 } : event),
    }

    expect(() => LineageRegistry.restore(corrupted)).toThrow(/after its parent extinction/)
  })
})
