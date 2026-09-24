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

  it('remains finite, non-negative, and replay-identical through a long synthetic soak', () => {
    const first = new SimulationEngine(identity)
    const second = new SimulationEngine(identity)
    const chunks = 100
    const ticksPerChunk = 1_000

    for (let chunk = 0; chunk < chunks; chunk += 1) {
      const command = { id: `soak-${chunk}`, type: 'advance' as const, ticks: ticksPerChunk }
      first.execute(command)
      second.execute(command)

      const checkpoint = first.snapshot().checkpoint
      expect(checkpoint.tick).toBe((chunk + 1) * ticksPerChunk)
      expect(Number.isFinite(checkpoint.simulationTimeHours)).toBe(true)
      expect(Number.isFinite(checkpoint.syntheticPopulation)).toBe(true)
      expect(checkpoint.syntheticPopulation).toBeGreaterThanOrEqual(0)
      expect(checkpoint.rngState.every((value) => Number.isInteger(value) && value >= 0 && value <= 0xffff_ffff)).toBe(true)
    }

    expect(first.snapshot()).toEqual(second.snapshot())
  })

  it('rejects non-finite synthetic pulses before they can contaminate state', () => {
    const engine = new SimulationEngine(identity)

    for (const magnitude of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() =>
        engine.execute({ id: `non-finite-${String(magnitude)}`, type: 'synthetic-pulse', magnitude }),
      ).toThrow(/must be finite/)
    }

    const checkpoint = engine.snapshot().checkpoint
    expect(checkpoint.syntheticPopulation).toBe(1_000)
    expect(Number.isFinite(checkpoint.syntheticPopulation)).toBe(true)
  })
})
