import type { SimulationEvent } from './protocol'

export const EMPTY_SIMULATION_EVENT_HISTORY: readonly SimulationEvent[] =
  Object.freeze([])

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
  return Object.freeze([...history, stored])
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
