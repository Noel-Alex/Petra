import type { SimulationEvent } from './protocol'

export const EMPTY_SIMULATION_EVENT_HISTORY: readonly SimulationEvent[] =
  Object.freeze([])

const historyParent = new WeakMap<
  readonly SimulationEvent[],
  readonly SimulationEvent[]
>()

/**
 * Store one authoritative event exactly once, then share that frozen record
 * across future immutable history prefixes/snapshots.
 *
 * The returned array is copy-on-write: engines replace their history reference
 * on append rather than mutating an array already exposed by an older snapshot.
 * This keeps old snapshots immutable without deep-cloning every retained event
 * for every new transaction.
 */
export function appendSimulationEventHistory(
  history: readonly SimulationEvent[],
  event: SimulationEvent,
): readonly SimulationEvent[] {
  if (event.sequence !== history.length) {
    throw new RangeError(
      'simulation event sequence must equal the append-only history length',
    )
  }

  const stored = deepFreeze(structuredClone(event))
  const next = Object.freeze([...history, stored])
  historyParent.set(next, history)
  return next
}

function deepFreeze<T>(value: T): T {
  if (
    value === null ||
    typeof value !== 'object' ||
    Object.isFrozen(value)
  ) {
    return value
  }

  for (const nested of Object.values(
    value as Record<string, unknown>,
  )) {
    deepFreeze(nested)
  }

  return Object.freeze(value)
}


/**
 * Return only the events appended between two engine-owned immutable history
 * arrays when ancestry is provable through appendSimulationEventHistory().
 *
 * This is an internal same-realm provenance check, not a wire identity. It is
 * O(number of newly appended events), never O(total retained history). A
 * restore/rebase/foreign array has no ancestry path and returns null.
 */
export function simulationEventHistoryDelta(
  previous: readonly SimulationEvent[],
  current: readonly SimulationEvent[],
): readonly SimulationEvent[] | null {
  if (current === previous) return Object.freeze([])
  if (current.length < previous.length) return null

  const reversed: SimulationEvent[] = []
  let cursor = current

  while (cursor !== previous) {
    if (cursor.length <= previous.length) return null
    const parent = historyParent.get(cursor)
    if (parent === undefined) return null
    const appended = cursor[cursor.length - 1]
    if (appended === undefined) return null
    reversed.push(appended)
    cursor = parent
  }

  reversed.reverse()
  return Object.freeze(reversed)
}
