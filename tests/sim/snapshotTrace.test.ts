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
