import type { SimulationEvent, SimulationSnapshot } from '../sim/protocol'

export type TimelineEntryKind = 'run' | 'advance' | 'intervention' | 'restore'

export interface TimelineEntry {
  readonly id: string
  readonly sequence: number
  readonly tick: number
  readonly simulationTimeHours: number
  readonly kind: TimelineEntryKind
  readonly label: string
  readonly commandId?: string
  readonly value?: number
}

export function buildScientificTimeline(snapshot: SimulationSnapshot): readonly TimelineEntry[] {
  validateEventSequenceIdentity(snapshot.events)
  return snapshot.events.map(projectEvent)
}

function validateEventSequenceIdentity(events: readonly SimulationEvent[]): void {
  const seen = new Set<number>()
  let previousSequence: number | null = null

  for (const event of events) {
    if (!Number.isSafeInteger(event.sequence) || event.sequence < 0) {
      throw new RangeError(
        'event sequence must be a non-negative safe integer',
      )
    }

    if (seen.has(event.sequence)) {
      throw new RangeError(
        `duplicate authoritative event sequence: ${event.sequence}`,
      )
    }

    if (previousSequence !== null && event.sequence < previousSequence) {
      throw new RangeError(
        'authoritative event sequences must be strictly increasing',
      )
    }

    seen.add(event.sequence)
    previousSequence = event.sequence
  }
}

function projectEvent(event: SimulationEvent): TimelineEntry {
  if (!Number.isFinite(event.simulationTimeHours) || event.simulationTimeHours < 0) {
    throw new RangeError(
      `event ${event.sequence} simulationTimeHours must be finite and non-negative`,
    )
  }

  const simulationTimeHours = event.simulationTimeHours
  const base = {
    id: `event-${event.sequence}`,
    sequence: event.sequence,
    tick: event.tick,
    simulationTimeHours,
    ...(event.commandId === undefined ? {} : { commandId: event.commandId }),
    ...(event.value === undefined ? {} : { value: event.value }),
  }

  if (event.type === 'initialized') return { ...base, kind: 'run', label: 'Run initialized' }
  if (event.type === 'advanced') return { ...base, kind: 'advance', label: `Advanced ${event.value ?? 0} tick(s)` }
  if (event.type === 'restored') return { ...base, kind: 'restore', label: 'Checkpoint restored' }
  return { ...base, kind: 'intervention', label: 'Synthetic intervention' }
}
