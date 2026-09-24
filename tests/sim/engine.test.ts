import { describe, expect, it } from 'vitest'
import { SimulationEngine } from '../../src/sim/engine'
import { createRunIdentity } from '../../src/sim/protocol'
import { SimulationRng } from '../../src/sim/rng'

const identity = createRunIdentity({
  scenarioId: 'synthetic-core-fixture',
  scenarioVersion: '1',
  parameterSetId: 'none',
  parameterSetVersion: '1',
  seed: 0x5eed1234,
})

describe('SimulationRng', () => {
  it('replays exactly from serialized state', () => {
    const rng = new SimulationRng(42)
    const prefix = Array.from({ length: 8 }, () => rng.nextUint32())
    const state = rng.snapshot()
    const suffix = Array.from({ length: 8 }, () => rng.nextUint32())
    const restored = new SimulationRng(state)

    expect(prefix).not.toEqual(suffix)
    expect(Array.from({ length: 8 }, () => restored.nextUint32())).toEqual(suffix)
  })
})

describe('SimulationEngine replay substrate', () => {
  it('produces identical trace hashes for identical seed and ordered commands', () => {
    const commands = [
      { id: 'advance-1', type: 'advance' as const, ticks: 120 },
      { id: 'pulse-1', type: 'synthetic-pulse' as const, magnitude: 25 },
      { id: 'advance-2', type: 'advance' as const, ticks: 60 },
    ]
    const first = new SimulationEngine(identity)
    const second = new SimulationEngine(identity)

    for (const command of commands) {
      first.execute(command)
      second.execute(command)
    }

    expect(first.snapshot()).toEqual(second.snapshot())
    expect(first.snapshot().traceHash).toBe(second.snapshot().traceHash)
  })

  it('restores RNG and numeric state so future evolution matches the original branch', () => {
    const original = new SimulationEngine(identity)
    original.execute({ id: 'warmup', type: 'advance', ticks: 75 })
    const checkpoint = original.snapshot().checkpoint
    original.execute({ id: 'future', type: 'advance', ticks: 50 })
    const expected = original.snapshot().checkpoint

    const restored = new SimulationEngine(identity)
    restored.execute({ id: 'restore', type: 'restore', checkpoint })
    restored.execute({ id: 'future', type: 'advance', ticks: 50 })
    const actual = restored.snapshot().checkpoint

    expect(actual.tick).toBe(expected.tick)
    expect(actual.syntheticPopulation).toBe(expected.syntheticPopulation)
    expect(actual.rngState).toEqual(expected.rngState)
  })

  it('rejects checkpoints belonging to another run identity', () => {
    const source = new SimulationEngine(identity)
    const checkpoint = source.snapshot().checkpoint
    const other = new SimulationEngine({ ...identity, seed: identity.seed + 1 })

    expect(() => other.execute({ id: 'restore', type: 'restore', checkpoint })).toThrow(/different run identity/)
  })
})
