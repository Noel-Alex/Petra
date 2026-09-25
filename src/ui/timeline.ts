import type { SimulationEvent, SimulationSnapshot } from '../sim/protocol'
import { stableSnapshotStringify } from '../sim/snapshotTrace'

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

export interface ScientificTimelineUpdate {
  readonly timeline: readonly TimelineEntry[]
  /**
   * Authoritative event suffix proven to be newly appended. On a history
   * discontinuity this is empty: timeline presentation may rebuild, but command
   * confirmation must not trust an ambiguous historical prefix.
   */
  readonly appendedEvents: readonly SimulationEvent[]
  readonly rebuilt: boolean
}

export function buildScientificTimeline(
  snapshot: SimulationSnapshot,
): readonly TimelineEntry[] {
  validateEventSequenceIdentity(snapshot.events)
  return snapshot.events.map(projectEvent)
}

/**
 * Incrementally project an already-validated append-only event history.
 *
 * The previous prefix was validated when it entered runtime state. Ordinary
 * accepted commands therefore need only an O(1) retained-boundary proof plus
 * validation/projection of the newly appended suffix. If the retained boundary,
 * history length, or timeline cardinality disagrees, rebuild from the complete
 * authoritative event list instead of guessing that the histories match.
 */
export function updateScientificTimeline(args: {
  readonly previousTimeline: readonly TimelineEntry[]
  readonly previousEvents: readonly SimulationEvent[]
  readonly nextEvents: readonly SimulationEvent[]
}): ScientificTimelineUpdate {
  const { previousTimeline, previousEvents, nextEvents } = args

  if (
    previousTimeline.length !== previousEvents.length ||
    nextEvents.length < previousEvents.length ||
    !retainedBoundaryMatches(previousEvents, nextEvents)
  ) {
    return rebuildScientificTimeline(nextEvents)
  }

  const suffix = nextEvents.slice(previousEvents.length)
  if (suffix.length === 0) {
    return Object.freeze({
      timeline: previousTimeline,
      appendedEvents: Object.freeze([]),
      rebuilt: false,
    })
  }

  const previousSequence =
    previousEvents.length === 0
      ? null
      : previousEvents[previousEvents.length - 1]!.sequence
  validateEventSequenceSuffix(suffix, previousSequence)
  const appendedEntries = suffix.map(projectEvent)

  return Object.freeze({
    timeline: Object.freeze([...previousTimeline, ...appendedEntries]),
    appendedEvents: Object.freeze(suffix),
    rebuilt: false,
  })
}

function rebuildScientificTimeline(
  events: readonly SimulationEvent[],
): ScientificTimelineUpdate {
  validateEventSequenceIdentity(events)
  return Object.freeze({
    timeline: Object.freeze(events.map(projectEvent)),
    appendedEvents: Object.freeze([]),
    rebuilt: true,
  })
}

function retainedBoundaryMatches(
  previousEvents: readonly SimulationEvent[],
  nextEvents: readonly SimulationEvent[],
): boolean {
  if (previousEvents.length === 0) return true

  const index = previousEvents.length - 1
  const previous = previousEvents[index]
  const next = nextEvents[index]
  return (
    previous !== undefined &&
    next !== undefined &&
    previous.sequence === next.sequence &&
    stableSnapshotStringify(previous) === stableSnapshotStringify(next)
  )
}

function validateEventSequenceIdentity(events: readonly SimulationEvent[]): void {
  validateEventSequenceSuffix(events, null)
}

function validateEventSequenceSuffix(
  events: readonly SimulationEvent[],
  previousSequence: number | null,
): void {
  let prior = previousSequence

  for (const event of events) {
    if (!Number.isSafeInteger(event.sequence) || event.sequence < 0) {
      throw new RangeError(
        'event sequence must be a non-negative safe integer',
      )
    }

    if (prior !== null && event.sequence <= prior) {
      if (event.sequence === prior) {
        throw new RangeError(
          `duplicate authoritative event sequence: ${event.sequence}`,
        )
      }
      throw new RangeError(
        'authoritative event sequences must be strictly increasing',
      )
    }

    prior = event.sequence
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
  if (event.type === 'ciprofloxacin-applied') {
    const intervention = event.intervention
    if (intervention === undefined) {
      throw new Error(
        `ciprofloxacin event ${event.sequence} is missing intervention authority`,
      )
    }
    return {
      ...base,
      kind: 'intervention',
      label:
        `Ciprofloxacin ${intervention.blendMode} ` +
        `${intervention.concentrationMgPerL} ${intervention.concentrationUnit} ` +
        `(${intervention.geometry.kind})`,
    }
  }
  return { ...base, kind: 'intervention', label: 'Synthetic intervention' }
}
