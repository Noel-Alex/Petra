import type {
  SimulationCheckpoint,
  SimulationEvent,
  SimulationSnapshot,
} from './protocol'

export const SNAPSHOT_TRACE_ALGORITHM = 'fnv1a32-stable-json-v1' as const

export class SnapshotTraceMismatchError extends Error {
  readonly code = 'snapshot-trace-mismatch' as const
  readonly expectedTraceHash: string
  readonly actualTraceHash: string

  constructor(args: {
    readonly expectedTraceHash: string
    readonly actualTraceHash: string
  }) {
    super(
      `simulation snapshot trace mismatch: expected ${args.expectedTraceHash}, received ${args.actualTraceHash}`,
    )
    this.name = 'SnapshotTraceMismatchError'
    this.expectedTraceHash = args.expectedTraceHash
    this.actualTraceHash = args.actualTraceHash
  }
}

/**
 * Stable object-key canonicalizer used by Petra's replay trace identity.
 *
 * This intentionally preserves the exact pre-#438 serialization contract so
 * existing trace hashes do not change when ownership moves out of the engines.
 */
export function stableSnapshotStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const encoded = JSON.stringify(value)
    if (encoded === undefined) {
      throw new TypeError(
        'snapshot trace payload contains a non-JSON primitive value',
      )
    }
    return encoded
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableSnapshotStringify).join(',')}]`
  }
  const object = value as Record<string, unknown>
  return `{${Object.keys(object)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${stableSnapshotStringify(object[key])}`,
    )
    .join(',')}}`
}

/** FNV-1a 32-bit regression identity. It is deterministic, not cryptographic. */
export function snapshotTraceHash(value: unknown): string {
  const text = stableSnapshotStringify(value)
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

export function simulationSnapshotTraceHash(args: {
  readonly checkpoint: SimulationCheckpoint
  readonly events: readonly SimulationEvent[]
}): string {
  return snapshotTraceHash({
    checkpoint: args.checkpoint,
    events: args.events,
  })
}

export function assertSimulationSnapshotTrace(
  snapshot: SimulationSnapshot,
): void {
  const expectedTraceHash = simulationSnapshotTraceHash({
    checkpoint: snapshot.checkpoint,
    events: snapshot.events,
  })
  if (snapshot.traceHash !== expectedTraceHash) {
    throw new SnapshotTraceMismatchError({
      expectedTraceHash,
      actualTraceHash: snapshot.traceHash,
    })
  }
}
