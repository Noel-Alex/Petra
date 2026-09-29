import { describe, expect, it } from 'vitest'

import {
  EMPTY_SIMULATION_EVENT_HISTORY,
  appendSimulationEventHistory,
} from '../../src/sim/eventHistory'
import { SimulationEngine } from '../../src/sim/engine'
import { createRunIdentity } from '../../src/sim/protocol'
import {
  SnapshotTraceMismatchError,
  assertSimulationSnapshotTrace,
  simulationSnapshotTraceHash,
  snapshotTraceHash,
  stableSnapshotStringify,
} from '../../src/sim/snapshotTrace'

describe('canonical simulation snapshot trace authority', () => {
  it('preserves the historical stable-stringify + FNV-1a trace contract', () => {
    const value = {
      checkpoint: {
        tick: 1,
        population: 1000,
      },
      events: [
        {
          type: 'initialized',
          sequence: 0,
        },
      ],
    }

    expect(stableSnapshotStringify(value)).toBe(
      '{"checkpoint":{"population":1000,"tick":1},"events":[{"sequence":0,"type":"initialized"}]}',
    )
    expect(snapshotTraceHash(value)).toBe('e3d420e1')
  })

  it('streams the exact historical stable-stringify FNV token sequence', () => {
    const legacyHash = (value: unknown): string => {
      const text = stableSnapshotStringify(value)
      let hash = 0x811c9dc5
      for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index)
        hash = Math.imul(hash, 0x01000193) >>> 0
      }
      return hash.toString(16).padStart(8, '0')
    }

    const sparse = Array(3) as unknown[]
    sparse[0] = 'first'
    sparse[2] = -0

    const fixtures: unknown[] = [
      null,
      true,
      'unicode-🧫-\\n-"quoted"',
      -0,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      sparse,
      {
        z: [3, 2, 1],
        a: {
          later: 'value',
          earlier: 0.125,
        },
      },
      new Float32Array([0, 0.125, -0, 3.5]),
      {
        checkpoint: {
          tick: 7,
          rngState: [1, 2, 3, 4],
          fields: new Float32Array([0, 1, 2, 3]),
        },
        events: Array.from({ length: 128 }, (_, sequence) => ({
          sequence,
          type: sequence === 0 ? 'initialized' : 'advanced',
          tick: sequence,
          simulationTimeHours: sequence * 0.02,
        })),
      },
    ]

    for (const fixture of fixtures) {
      expect(snapshotTraceHash(fixture)).toBe(legacyHash(fixture))
    }
  })

  it('preserves historical refusal for non-JSON primitive values', () => {
    expect(() => snapshotTraceHash(undefined)).toThrow(
      /non-JSON primitive value/,
    )
    expect(() => snapshotTraceHash(Symbol('invalid'))).toThrow(
      /non-JSON primitive value/,
    )
  })

  it('verifies real engine snapshots and rejects swapped trace identity', () => {
    const identity = createRunIdentity({
      scenarioId: 'snapshot-trace-fixture',
      scenarioVersion: '1',
      parameterSetId: 'none',
      parameterSetVersion: '1',
      seed: 11,
    })

    const firstEngine = new SimulationEngine(identity)
    firstEngine.execute({ id: 'advance', type: 'advance', ticks: 2 })
    const first = firstEngine.snapshot()

    expect(
      simulationSnapshotTraceHash({
        checkpoint: first.checkpoint,
        events: first.events,
      }),
    ).toBe(first.traceHash)
    expect(() => assertSimulationSnapshotTrace(first)).not.toThrow()

    const secondEngine = new SimulationEngine(identity)
    secondEngine.execute({
      id: 'pulse',
      type: 'synthetic-pulse',
      magnitude: 5,
    })
    const second = secondEngine.snapshot()

    const forged = structuredClone(first)
    forged.traceHash = second.traceHash

    expect(() => assertSimulationSnapshotTrace(forged)).toThrowError(
      expect.objectContaining<Partial<SnapshotTraceMismatchError>>({
        code: 'snapshot-trace-mismatch',
        actualTraceHash: second.traceHash,
      }),
    )
  })

  it('keeps the frozen-node canonical memo byte-identical on the hot path', () => {
    const legacyHash = (value: unknown): string => {
      const text = stableSnapshotStringify(value)
      let hash = 0x811c9dc5
      for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index)
        hash = Math.imul(hash, 0x01000193) >>> 0
      }
      return hash.toString(16).padStart(8, '0')
    }

    // Accepted histories are append-only and deep-frozen, which is exactly the
    // shape the canonical memo caches. Every command supplies a new mutable
    // checkpoint, so this also proves the memo cannot leak across snapshots.
    let events = EMPTY_SIMULATION_EVENT_HISTORY
    for (let sequence = 0; sequence < 64; sequence += 1) {
      events = appendSimulationEventHistory(events, {
        sequence,
        tick: sequence * 2,
        simulationTimeHours: sequence * 0.04,
        type: sequence === 0 ? 'initialized' : 'advanced',
        commandId: 'advance',
        value: 2,
      })
    }

    for (let tick = 0; tick < 6; tick += 1) {
      const payload = { checkpoint: { tick, occupancy: tick * 3 }, events }
      expect(snapshotTraceHash(payload)).toBe(legacyHash(payload))
      expect(snapshotTraceHash(payload)).toBe(legacyHash(payload))
    }
    expect(snapshotTraceHash({ checkpoint: { tick: 0 }, events })).not.toBe(
      snapshotTraceHash({ checkpoint: { tick: 1 }, events }),
    )
  })

  it('refuses to canonical-memo a shallow-frozen node with mutable children', () => {
    const legacyHash = (value: unknown): string => {
      const text = stableSnapshotStringify(value)
      let hash = 0x811c9dc5
      for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index)
        hash = Math.imul(hash, 0x01000193) >>> 0
      }
      return hash.toString(16).padStart(8, '0')
    }

    // Object.isFrozen() is shallow. A frozen parent whose child is still
    // mutable must keep the incremental walk, otherwise the first hash would
    // freeze a stale canonical string and later mutations would be invisible.
    const child: { b: number; nested: { c: number } } = { b: 1, nested: { c: 3 } }
    const payload = Object.freeze({ a: child, tick: 1 })

    const before = snapshotTraceHash(payload)
    expect(before).toBe(legacyHash({ a: { b: 1, nested: { c: 3 } }, tick: 1 }))

    child.b = 2
    child.nested.c = 4

    const after = snapshotTraceHash(payload)
    expect(after).toBe(legacyHash({ a: { b: 2, nested: { c: 4 } }, tick: 1 }))
    expect(after).not.toBe(before)
  })
})
