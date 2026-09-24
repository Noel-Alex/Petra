import type { SimulationSnapshot } from './protocol'

export function stableReplayStringify(value: unknown): string | undefined {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) {
    return `[${value.map(stableReplayStringify).join(',')}]`
  }
  const object = value as Record<string, unknown>
  return `{${Object.keys(object)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${stableReplayStringify(object[key])}`,
    )
    .join(',')}}`
}

/**
 * Canonical FNV-1a 32-bit snapshot trace checksum.
 *
 * This is deterministic replay/provenance identity, not a security hash.
 * Centralizing the existing serializer + checksum prevents emitters and
 * verifiers from drifting into different trace contracts.
 */
export function simulationSnapshotTraceHash(
  snapshot: Pick<SimulationSnapshot, 'checkpoint' | 'events'>,
): string {
  const text = stableReplayStringify({
    checkpoint: snapshot.checkpoint,
    events: snapshot.events,
  })
  if (text === undefined) {
    throw new Error('simulation snapshot trace payload is not serializable')
  }

  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

export function assertSimulationSnapshotTrace(
  snapshot: SimulationSnapshot,
): void {
  if (
    typeof snapshot.traceHash !== 'string' ||
    snapshot.traceHash !== simulationSnapshotTraceHash(snapshot)
  ) {
    throw new Error('simulation snapshot trace hash does not match its payload')
  }
}
