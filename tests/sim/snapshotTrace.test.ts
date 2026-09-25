import { describe, expect, it } from 'vitest'

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
})
