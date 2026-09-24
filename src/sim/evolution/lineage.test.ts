import { describe, expect, it } from 'vitest'
import { LineageRegistry } from './lineage'

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

  it('rejects children with unknown parents', () => {
    const registry = new LineageRegistry()
    expect(() => registry.create({ parentLineageId: 'L99', genotypeId: 'A', createdAtHours: 1, originCellIndex: null, mutationClass: null })).toThrow(/unknown parent/)
  })

  it('emits extinction once even when pruning calls repeat', () => {
    const registry = new LineageRegistry()
    const lineage = registry.create({ parentLineageId: null, genotypeId: 'WT', createdAtHours: 0, originCellIndex: null, mutationClass: null })
    registry.markExtinct(lineage.lineageId, 1)
    registry.markExtinct(lineage.lineageId, 2)
    expect(registry.eventLog().filter((event) => event.kind === 'lineage-extinct')).toHaveLength(1)
    expect(registry.get(lineage.lineageId)?.extinctAtHours).toBe(1)
  })
})
