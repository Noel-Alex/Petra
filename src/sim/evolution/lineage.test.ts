import { describe, expect, it } from 'vitest'
import { LineageRegistry, type LineageRegistryCheckpoint } from './lineage'

describe('lineage registry', () => {
  it('records deterministic ancestry and event order', () => {
    const registry = new LineageRegistry()
    const founder = registry.create({ parentLineageId: null, genotypeId: 'WT', createdAtHours: 0, originCellIndex: 4, mutationClass: null })
    const child = registry.create({ parentLineageId: founder.lineageId, genotypeId: 'gyrA', createdAtHours: 2, originCellIndex: 5, mutationClass: 'gyrA-class' })
    registry.markExtinct(founder.lineageId, 3)

    expect(founder.lineageId).toBe('L1')
    expect(child.lineageId).toBe('L2')
    expect(child.parentLineageId).toBe('L1')
    expect(registry.eventLog().map((event) => event.kind)).toEqual(['lineage-created', 'lineage-created', 'lineage-extinct'])
  })

  it('rejects children with unknown parents or impossible chronology', () => {
    const registry = new LineageRegistry()
    expect(() => registry.create({ parentLineageId: 'L99', genotypeId: 'A', createdAtHours: 1, originCellIndex: null, mutationClass: null })).toThrow(/unknown parent/)

    const founder = registry.create({ parentLineageId: null, genotypeId: 'WT', createdAtHours: 2, originCellIndex: null, mutationClass: null })
    expect(() => registry.create({ parentLineageId: founder.lineageId, genotypeId: 'A', createdAtHours: 1, originCellIndex: null, mutationClass: 'target' })).toThrow(/before its parent/)
  })

  it('emits extinction once even when pruning calls repeat', () => {
    const registry = new LineageRegistry()
    const lineage = registry.create({ parentLineageId: null, genotypeId: 'WT', createdAtHours: 0, originCellIndex: null, mutationClass: null })
    registry.markExtinct(lineage.lineageId, 1)
    registry.markExtinct(lineage.lineageId, 2)
    expect(registry.eventLog().filter((event) => event.kind === 'lineage-extinct')).toHaveLength(1)
    expect(registry.get(lineage.lineageId)?.extinctAtHours).toBe(1)
  })

  it('round-trips ancestry, events, and the next lineage id', () => {
    const registry = new LineageRegistry()
    const founder = registry.create({ parentLineageId: null, genotypeId: 'WT', createdAtHours: 0, originCellIndex: 4, mutationClass: null })
    registry.create({ parentLineageId: founder.lineageId, genotypeId: 'gyrA', createdAtHours: 2, originCellIndex: 5, mutationClass: 'gyrA-class' })
    registry.markExtinct(founder.lineageId, 3)

    const restored = LineageRegistry.restore(registry.checkpoint())

    expect(restored.list()).toEqual(registry.list())
    expect(restored.eventLog()).toEqual(registry.eventLog())

    const nextOrigin = { parentLineageId: 'L2', genotypeId: 'double', createdAtHours: 4, originCellIndex: 6, mutationClass: 'second-step' } as const
    expect(registry.create(nextOrigin).lineageId).toBe('L3')
    expect(restored.create(nextOrigin).lineageId).toBe('L3')
    expect(restored.eventLog()).toEqual(registry.eventLog())
  })

  it('rejects live backdating while preserving deterministic same-time insertion order', () => {
    const registry = new LineageRegistry()
    const founder = registry.create({ parentLineageId: null, genotypeId: 'WT', createdAtHours: 2, originCellIndex: null, mutationClass: null })
    const sibling = registry.create({ parentLineageId: null, genotypeId: 'A', createdAtHours: 2, originCellIndex: null, mutationClass: null })
    registry.markExtinct(founder.lineageId, 2)

    expect(registry.eventLog().map((event) => [event.kind, event.lineageId, event.timeHours])).toEqual([
      ['lineage-created', 'L1', 2],
      ['lineage-created', 'L2', 2],
      ['lineage-extinct', 'L1', 2],
    ])
    expect(() => registry.create({ parentLineageId: null, genotypeId: 'B', createdAtHours: 1, originCellIndex: null, mutationClass: null })).toThrow(/cannot precede/)
    expect(() => registry.markExtinct(sibling.lineageId, 1)).toThrow(/cannot precede/)
    expect(registry.get(sibling.lineageId)?.extinctAtHours).toBeNull()
  })

  it('rejects checkpoint event streams whose timestamps move backwards', () => {
    const registry = new LineageRegistry()
    registry.create({ parentLineageId: null, genotypeId: 'WT', createdAtHours: 0, originCellIndex: null, mutationClass: null })
    registry.create({ parentLineageId: null, genotypeId: 'A', createdAtHours: 1, originCellIndex: null, mutationClass: null })
    const checkpoint = registry.checkpoint()
    const backdated: LineageRegistryCheckpoint = {
      ...checkpoint,
      records: checkpoint.records.map((record) => record.lineageId === 'L2' ? { ...record, createdAtHours: 0.5 } : record),
      events: checkpoint.events.map((event) => event.lineageId === 'L2' ? { ...event, timeHours: 0.5 } : event),
    }
    const reordered: LineageRegistryCheckpoint = {
      ...backdated,
      events: [backdated.events[1]!, backdated.events[0]!],
    }

    expect(() => LineageRegistry.restore(reordered)).toThrow(/backdates authoritative event order/)
  })

  it('returns isolated projections from create, get, list, and eventLog', () => {
    const registry = new LineageRegistry()
    const created = registry.create({ parentLineageId: null, genotypeId: 'WT', createdAtHours: 0, originCellIndex: null, mutationClass: null })

    ;(created as { extinctAtHours: number | null }).extinctAtHours = 9
    const fetched = registry.get(created.lineageId)!
    ;(fetched as { extinctAtHours: number | null }).extinctAtHours = 8
    const listed = registry.list()[0]!
    ;(listed as { extinctAtHours: number | null }).extinctAtHours = 7
    const event = registry.eventLog()[0]!
    ;(event as { timeHours: number }).timeHours = 6

    expect(registry.get(created.lineageId)?.extinctAtHours).toBeNull()
    expect(registry.list()[0]?.extinctAtHours).toBeNull()
    expect(registry.eventLog()[0]?.timeHours).toBe(0)
    expect(registry.checkpoint().records[0]?.extinctAtHours).toBeNull()
    expect(registry.checkpoint().events[0]?.timeHours).toBe(0)

    registry.markExtinct(created.lineageId, 1)
    expect(registry.get(created.lineageId)?.extinctAtHours).toBe(1)
    expect(registry.eventLog().map((item) => item.kind)).toEqual(['lineage-created', 'lineage-extinct'])
  })

  it('returns a checkpoint isolated from live registry objects', () => {
    const registry = new LineageRegistry()
    registry.create({ parentLineageId: null, genotypeId: 'WT', createdAtHours: 0, originCellIndex: null, mutationClass: null })

    const checkpoint = registry.checkpoint()
    ;(checkpoint.records[0] as { extinctAtHours: number | null }).extinctAtHours = 99
    ;(checkpoint.events[0] as { timeHours: number }).timeHours = 99

    expect(registry.get('L1')?.extinctAtHours).toBeNull()
    expect(registry.eventLog()[0]?.timeHours).toBe(0)
  })

  it('rejects allocator rollback and incomplete event history', () => {
    const registry = new LineageRegistry()
    registry.create({ parentLineageId: null, genotypeId: 'WT', createdAtHours: 0, originCellIndex: null, mutationClass: null })
    const checkpoint = registry.checkpoint()

    expect(() =>
      LineageRegistry.restore({
        ...checkpoint,
        nextId: 1,
      }),
    ).toThrow(/nextId must be 2/)

    expect(() =>
      LineageRegistry.restore({
        ...checkpoint,
        events: [],
      }),
    ).toThrow(/missing creation event/)
  })

  it('rejects sparse record and event arrays before restoring authority', () => {
    const registry = new LineageRegistry()
    const founder = registry.create({
      parentLineageId: null,
      genotypeId: 'WT',
      createdAtHours: 0,
      originCellIndex: null,
      mutationClass: null,
    })
    const child = registry.create({
      parentLineageId: founder.lineageId,
      genotypeId: 'A',
      createdAtHours: 1,
      originCellIndex: null,
      mutationClass: 'target',
    })
    registry.create({
      parentLineageId: child.lineageId,
      genotypeId: 'AB',
      createdAtHours: 2,
      originCellIndex: null,
      mutationClass: 'second-step',
    })
    const checkpoint = registry.checkpoint()

    const sparseRecordCases = [
      (() => {
        const records = [...checkpoint.records]
        delete records[0]
        return records
      })(),
      (() => {
        const records = [...checkpoint.records]
        delete records[1]
        return records
      })(),
      (() => {
        const records = [...checkpoint.records]
        records.length += 1
        return records
      })(),
    ]

    for (const records of sparseRecordCases) {
      expect(() =>
        LineageRegistry.restore({
          ...checkpoint,
          nextId: records.length + 1,
          records,
        }),
      ).toThrow(/records must be dense/)
    }

    const trailingSparseEvents = [...checkpoint.events]
    trailingSparseEvents.length += 1
    expect(() =>
      LineageRegistry.restore({
        ...checkpoint,
        events: trailingSparseEvents,
      }),
    ).toThrow(/events must be dense/)

    const interiorSparseEvents = [...checkpoint.events]
    delete interiorSparseEvents[1]
    expect(() =>
      LineageRegistry.restore({
        ...checkpoint,
        events: interiorSparseEvents,
      }),
    ).toThrow(/events must be dense/)
  })

  it('rejects corrupted ancestry and mismatched extinction events', () => {
    const registry = new LineageRegistry()
    const founder = registry.create({ parentLineageId: null, genotypeId: 'WT', createdAtHours: 0, originCellIndex: null, mutationClass: null })
    const child = registry.create({ parentLineageId: founder.lineageId, genotypeId: 'A', createdAtHours: 1, originCellIndex: null, mutationClass: 'target' })
    registry.markExtinct(child.lineageId, 2)
    const checkpoint = registry.checkpoint()

    const badParent: LineageRegistryCheckpoint = {
      ...checkpoint,
      records: checkpoint.records.map((record) =>
        record.lineageId === child.lineageId
          ? { ...record, parentLineageId: 'L99' }
          : record,
      ),
    }
    expect(() => LineageRegistry.restore(badParent)).toThrow(/parent must precede child/)

    const badExtinction: LineageRegistryCheckpoint = {
      ...checkpoint,
      events: checkpoint.events.map((event) =>
        event.kind === 'lineage-extinct'
          ? { ...event, timeHours: 3 }
          : event,
      ),
    }
    expect(() => LineageRegistry.restore(badExtinction)).toThrow(/does not match record/)
  })
})
