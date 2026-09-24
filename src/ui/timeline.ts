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
  return snapshot.events.map((event) => projectEvent(event, snapshot.checkpoint.tick, snapshot.checkpoint.simulationTimeHours))
}

function projectEvent(
  event: SimulationEvent,
  currentTick: number,
  currentTimeHours: number,
): TimelineEntry {
  const simulationTimeHours = currentTick === 0 ? 0 : (event.tick / currentTick) * currentTimeHours
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
