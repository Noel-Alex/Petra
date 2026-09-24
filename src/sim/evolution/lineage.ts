export interface LineageOrigin {
  readonly parentLineageId: string | null
  readonly genotypeId: string
  readonly createdAtHours: number
  readonly originCellIndex: number | null
  readonly mutationClass: string | null
}

export interface LineageRecord extends LineageOrigin {
  readonly lineageId: string
  extinctAtHours: number | null
}

export interface LineageEvent {
  readonly kind: 'lineage-created' | 'lineage-extinct'
  readonly lineageId: string
  readonly timeHours: number
  readonly parentLineageId?: string
  readonly genotypeId?: string
}

/** Deterministic ancestry registry. IDs depend only on creation order. */
export class LineageRegistry {
  private nextId = 1
  private readonly records = new Map<string, LineageRecord>()
  private readonly events: LineageEvent[] = []

  create(origin: LineageOrigin): LineageRecord {
    if (!origin.genotypeId || !Number.isFinite(origin.createdAtHours) || origin.createdAtHours < 0) {
      throw new Error('lineage origin requires a genotype and non-negative finite creation time')
    }
    if (origin.parentLineageId !== null && !this.records.has(origin.parentLineageId)) {
      throw new Error(`unknown parent lineage: ${origin.parentLineageId}`)
    }
    if (origin.originCellIndex !== null && (!Number.isSafeInteger(origin.originCellIndex) || origin.originCellIndex < 0)) {
      throw new Error('originCellIndex must be null or a non-negative safe integer')
    }

    const lineageId = `L${this.nextId}`
    this.nextId += 1
    const record: LineageRecord = { lineageId, ...origin, extinctAtHours: null }
    this.records.set(lineageId, record)
    this.events.push({
      kind: 'lineage-created',
      lineageId,
      timeHours: origin.createdAtHours,
      ...(origin.parentLineageId === null ? {} : { parentLineageId: origin.parentLineageId }),
      genotypeId: origin.genotypeId,
    })
    return record
  }

  markExtinct(lineageId: string, timeHours: number): void {
    const record = this.records.get(lineageId)
    if (!record) throw new Error(`unknown lineage: ${lineageId}`)
    if (!Number.isFinite(timeHours) || timeHours < record.createdAtHours) {
      throw new Error('extinction time must be finite and no earlier than lineage creation')
    }
    if (record.extinctAtHours !== null) return
    record.extinctAtHours = timeHours
    this.events.push({ kind: 'lineage-extinct', lineageId, timeHours })
  }

  get(lineageId: string): LineageRecord | undefined {
    return this.records.get(lineageId)
  }

  list(): readonly LineageRecord[] {
    return [...this.records.values()]
  }

  eventLog(): readonly LineageEvent[] {
    return [...this.events]
  }
}
