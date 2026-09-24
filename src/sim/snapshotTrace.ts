import type { SimulationSnapshot } from './protocol'

function stableStringify(value: unknown) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const object = value as Record<string, unknown>
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`)
    .join(',')}}`
}

/**
 * Canonical FNV-1a 32-bit snapshot trace checksum.
 *
 * This is replay/provenance identity, not a security hash. Its serialization and
 * hash algorithm are deliberately centralized so engine snapshots and any
 * verifier cannot drift into different trace contracts.
 */
export function simulationSnapshotTraceHash(
  snapshot: Pick<SimulationSnapshot, 'checkpoint' | 'events'>,
): string {
  const text = stableStringify({
    checkpoint: snapshot.checkpoint,
    events: snapshot.events,
  })
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
