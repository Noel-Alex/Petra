export interface LineageOrigin {
  readonly parentLineageId: string | null
  readonly genotypeId: string
  readonly createdAtHours: number
  readonly originCellIndex: number | null
  readonly mutationClass: string | null
}

export interface LineageRecord extends LineageOrigin {
  readonly lineageId: string
  readonly extinctAtHours: number | null
}

type MutableLineageRecord = Omit<LineageRecord, 'extinctAtHours'> & {
  extinctAtHours: number | null
}

export interface LineageEvent {
  readonly kind: 'lineage-created' | 'lineage-extinct'
  readonly lineageId: string
  readonly timeHours: number
  readonly parentLineageId?: string
  readonly genotypeId?: string
}

export interface LineageRegistryCheckpoint {
  readonly version: 1
  readonly nextId: number
  readonly records: readonly LineageRecord[]
  readonly events: readonly LineageEvent[]
}

/** Deterministic ancestry registry. IDs depend only on creation order. */
export class LineageRegistry {
  private nextId = 1
  private readonly records = new Map<string, MutableLineageRecord>()
  private readonly events: LineageEvent[] = []

  create(origin: LineageOrigin): LineageRecord {
    assertOrigin(origin)
    this.assertEventTimeOrder(origin.createdAtHours)

    if (origin.parentLineageId !== null) {
      const parent = this.records.get(origin.parentLineageId)
      if (!parent) {
        throw new Error(`unknown parent lineage: ${origin.parentLineageId}`)
      }
      if (origin.createdAtHours < parent.createdAtHours) {
        throw new Error('child lineage cannot be created before its parent')
      }
    }

    const lineageId = `L${this.nextId}`
    this.nextId += 1
    const record: MutableLineageRecord = { lineageId, ...origin, extinctAtHours: null }
    this.records.set(lineageId, record)
    this.events.push({
      kind: 'lineage-created',
      lineageId,
      timeHours: origin.createdAtHours,
      ...(origin.parentLineageId === null ? {} : { parentLineageId: origin.parentLineageId }),
      genotypeId: origin.genotypeId,
    })
    return cloneRecord(record)
  }

  markExtinct(lineageId: string, timeHours: number): void {
    const record = this.records.get(lineageId)
    if (!record) throw new Error(`unknown lineage: ${lineageId}`)
    if (!Number.isFinite(timeHours) || timeHours < record.createdAtHours) {
      throw new Error('extinction time must be finite and no earlier than lineage creation')
    }
    if (record.extinctAtHours !== null) return
    this.assertEventTimeOrder(timeHours)
    record.extinctAtHours = timeHours
    this.events.push({ kind: 'lineage-extinct', lineageId, timeHours })
  }

  get(lineageId: string): LineageRecord | undefined {
    const record = this.records.get(lineageId)
    return record === undefined ? undefined : cloneRecord(record)
  }

  list(): readonly LineageRecord[] {
    return [...this.records.values()].map(cloneRecord)
  }

  eventLog(): readonly LineageEvent[] {
    return this.events.map(cloneEvent)
  }

  private assertEventTimeOrder(timeHours: number): void {
    const previous = this.events.at(-1)
    if (previous !== undefined && timeHours < previous.timeHours) {
      throw new Error('lineage event time cannot precede the previously emitted event')
    }
  }

  /**
   * Returns an isolated, serializable checkpoint of replay-critical lineage state.
   *
   * The allocator state is authoritative: restoring records without nextId would
   * restart lineage identity and diverge future event streams.
   */
  checkpoint(): LineageRegistryCheckpoint {
    return {
      version: 1,
      nextId: this.nextId,
      records: [...this.records.values()].map(cloneRecord),
      events: this.events.map(cloneEvent),
    }
  }

  static restore(checkpoint: LineageRegistryCheckpoint): LineageRegistry {
    validateCheckpoint(checkpoint)

    const registry = new LineageRegistry()
    registry.nextId = checkpoint.nextId

    for (const record of checkpoint.records) {
      registry.records.set(record.lineageId, cloneRecord(record))
    }
    registry.events.push(...checkpoint.events.map(cloneEvent))

    return registry
  }
}

