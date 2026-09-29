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

/**
 * Per-node memo for the trace canonicalizer.
 *
 * `null` records a verified *negative* verdict so a mutable node is never
 * re-tested. Verdicts are remembered for the lifetime of the node, so the deep
 * immutability probe costs O(node) exactly once and then O(1) per hash.
 */
const canonicalTraceText = new WeakMap<object, string | null>()

function isDeepFrozen(value: unknown): boolean {
  if (value === null || typeof value !== 'object') {
    return true
  }
  if (!Object.isFrozen(value)) {
    return false
  }
  for (const nested of Object.values(value as Record<string, unknown>)) {
    if (!isDeepFrozen(nested)) {
      return false
    }
  }
  return true
}

/**
 * Canonical trace text for a node that can never change again, or `null` when
 * the node must keep the incremental walk because something inside it is
 * still mutable.
 */
function canonicalFrozenTraceText(node: object): string | null {
  const cached = canonicalTraceText.get(node)
  if (cached !== undefined) {
    return cached
  }
  const verdict = isDeepFrozen(node) ? stableSnapshotStringify(node) : null
  canonicalTraceText.set(node, verdict)
  return verdict
}

/** FNV-1a 32-bit regression identity. It is deterministic, not cryptographic. */
export function snapshotTraceHash(value: unknown): string {
  let hash = 0x811c9dc5

  const write = (text: string): void => {
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index)
      hash = Math.imul(hash, 0x01000193) >>> 0
    }
  }

  /**
   * Stream the exact historical stableSnapshotStringify() token sequence into
   * FNV rather than first allocating one canonical string for the complete
   * checkpoint + retained event history. This intentionally mirrors the old
   * serializer, including sparse-array join semantics and lexicographically
   * sorted Object.keys(), so SNAPSHOT_TRACE_ALGORITHM remains byte-for-byte
   * compatible.
   */
  const visit = (current: unknown): void => {
    if (current === null || typeof current !== 'object') {
      const encoded = JSON.stringify(current)
      if (encoded === undefined) {
        throw new TypeError(
          'snapshot trace payload contains a non-JSON primitive value',
        )
      }
      write(encoded)
      return
    }

    if (Array.isArray(current)) {
      write('[')
      for (let index = 0; index < current.length; index += 1) {
        if (index > 0) write(',')
        // Array.prototype.map() skips holes in the historical implementation;
        // join(',') then emits only the separator for that slot.
        if (index in current) {
          visit(current[index])
        }
      }
      write(']')
      return
    }

    // Accepted event histories are append-only and deep-frozen, so the exact
    // canonical bytes of a deeply frozen node can never change again. The
    // retained history is re-hashed on every accepted command, so without this
    // memo every command re-runs Object.keys().sort() plus JSON.stringify over
    // the whole history. Cached text goes through the same charCodeAt loop, so
    // SNAPSHOT_TRACE_ALGORITHM stays byte-for-byte identical.
    const frozenText = canonicalFrozenTraceText(current)
    if (frozenText !== null) {
      write(frozenText)
      return
    }

    write('{')
    const object = current as Record<string, unknown>
    const keys = Object.keys(object).sort()
    for (let index = 0; index < keys.length; index += 1) {
      if (index > 0) write(',')
      const key = keys[index]!
      write(JSON.stringify(key))
      write(':')
      visit(object[key])
    }
    write('}')
  }

  visit(value)
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
