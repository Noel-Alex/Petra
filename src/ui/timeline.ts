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
  return snapshot.events.map(projectEvent)
}

function projectEvent(event: SimulationEvent): TimelineEntry {
  if (!Number.isFinite(event.simulationTimeHours) || event.simulationTimeHours < 0) {
    throw new RangeError('event.simulationTimeHours must be finite and non-negative')
  }

  const base = {
    id: `event-${event.sequence}`,
    sequence: event.sequence,
    tick: event.tick,
    simulationTimeHours: event.simulationTimeHours,
    ...(event.commandId === undefined ? {} : { commandId: event.commandId }),
    ...(event.value === undefined ? {} : { value: event.value }),
  }

  if (event.type === 'initialized') return { ...base, kind: 'run', label: 'Run initialized' }
  if (event.type === 'advanced') return { ...base, kind: 'advance', label: `Advanced ${event.value ?? 0} tick(s)` }
  if (event.type === 'restored') return { ...base, kind: 'restore', label: 'Checkpoint restored' }
  return { ...base, kind: 'intervention', label: 'Synthetic intervention' }
}