function assertOrigin(origin: LineageOrigin): void {
  if (!origin.genotypeId || !Number.isFinite(origin.createdAtHours) || origin.createdAtHours < 0) {
    throw new Error('lineage origin requires a genotype and non-negative finite creation time')
  }
  if (origin.originCellIndex !== null && (!Number.isSafeInteger(origin.originCellIndex) || origin.originCellIndex < 0)) {
    throw new Error('originCellIndex must be null or a non-negative safe integer')
  }
  if (origin.mutationClass !== null && (!origin.mutationClass || origin.mutationClass.trim().length === 0)) {
    throw new Error('mutationClass must be null or a non-empty string')
  }
}

function validateCheckpoint(checkpoint: LineageRegistryCheckpoint): void {
  if (checkpoint.version !== 1) {
    throw new Error('unsupported lineage checkpoint version')
  }
  if (!Number.isSafeInteger(checkpoint.nextId) || checkpoint.nextId < 1) {
    throw new Error('lineage checkpoint nextId must be a positive safe integer')
  }
  if (!Array.isArray(checkpoint.records) || !Array.isArray(checkpoint.events)) {
    throw new Error('lineage checkpoint records and events must be arrays')
  }
  assertDenseCheckpointArray(checkpoint.records, 'records')
  assertDenseCheckpointArray(checkpoint.events, 'events')

  const records = new Map<string, LineageRecord>()

  checkpoint.records.forEach((rawRecord, index) => {
    const record = decodeCheckpointRecord(rawRecord, index)

    const expectedId = `L${index + 1}`
    if (record.lineageId !== expectedId) {
      throw new Error(
        `lineage checkpoint records must preserve creation order; expected ${expectedId}`,
      )
    }
    if (records.has(record.lineageId)) {
      throw new Error(`duplicate lineage id in checkpoint: ${record.lineageId}`)
    }

    assertOrigin(record)

    if (record.parentLineageId !== null) {
      const parent = records.get(record.parentLineageId)
      if (!parent) {
        throw new Error(
          `lineage checkpoint parent must precede child: ${record.parentLineageId}`,
        )
      }
      if (record.createdAtHours < parent.createdAtHours) {
        throw new Error('checkpoint child lineage cannot be created before its parent')
      }
    }

    if (
      record.extinctAtHours !== null &&
      (!Number.isFinite(record.extinctAtHours) ||
        record.extinctAtHours < record.createdAtHours)
    ) {
      throw new Error(
        `lineage ${record.lineageId} has invalid extinction time in checkpoint`,
      )
    }

    records.set(record.lineageId, record)
  })

  const expectedNextId = checkpoint.records.length + 1
  if (checkpoint.nextId !== expectedNextId) {
    throw new Error(
      `lineage checkpoint nextId must be ${expectedNextId} after ${checkpoint.records.length} records`,
    )
  }

  const created = new Set<string>()
  const extinct = new Set<string>()

  let previousEventTime = -Infinity
  checkpoint.events.forEach((rawEvent, index) => {
    const event = decodeCheckpointEvent(rawEvent, index)

    const record = records.get(event.lineageId)
    if (!record) {
      throw new Error(
        `lineage checkpoint event references unknown lineage: ${event.lineageId}`,
      )
    }
    if (!Number.isFinite(event.timeHours) || event.timeHours < 0) {
      throw new Error(`lineage checkpoint event ${index} has invalid time`)
    }
    if (event.timeHours < previousEventTime) {
      throw new Error(`lineage checkpoint event ${index} backdates authoritative event order`)
    }
    previousEventTime = event.timeHours

    if (event.kind === 'lineage-created') {
      if (created.has(event.lineageId)) {
        throw new Error(`duplicate lineage-created event: ${event.lineageId}`)
      }
      if (
        record.parentLineageId !== null &&
        !created.has(record.parentLineageId)
      ) {
        throw new Error(
          `parent creation event must precede child: ${record.parentLineageId}`,
        )
      }
      if (
        event.timeHours !== record.createdAtHours ||
        event.genotypeId !== record.genotypeId ||
        (event.parentLineageId ?? null) !== record.parentLineageId
      ) {
        throw new Error(
          `lineage-created event does not match record: ${event.lineageId}`,
        )
      }
      created.add(event.lineageId)
      return
    }

    if (!created.has(event.lineageId)) {
      throw new Error(
        `lineage-extinct event precedes creation: ${event.lineageId}`,
      )
    }
    if (extinct.has(event.lineageId)) {
      throw new Error(`duplicate lineage-extinct event: ${event.lineageId}`)
    }
    if (
      record.extinctAtHours === null ||
      event.timeHours !== record.extinctAtHours
    ) {
      throw new Error(
        `lineage-extinct event does not match record: ${event.lineageId}`,
      )
    }
    extinct.add(event.lineageId)
  })

  for (const record of checkpoint.records) {
    if (!created.has(record.lineageId)) {
      throw new Error(
        `lineage checkpoint is missing creation event: ${record.lineageId}`,
      )
    }
    if (
      record.extinctAtHours !== null &&
      !extinct.has(record.lineageId)
    ) {
      throw new Error(
        `lineage checkpoint is missing extinction event: ${record.lineageId}`,
      )
    }
    if (record.extinctAtHours === null && extinct.has(record.lineageId)) {
      throw new Error(
        `live lineage has an extinction event: ${record.lineageId}`,
      )
    }
  }
}

function assertDenseCheckpointArray(
  values: readonly unknown[],
  field: 'records' | 'events',
): void {
  for (let index = 0; index < values.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(values, index)) {
      throw new Error(
        `lineage checkpoint ${field} must be dense; missing index ${index}`,
      )
    }
  }
}

function decodeCheckpointRecord(value: unknown, index: number): LineageRecord {
  if (!isRecord(value)) {
    throw new Error(`lineage checkpoint record ${index} must be an object`)
  }

  if (typeof value.lineageId !== 'string' || value.lineageId.length === 0) {
    throw new Error(`lineage checkpoint record ${index} requires a lineageId`)
  }
  if (
    value.parentLineageId !== null &&
    typeof value.parentLineageId !== 'string'
  ) {
    throw new Error(
      `lineage checkpoint record ${index} has invalid parentLineageId`,
    )
  }
  if (typeof value.genotypeId !== 'string') {
    throw new Error(`lineage checkpoint record ${index} has invalid genotypeId`)
  }
  if (typeof value.createdAtHours !== 'number') {
    throw new Error(
      `lineage checkpoint record ${index} has invalid createdAtHours`,
    )
  }
  if (
    value.originCellIndex !== null &&
    typeof value.originCellIndex !== 'number'
  ) {
    throw new Error(
      `lineage checkpoint record ${index} has invalid originCellIndex`,
    )
  }
  if (
    value.mutationClass !== null &&
    typeof value.mutationClass !== 'string'
  ) {
    throw new Error(
      `lineage checkpoint record ${index} has invalid mutationClass`,
    )
  }
  if (
    value.extinctAtHours !== null &&
    typeof value.extinctAtHours !== 'number'
  ) {
    throw new Error(
      `lineage checkpoint record ${index} has invalid extinctAtHours`,
    )
  }

  return value as unknown as LineageRecord
}

function decodeCheckpointEvent(value: unknown, index: number): LineageEvent {
  if (!isRecord(value)) {
    throw new Error(`lineage checkpoint event ${index} must be an object`)
  }
  if (value.kind !== 'lineage-created' && value.kind !== 'lineage-extinct') {
    throw new Error(`lineage checkpoint event ${index} has an invalid kind`)
  }
  if (typeof value.lineageId !== 'string' || value.lineageId.length === 0) {
    throw new Error(`lineage checkpoint event ${index} requires a lineageId`)
  }
  if (typeof value.timeHours !== 'number') {
    throw new Error(`lineage checkpoint event ${index} has invalid time`)
  }
  if (
    value.parentLineageId !== undefined &&
    typeof value.parentLineageId !== 'string'
  ) {
    throw new Error(
      `lineage checkpoint event ${index} has invalid parentLineageId`,
    )
  }
  if (
    value.genotypeId !== undefined &&
    typeof value.genotypeId !== 'string'
  ) {
    throw new Error(
      `lineage checkpoint event ${index} has invalid genotypeId`,
    )
  }

  return value as unknown as LineageEvent
}

function cloneRecord(record: LineageRecord): MutableLineageRecord {
  return {
    lineageId: record.lineageId,
    parentLineageId: record.parentLineageId,
    genotypeId: record.genotypeId,
    createdAtHours: record.createdAtHours,
    originCellIndex: record.originCellIndex,
    mutationClass: record.mutationClass,
    extinctAtHours: record.extinctAtHours,
  }
}

function cloneEvent(event: LineageEvent): LineageEvent {
  return {
    kind: event.kind,
    lineageId: event.lineageId,
    timeHours: event.timeHours,
    ...(event.parentLineageId === undefined
      ? {}
      : { parentLineageId: event.parentLineageId }),
    ...(event.genotypeId === undefined ? {} : { genotypeId: event.genotypeId }),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
